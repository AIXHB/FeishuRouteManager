using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using RouterManager.Core;

namespace RouterManager.App;

public sealed partial class RouterBackend
{
    private readonly IScriptRunner scripts = new PowerShellRunner();
    private readonly SemaphoreSlim operation = new(1, 1);
    private void CopyHelpers()
    {
        var tools=Path.Combine(Paths.ManagerRoot,"tools");Directory.CreateDirectory(tools);
        foreach(var source in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory,"Assets"),"*.mjs"))
            File.Copy(source,Path.Combine(tools,Path.GetFileName(source)),true);
    }
    public IntegrationPaths Paths { get; private set; }
    public IReadOnlyList<TaskSnapshot> Tasks { get; private set; } = [];
    public RouterBackend()
    {
        Paths = IntegrationPaths.Detect([], []);
        Preferences=UserPreferences.Load(Paths.ManagerRoot);
    }
    public async Task<IReadOnlyList<BotSnapshot>> RefreshAsync()
    {
        var inventory = await new WindowsInventory(scripts).ReadAsync(); Tasks = inventory.Tasks;
        var discovery = new BotDiscovery(Paths.ChannelHome);
        var bots = discovery.Discover(Tasks, inventory.LivePids).ToList();
        Paths = IntegrationPaths.LoadOrDetect(Tasks, bots);
        if (!string.IsNullOrWhiteSpace(Paths.PiRoot))
        {
            var pi = discovery.DiscoverPi(Paths.PiRoot, Tasks, inventory.LivePids);
            if (pi is not null) bots.Add(pi);
        }
        foreach (var manifestPath in ManagedFiles())
        {
            var m = JsonFiles.Read(manifestPath); if (m is null) continue;
            var appId = JsonFiles.Text(m["appId"]);
            var existing = bots.FirstOrDefault(b => b.AppId == appId);
            var runtime = Path.GetDirectoryName(manifestPath)!;
            var backend = JsonFiles.Text(m["backend"]);
            var health = JsonFiles.Read(Path.Combine(runtime, "health.json"));
            var pidValue = int.TryParse(JsonFiles.Text(health?["pid"]), out var parsed) ? parsed : 0;
            int? pid = inventory.LivePids.Contains(pidValue) ? pidValue : null;
            var fresh = DateTimeOffset.TryParse(JsonFiles.Text(health?["at"]), out var time) && DateTimeOffset.UtcNow - time < TimeSpan.FromSeconds(20);
            var profile = JsonFiles.Text(m["profile"]);
            var live = bots.FirstOrDefault(b => b.Id == profile);
            var taskName = JsonFiles.Text(m["taskName"]);
            bots.RemoveAll(b => b.AppId == appId);
            bots.Add(new(JsonFiles.Text(m["id"]), JsonFiles.Text(m["name"]), appId,
                backend == "pi" ? BridgeKind.PiFeishu : BridgeKind.LarkChannel, backend,
                backend == "pi" ? JsonFiles.Text(m["model"], "default") : live?.Model ?? JsonFiles.Text(m["model"], "default"), JsonFiles.Text(m["workspace"]), live?.Permission ?? existing?.Permission ?? "由 pi 管理",
                backend == "pi" ? runtime : Paths.ChannelHome, taskName, Tasks.FirstOrDefault(t => t.Name == taskName)?.State ?? "未注册",
                pid, pid is null ? "已停止" : fresh && JsonFiles.Text(health?["state"]) == "running" ? backend == "pi" ? "已连接" : live?.Connection ?? "已连接" : "启动或重连中",
                fresh ? time : null, backend == "pi" ? BotDiscovery.IsPiBusy(Path.Combine(runtime,"logs","service.log")) : live?.Busy ?? false, live?.Warning));
        }
        var duplicate = bots.GroupBy(b => b.AppId).Where(g => g.Count() > 1).Select(g => g.Key).ToHashSet();
        return bots.Select(b => duplicate.Contains(b.AppId) ? b with { Warning = "检测到重复 App ID，请检查是否有多个桥接同时连接。" } : b).OrderBy(b => b.Name).ToArray();
    }
    private IEnumerable<string> ManagedFiles()
    {
        var root = Path.Combine(Paths.ManagerRoot, "bots");
        return Directory.Exists(root) ? Directory.EnumerateDirectories(root).Select(d => Path.Combine(d, "route.json")).Where(File.Exists).ToArray() : [];
    }
    public string? ManifestFor(BotSnapshot b) => ManagedFiles().FirstOrDefault(p => JsonFiles.Text(JsonFiles.Read(p)?["appId"]) == b.AppId);
    public string LogDirectory(BotSnapshot b)
    {
        var manifest = ManifestFor(b);
        if (b.Bridge == BridgeKind.LarkChannel)
        {
            var profile = manifest is null ? b.Id : JsonFiles.Text(JsonFiles.Read(manifest)?["profile"]);
            return Path.Combine(Paths.ChannelHome, "profiles", profile, "logs");
        }
        return Path.Combine(b.Root, "logs");
    }
    public string ReadLogs(BotSnapshot b)
    {
        var dir = LogDirectory(b);
        if (!Directory.Exists(dir)) return "尚无日志。";
        var file = Directory.GetFiles(dir, b.Bridge == BridgeKind.LarkChannel ? "bridge-*.jsonl" : "*.log")
            .OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
        return file is null ? "尚无日志。" : string.Join(Environment.NewLine, JsonFiles.Tail(file).Select(Redactor.Clean));
    }
    public async Task ApplyAsync(BotSnapshot bot, string backend, string workspace, string model)
    {
        if (bot.Busy) throw new InvalidOperationException("机器人正在处理消息，请完成后再切换。");
        await operation.WaitAsync();
        Audit(bot,backend,"route.apply.started",$"{bot.Backend} → {backend}；模型 {model}；目录 {workspace}");
        try
        {
            CopyHelpers();
            var helper = Path.Combine(Paths.ManagerRoot, "tools", "manager.mjs");
            var input = new {
                bot = new { id=bot.Id, name=bot.Name, appId=bot.AppId, bridge=(int)bot.Bridge, root=bot.Root, taskName=bot.TaskName, busy=bot.Busy },
                target = new { backend, workspace, model },
                expectedBackend = ManifestFor(bot) is null ? null : bot.Backend,
                paths = new { channelHome=Paths.ChannelHome, bridgeEntry=Paths.BridgeEntry, piRoot=Paths.PiRoot, nodeBinary=Paths.NodeBinary, managerRoot=Paths.ManagerRoot }
            };
            var info = new ProcessStartInfo(Paths.NodeBinary) { UseShellExecute=false, CreateNoWindow=true, RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true, StandardInputEncoding=new System.Text.UTF8Encoding(false), StandardOutputEncoding=System.Text.Encoding.UTF8, StandardErrorEncoding=System.Text.Encoding.UTF8 };
            info.ArgumentList.Add(helper);
            using var child = Process.Start(info) ?? throw new InvalidOperationException("无法启动路由管理器。");
            var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
            await child.StandardInput.WriteAsync(JsonSerializer.Serialize(input)); child.StandardInput.Close();
            // The helper owns the rollback transaction; do not kill it halfway through recovery.
            await child.WaitForExitAsync();
            _ = await stdout;
            if (child.ExitCode != 0) throw new InvalidOperationException(Redactor.Clean(await stderr));
            Audit(bot,backend,"route.apply.completed",$"{bot.Backend} → {backend}；模型 {model}");
        }
        catch(Exception e){Audit(bot,backend,"route.apply.failed",e.Message,"error");throw;}
        finally { operation.Release(); }
    }
    public async Task ServiceAsync(BotSnapshot b, string action, bool requireIdle=false)
    {
        if (action is not ("start" or "stop" or "restart")) throw new ArgumentException("无效操作");
        await operation.WaitAsync();
        Audit(b,b.Backend,"service."+action+".started","请求"+action);
        try
        {
            var manifest = ManifestFor(b);
            var m = manifest is null ? null : JsonFiles.Read(manifest);
            var profile = m is null ? b.Id : JsonFiles.Text(m["profile"]);
            if(m is not null){
                CopyHelpers();
                var info=new ProcessStartInfo(Paths.NodeBinary){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardInputEncoding=new System.Text.UTF8Encoding(false),StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8};
                info.ArgumentList.Add(Path.Combine(Paths.ManagerRoot,"tools","manager.mjs"));info.ArgumentList.Add("--service");
                using var child=Process.Start(info)??throw new InvalidOperationException("无法启动服务管理器。");
                var output=child.StandardOutput.ReadToEndAsync();var error=child.StandardError.ReadToEndAsync();
                await child.StandardInput.WriteAsync(JsonSerializer.Serialize(new{runtimeRoot=Path.GetDirectoryName(manifest),action,requireIdle}));child.StandardInput.Close();
                await child.WaitForExitAsync();_ = await output;
                if(child.ExitCode!=0)throw new InvalidOperationException(Redactor.Clean(await error));
                Audit(b,b.Backend,"service."+action+".completed","服务操作完成");return;
            }
            const string script = """
                $r=[Console]::In.ReadToEnd()|ConvertFrom-Json;
                if(-not (Get-ScheduledTask -TaskName $r.task -ErrorAction SilentlyContinue)){throw '未找到自启任务，请先保存路由以创建独立服务。'}
                if($r.action -in @('stop','restart')){
                    Stop-ScheduledTask -TaskName $r.task;
                    $procs=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('node.exe','powershell.exe')});
                    foreach($p in $procs){
                        if(-not $p.CommandLine){continue}
                        $match=$false;
                        if($r.managed){$match=$p.CommandLine.Contains($r.runtime)}
                        if($p.CommandLine -match 'lark-channel-bridge\.mjs' -and $p.CommandLine -match ('--profile\s+'+[regex]::Escape($r.profile)+'(?:\s|"|$)')){$match=$true}
                        if(-not $r.managed -and $r.pi){$match=$p.CommandLine.Contains($r.root) -and $p.CommandLine -match 'pi-remote-feishu\.js|autostart\.ps1'}
                        if($match){Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue}
                    }
                }
                if($r.action -eq 'start'){Enable-ScheduledTask -TaskName $r.task|Out-Null;Start-ScheduledTask -TaskName $r.task}
                """;
            await scripts.RunAsync(script, new { task=b.TaskName, action, profile, root=b.Root, pi=b.Bridge==BridgeKind.PiFeishu, managed=manifest is not null, runtime=manifest is null ? "" : Path.GetDirectoryName(manifest) });
            if (action == "restart")
            {
                await Task.Delay(TimeSpan.FromSeconds(32));
                await scripts.RunAsync("$r=[Console]::In.ReadToEnd()|ConvertFrom-Json;Enable-ScheduledTask -TaskName $r.task|Out-Null;Start-ScheduledTask -TaskName $r.task", new { task=b.TaskName });
            }
            Audit(b,b.Backend,"service."+action+".completed","服务操作完成");
        }
        catch(Exception e){Audit(b,b.Backend,"service."+action+".failed",e.Message,"error");throw;}
        finally { operation.Release(); }
    }
    public void SavePaths(IntegrationPaths paths)
    {
        Directory.CreateDirectory(paths.ManagerRoot);
        var p = Path.Combine(paths.ManagerRoot, "integrations.json");
        File.WriteAllText(p, JsonSerializer.Serialize(paths, new JsonSerializerOptions{WriteIndented=true})); Paths=paths;
    }
}
