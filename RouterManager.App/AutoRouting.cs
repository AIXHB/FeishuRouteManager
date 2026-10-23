using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using RouterManager.Core;

namespace RouterManager.App;

public sealed partial class RouterBackend
{
    public JsonObject AutoRoutePolicy(BotSnapshot bot) => ManifestFor(bot) is {} path
        ? JsonFiles.Read(Path.Combine(Path.GetDirectoryName(path)!,"auto-route.json")) as JsonObject ?? new()
        : new();
    public string AutoRouteStatus(BotSnapshot bot)
    {
        if(ManifestFor(bot) is not {} path)return "请先保存路由，建立独立后台服务。";
        var state=JsonFiles.Read(Path.Combine(Path.GetDirectoryName(path)!,"auto-route-state.json"));
        string Time(string key) => long.TryParse(JsonFiles.Text(state?[key]),out var at)&&at>0 ? DateTimeOffset.FromUnixTimeMilliseconds(at).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss") : "未知";
        var phase=JsonFiles.Text(state?["phase"]) switch {"switching"=>"切换中","switched"=>"已切到 pi","returned"=>"已离开备用路由","failed"=>"切换未完成",_=>"尚未触发"};
        return $"后台状态：{phase}\n最近额度查询：{Time("checkedAt")}\n预计额度刷新：{Time("resetAt")}\n下次检查：{Time("nextCheckAt")}\n{JsonFiles.Text(state?["lastError"])}";
    }
    public async Task SaveAutoRouteAsync(BotSnapshot bot,bool enabled,string fallbackModel)
    {
        await operation.WaitAsync();
        BotSnapshot current;
        try{
            current=(await RefreshAsync()).SingleOrDefault(b=>b.AppId==bot.AppId)??throw new InvalidOperationException("机器人已移除。");
            var manifest=ManifestFor(current)??throw new InvalidOperationException("请先保存路由，建立独立后台服务。");
            if(enabled&&current.Busy)throw new InvalidOperationException("机器人正在执行任务，请完成后再启用自动路由。");
            if(enabled){
                var bridge=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Paths.BridgeEntry)!,"..","dist","cli.js"));
                if(!File.Exists(bridge)||!File.ReadAllText(bridge).Contains("FEISHU_ROUTER_PAUSE_FILE"))throw new InvalidOperationException("活动桥接尚未部署自动路由保护补丁，请先按部署指南安装本版桥接，再启用。");
            }
            CopyHelpers();
            var info=new ProcessStartInfo(Paths.NodeBinary){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardInputEncoding=new UTF8Encoding(false),StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
            info.ArgumentList.Add(Path.Combine(Paths.ManagerRoot,"tools","manager.mjs"));info.ArgumentList.Add("--auto-policy");
            using var child=Process.Start(info)??throw new InvalidOperationException("无法保存自动路由策略。");
            var stdout=child.StandardOutput.ReadToEndAsync();var stderr=child.StandardError.ReadToEndAsync();
            await child.StandardInput.WriteAsync(JsonSerializer.Serialize(new{runtimeRoot=Path.GetDirectoryName(manifest),policy=new{enabled,fallbackModel}}));child.StandardInput.Close();
            await child.WaitForExitAsync();_ = await stdout;
            if(child.ExitCode!=0)throw new InvalidOperationException(Redactor.Clean(await stderr));
            Audit(current,current.Backend,"auto-route.policy.saved",enabled?"启用 Codex → pi 自动路由":"关闭自动路由及恢复提醒");
        }finally{operation.Release();}
        // Restart only on opt-in; disabled policies are read on every background tick.
        if(enabled&&current.Pid is not null)await ServiceAsync(current,"restart",true);
    }
    public async Task ReturnPrimaryAsync(BotSnapshot bot)
    {
        var current=(await RefreshAsync()).SingleOrDefault(b=>b.AppId==bot.AppId)??throw new InvalidOperationException("机器人已移除。");
        if(current.Backend!="pi"||current.Busy)throw new InvalidOperationException("需要当前使用 pi 且无任务执行时才能切回。");
        var manifest=ManifestFor(current)??throw new InvalidOperationException("没有托管路由。");
        var state=JsonFiles.Read(Path.Combine(Path.GetDirectoryName(manifest)!,"auto-route-state.json"));
        var original=state?["original"];
        if(JsonFiles.Text(original?["backend"])!="codex")throw new InvalidOperationException("没有可恢复的原 Codex 路由。");
        await ApplyAsync(current,"codex",JsonFiles.Text(original?["workspace"]),JsonFiles.Text(original?["model"],"default"));
    }
}
