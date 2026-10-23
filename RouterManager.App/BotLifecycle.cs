using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using RouterManager.Core;
namespace RouterManager.App;

public sealed record NewBot(string Name,string AppId,string Secret,string Backend,string Workspace,string Model,string Permission,bool AutoStart,bool StartNow);
public sealed partial class RouterBackend
{
    private object LifecyclePaths()=>new{channelHome=Paths.ChannelHome,bridgeEntry=Paths.BridgeEntry,piRoot=Paths.PiRoot,nodeBinary=Paths.NodeBinary,managerRoot=Paths.ManagerRoot};
    private async Task<string> LifecycleAsync(object request)
    {
        var tools=Path.Combine(Paths.ManagerRoot,"tools");CopyHelpers();
        var info=new ProcessStartInfo(Paths.NodeBinary){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardInputEncoding=new UTF8Encoding(false),StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
        info.ArgumentList.Add(Path.Combine(tools,"manager.mjs"));info.ArgumentList.Add("--lifecycle");
        using var process=Process.Start(info)??throw new InvalidOperationException("无法启动配置管理器");
        var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(request));process.StandardInput.Close();
        await process.WaitForExitAsync();var stdout=await output;var stderr=await error;
        if(process.ExitCode!=0)throw new InvalidOperationException(Redactor.Clean(stderr));
        return stdout;
    }
    public async Task AddBotAsync(NewBot bot)
    {
        await operation.WaitAsync();
        var snapshot=new BotSnapshot("managed-"+bot.AppId[4..],bot.Name,bot.AppId,BridgeKind.LarkChannel,bot.Backend,bot.Model,bot.Workspace,bot.Permission,Paths.ChannelHome,"","",null,"已停止",null,false,null);
        try{
            var bots=await RefreshAsync();if(bots.Any(b=>string.Equals(b.AppId,bot.AppId,StringComparison.OrdinalIgnoreCase)))throw new InvalidOperationException("该 App ID 已配置，请选择已有机器人修改路由。");
            await LifecycleAsync(new{action="create",bot=new{id=snapshot.Id,name=bot.Name,appId=bot.AppId},target=new{backend=bot.Backend,workspace=bot.Workspace,model=bot.Model},secret=bot.Secret,permission=bot.Permission,autoStart=bot.AutoStart,startNow=bot.StartNow,paths=LifecyclePaths()});
            Audit(snapshot,bot.Backend,"bot.create.completed","新增机器人配置");
        }catch(Exception e){Audit(snapshot,bot.Backend,"bot.create.failed",e.Message,"error");throw;}
        finally{operation.Release();}
    }
    public async Task<string> DeleteBotAsync(BotSnapshot bot)
    {
        await operation.WaitAsync();
        try{
            var current=(await RefreshAsync()).FirstOrDefault(b=>b.AppId==bot.AppId)??throw new InvalidOperationException("机器人已移除，请刷新列表。");
            if(current.Busy)throw new InvalidOperationException("机器人正在处理任务，请完成后再删除。");
            var json=await LifecycleAsync(new{action="delete",bot=new{id=current.Id,name=current.Name,appId=current.AppId,bridge=(int)current.Bridge,root=current.Root,taskName=current.TaskName,busy=current.Busy},paths=LifecyclePaths()});
            var result=JsonDocument.Parse(json.Trim().Split('\n').Last());var archive=result.RootElement.GetProperty("archive").GetString()??"";
            Audit(bot,bot.Backend,"bot.delete.completed","删除配置，备份："+archive);return archive;
        }catch(Exception e){Audit(bot,bot.Backend,"bot.delete.failed",e.Message,"error");throw;}
        finally{operation.Release();}
    }
}
