namespace RouterManager.Core;

public sealed record ModelOption(string Id,string Name,string Source)
{
    public string Display=>Id=="default"?"default · 使用 Agent 默认模型":string.Equals(Id,Name,StringComparison.OrdinalIgnoreCase)?Id:$"{Id} · {Name}";
}
public sealed record ModelCatalog(List<ModelOption> Models,string Note);
public sealed record QuotaWindow(string Label,double RemainingPercent,long? ResetsAt)
{
    public string Display
    {
        get {
            var reset="";
            if(ResetsAt is {} at){try{reset=$"，{DateTimeOffset.FromUnixTimeSeconds(at).ToLocalTime():MM-dd HH:mm} 重置";}catch(ArgumentOutOfRangeException){}}
            return $"{Label}：剩余 {RemainingPercent:0.#}%{reset}";
        }
    }
}
public sealed record QuotaResult(string Status,string Summary,List<QuotaWindow> Windows,string Source);
public sealed record QuotaRow(string Agent,string Robots,string Status,string Summary,List<QuotaWindow> Windows,DateTimeOffset CheckedAt,string Source)
{
    public string AgentName=>Agent switch {"codex"=>"Codex CLI","antigravity"=>"Antigravity CLI","pi"=>"pi Agent",_=>Agent};
    public string StatusLabel=>Status switch {"available"=>"已读取","unsupported"=>"不支持",_=>"不可用"};
    public string Detail=>Windows.Count>0?string.Join(Environment.NewLine,Windows.Select(w=>w.Display)):Summary;
    public string CheckedTime=>CheckedAt.ToLocalTime().ToString("MM-dd HH:mm:ss");
}
