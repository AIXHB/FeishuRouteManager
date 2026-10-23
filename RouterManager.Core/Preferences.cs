using System.Text.Json;
namespace RouterManager.Core;

public sealed record UserPreferences
{
    public string Theme { get; init; } = "system";
    public bool QuotaEnabled { get; init; }
    public int QuotaIntervalMinutes { get; init; } = 15;
    public bool QuotaCodex { get; init; } = true;
    public bool QuotaAntigravity { get; init; } = true;
    public bool QuotaPi { get; init; } = true;
    public UserPreferences Validate()
    {
        if(Theme is not ("system" or "dark" or "light"))throw new ArgumentException("请选择系统、深色或浅色主题。");
        if(QuotaIntervalMinutes is <5 or >1440)throw new ArgumentException("额度查询间隔须为 5–1440 分钟。");
        return this;
    }
    public bool Includes(string agent)=>agent switch {"codex"=>QuotaCodex,"antigravity"=>QuotaAntigravity,"pi"=>QuotaPi,_=>false};
    public static UserPreferences Load(string root)
    {
        var path=Path.Combine(root,"preferences.json");
        try{return (File.Exists(path)?JsonSerializer.Deserialize<UserPreferences>(File.ReadAllText(path)):null)?.Validate()??new();}
        catch(Exception e) when(e is IOException or System.Text.Json.JsonException or ArgumentException){return new();}
    }
    public void Save(string root)
    {
        Validate();Directory.CreateDirectory(root);var path=Path.Combine(root,"preferences.json");
        var temporary=path+".tmp";File.WriteAllText(temporary,JsonSerializer.Serialize(this,new JsonSerializerOptions{WriteIndented=true}));File.Move(temporary,path,true);
    }
}

public sealed class QuotaSchedule
{
    public DateTimeOffset? NextDue {get;private set;}
    public bool Running {get;private set;}
    public bool TryBegin(UserPreferences settings,DateTimeOffset now)
    {
        if(!settings.QuotaEnabled){NextDue=null;return false;}
        if(Running||(NextDue is {} due&&now<due))return false;
        Running=true;return true;
    }
    public void Complete(UserPreferences settings,DateTimeOffset now){Running=false;NextDue=settings.QuotaEnabled?now.AddMinutes(settings.QuotaIntervalMinutes):null;}
    public void Reset(){NextDue=null;}
}
