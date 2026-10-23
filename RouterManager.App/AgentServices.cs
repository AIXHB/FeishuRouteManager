using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using RouterManager.Core;
namespace RouterManager.App;

public sealed partial class RouterBackend
{
    public UserPreferences Preferences {get;private set;}
    private static readonly JsonSerializerOptions AgentJson=new(){PropertyNameCaseInsensitive=true};
    public string? LastAuditError {get;private set;}
    public void SavePreferences(UserPreferences settings){settings.Save(Paths.ManagerRoot);Preferences=settings;}
    public void Audit(BotSnapshot bot,string agent,string kind,string summary,string level="info")
    {
        try{RouteLogs.Append(Paths.ManagerRoot,new(DateTimeOffset.Now,bot.Id,bot.Name,agent,"控制台",kind,level,summary));LastAuditError=null;}
        catch(Exception e) when(e is IOException or UnauthorizedAccessException){LastAuditError=e.Message;}
    }
    private (string Binary,string CodexHome,string AgentDir,string Key) AgentContext(BotSnapshot b,string target)
    {
        var m=ManifestFor(b) is {} f?JsonFiles.Read(f):null;
        var root=JsonFiles.Read(Path.Combine(Paths.ChannelHome,"config.json"));
        var profiles=root?["profiles"] as JsonObject??new();
        var profile=JsonFiles.Text(m?["profile"],b.Id);
        var config=profiles[profile]??profiles.FirstOrDefault(p=>p.Value?["codex"] is not null).Value;
        var codex=config?["codex"];
        var codexRoot=JsonFiles.Text(codex?["codexHome"]);
        if(codexRoot.Length==0&&JsonFiles.Text(codex?["inheritCodexHome"])=="false")codexRoot=Path.Combine(Paths.ChannelHome,"profiles",profile,"codex-home");
        var agentDir=m is not null&&b.Backend=="pi"?Path.Combine(Path.GetDirectoryName(ManifestFor(b)!)!,"pi-agent"):Path.Combine(Paths.PiRoot,".agent");
        var binary=target switch {"codex"=>JsonFiles.Text(codex?["binaryPath"]),"antigravity"=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"agy","bin","agy.exe"),_=>Paths.NodeBinary};
        return (binary,codexRoot,agentDir,target+"|"+codexRoot+"|"+binary);
    }
    private async Task<string> QueryAgentAsync(object request,CancellationToken cancellation)
    {
        var info=new ProcessStartInfo(Paths.NodeBinary){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardInputEncoding=new System.Text.UTF8Encoding(false),StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8};
        info.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory,"Assets","agent-data.mjs"));
        using var child=Process.Start(info)??throw new InvalidOperationException("无法启动 Agent 查询器");
        using var limit=CancellationTokenSource.CreateLinkedTokenSource(cancellation);limit.CancelAfter(TimeSpan.FromSeconds(60));
        var output=child.StandardOutput.ReadToEndAsync(limit.Token);var errors=child.StandardError.ReadToEndAsync(limit.Token);
        await child.StandardInput.WriteAsync(JsonSerializer.Serialize(request));child.StandardInput.Close();
        try{await child.WaitForExitAsync(limit.Token);}
        catch{try{child.Kill(true);}catch(InvalidOperationException){}throw;}
        var json=await output;var error=await errors;
        if(child.ExitCode!=0)throw new InvalidOperationException(Redactor.Clean(error));
        return json;
    }
    public async Task<ModelCatalog> ModelsAsync(BotSnapshot bot,string target,bool refresh,CancellationToken cancellation)
    {
        var ctx=AgentContext(bot,target);
        var json=await QueryAgentAsync(new{action="models",backend=target,binary=ctx.Binary,codexHome=ctx.CodexHome,agentDir=ctx.AgentDir,piRoot=Paths.PiRoot,refresh},cancellation);
        var catalog=JsonSerializer.Deserialize<ModelCatalog>(json,AgentJson)??new([],"未读取到模型");
        return catalog with{Models=catalog.Models.Prepend(new("default","使用 Agent 默认模型","默认")).DistinctBy(m=>m.Id,StringComparer.OrdinalIgnoreCase).ToList()};
    }
    public List<QuotaRow> ReadQuotaCache()
    {
        try{var file=Path.Combine(Paths.ManagerRoot,"quota","latest.json");return File.Exists(file)?JsonSerializer.Deserialize<List<QuotaRow>>(File.ReadAllText(file),AgentJson)??[]:[];}
        catch(Exception e) when(e is IOException or JsonException){return [];}
    }
    public async Task<List<QuotaRow>> QuotasAsync(IReadOnlyList<BotSnapshot> bots,CancellationToken cancellation)
    {
        var rows=new List<QuotaRow>();
        foreach(var group in bots.Where(b=>Preferences.Includes(b.Backend)).GroupBy(b=>AgentContext(b,b.Backend).Key))
        {
            cancellation.ThrowIfCancellationRequested();var bot=group.First();var ctx=AgentContext(bot,bot.Backend);QuotaResult result;
            try{
                var json=await QueryAgentAsync(new{action="quota",backend=bot.Backend,binary=ctx.Binary,codexHome=ctx.CodexHome,agentDir=ctx.AgentDir,piRoot=Paths.PiRoot},cancellation);
                result=JsonSerializer.Deserialize<QuotaResult>(json,AgentJson)??new("unavailable","未返回额度数据",[],"");
            }catch(Exception e) when(e is not OperationCanceledException){result=new("unavailable",Redactor.Clean(e.Message),[],"Agent 查询");}
            rows.Add(new(bot.Backend,string.Join("、",group.Select(b=>b.Name)),result.Status,result.Summary,result.Windows,DateTimeOffset.Now,result.Source));
            foreach(var b in group)Audit(b,b.Backend,"quota."+result.Status,result.Windows.Count>0?string.Join("；",result.Windows.Select(w=>w.Display)):result.Summary,result.Status=="unavailable"?"warn":"info");
        }
        cancellation.ThrowIfCancellationRequested();
        var dir=Path.Combine(Paths.ManagerRoot,"quota");Directory.CreateDirectory(dir);
        var filePath=Path.Combine(dir,"latest.json");File.WriteAllText(filePath+".tmp",JsonSerializer.Serialize(rows,AgentJson));File.Move(filePath+".tmp",filePath,true);
        return rows;
    }
    public IReadOnlyList<RouteLogEntry> ReadRouteLogs(IReadOnlyList<BotSnapshot> bots,int days)
    {
        var sources=new List<LogSource>();var since=DateTimeOffset.Now.AddDays(-days);
        void Files(string dir,string pattern,BotSnapshot b,string hint){if(!Directory.Exists(dir))return;foreach(var p in Directory.GetFiles(dir,pattern).Where(p=>File.GetLastWriteTime(p)>=since.LocalDateTime).OrderDescending().Take(Math.Clamp(days,1,30)+2))sources.Add(new(b.Id,b.Name,hint,p));}
        foreach(var b in bots)
        {
            var m=ManifestFor(b) is {} p?JsonFiles.Read(p):null;
            var profile=JsonFiles.Text(m?["profile"],b.Id);
            Files(Path.Combine(Paths.ChannelHome,"profiles",profile,"logs"),"bridge-*.jsonl",b,"unknown");
            if(b.Bridge==BridgeKind.PiFeishu)Files(Path.Combine(b.Root,"logs"),"*.log",b,"pi");
            if(m is not null)
            {
                Files(Path.Combine(Path.GetDirectoryName(ManifestFor(b)!)!,"logs"),"service.log",b,"pi");
                var oldRoot=JsonFiles.Text(m["sourceRoot"]);
                if(JsonFiles.Text(m["sourceBridge"])=="1")Files(Path.Combine(oldRoot,"logs"),"*.log",b,"pi");
            }
        }
        var audit=Path.Combine(Paths.ManagerRoot,"logs");
        if(Directory.Exists(audit))sources.AddRange(Directory.GetFiles(audit,"router-*.jsonl").OrderDescending().Take(Math.Clamp(days,1,30)+1).Select(p=>new LogSource("console","控制台","unknown",p,true)));
        return RouteLogs.Read(sources,since);
    }
}
