using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace RouterManager.Core;

public sealed record RouteLogEntry(DateTimeOffset Time,string BotId,string Bot,string Agent,string Source,string Event,string Level,string Summary)
{
    public string TimeLabel=>Time.ToLocalTime().ToString("MM-dd HH:mm:ss");
    public string AgentLabel=>Agent switch {"codex"=>"Codex CLI","antigravity"=>"Antigravity CLI","pi"=>"pi Agent","unknown"=>"Agent 未记录",_=>Agent};
}
public sealed record LogSource(string BotId,string Bot,string AgentHint,string File,bool Audit=false);
public static class RouteLogs
{
    public static string NormalizeAgent(string? value)
    {
        if(string.IsNullOrEmpty(value))return "unknown";
        if(value.Contains("antigravity",StringComparison.OrdinalIgnoreCase))return "antigravity";
        if(value.Contains("codex",StringComparison.OrdinalIgnoreCase))return "codex";
        if(value.Contains("claude",StringComparison.OrdinalIgnoreCase))return "claude";
        if(value.Contains("pi",StringComparison.OrdinalIgnoreCase))return "pi";
        return value;
    }
    public static IReadOnlyList<RouteLogEntry> Read(IEnumerable<LogSource> sources,DateTimeOffset since,int maxEntries=5000)
    {
        var all=new List<RouteLogEntry>();
        foreach(var group in sources.DistinctBy(s=>s.File,StringComparer.OrdinalIgnoreCase).GroupBy(s=>s.BotId))
        {
            var agent="unknown";
            string? lastDirectory=null;
            foreach(var source in group.OrderBy(s=>s.File,StringComparer.Ordinal))
            {
                var directory=Path.GetDirectoryName(source.File);
                if(directory!=lastDirectory){agent="unknown";lastDirectory=directory;}
                if(source.AgentHint!="unknown")agent=source.AgentHint;
                foreach(var line in JsonFiles.Tail(source.File,1600,1048576))
                {
                    JsonObject? row;try{row=JsonNode.Parse(line) as JsonObject;}catch(JsonException){continue;}
                    if(row is null)continue;
                    string V(string key)=>JsonFiles.Text(row[key]??row[char.ToUpperInvariant(key[0])+key[1..]]);
                    if(source.Audit)
                    {
                        if(DateTimeOffset.TryParse(V("time"),out var at)&&at>=since)
                            all.Add(new(at,V("botId"),V("bot"),V("agent"),"控制台",V("event"),V("level"),Redactor.Clean(V("summary"))));
                        continue;
                    }
                    var actual=V("agent");if(actual.Length>0)agent=NormalizeAgent(actual);
                    if(!DateTimeOffset.TryParse(V("ts").Length>0?V("ts"):V("time"),out var time)||time<since)continue;
                    var kind=V("event");if(kind.Length==0)continue;
                    var phase=V("phase");var level=V("level");
                    if(level.Length==0)level=kind.Contains("fail",StringComparison.OrdinalIgnoreCase)?"error":"info";
                    var detail=new[]{V("error"),V("message"),V("preview"),V("line")}.FirstOrDefault(s=>s.Length>0)??"";
                    if(detail.Length>800)detail=detail[..800]+"…";
                    all.Add(new(time,source.BotId,source.Bot,agent,"Agent",phase.Length==0?kind:phase+"."+kind,level,Redactor.Clean(detail)));
                }
            }
        }
        return all.OrderByDescending(e=>e.Time).Take(maxEntries).ToArray();
    }
    public static IReadOnlyList<RouteLogEntry> Filter(IEnumerable<RouteLogEntry> entries,string? bot,string? agent,string? level,string search)
        =>entries.Where(e=>(bot is null||e.BotId==bot)&&(agent is null||e.Agent==agent)&&(level is null||e.Level==level)&&
            (string.IsNullOrWhiteSpace(search)||$"{e.Bot} {e.AgentLabel} {e.Event} {e.Summary}".Contains(search,StringComparison.OrdinalIgnoreCase))).ToArray();
    private static readonly object Gate=new();
    public static void Append(string root,RouteLogEntry entry)
    {
        var safe=entry with {Summary=Redactor.Clean(entry.Summary)};
        var directory=Path.Combine(root,"logs");
        lock(Gate){Directory.CreateDirectory(directory);File.AppendAllText(Path.Combine(directory,$"router-{entry.Time.ToLocalTime():yyyyMMdd}.jsonl"),JsonSerializer.Serialize(safe)+Environment.NewLine,Encoding.UTF8);}
    }
}
