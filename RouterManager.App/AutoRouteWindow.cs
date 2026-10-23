using System.Windows;
using System.Windows.Controls;
using RouterManager.Core;

namespace RouterManager.App;

public sealed class AutoRouteWindow : Window
{
    public AutoRouteWindow(RouterBackend backend,BotSnapshot bot,bool previewOnly=false)
    {
        Title=bot.Name+" · 自动路由";Width=660;Height=630;MinWidth=560;MinHeight=560;WindowStartupLocation=WindowStartupLocation.CenterOwner;
        var panel=new StackPanel{Margin=new Thickness(24)};Content=new ScrollViewer{Content=panel,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        panel.Children.Add(new TextBlock{Text="自动路由与额度提醒",FontSize=24,FontWeight=FontWeights.SemiBold});
        var enabled=new CheckBox{Content="启用自动路由：Codex 额度耗尽 → pi Agent",Margin=new Thickness(0,20,0,16)};panel.Children.Add(enabled);
        panel.Children.Add(new TextBlock{Text="备用 pi 模型（default 或 provider/model）"});
        var model=new TextBox{Text="default"};panel.Children.Add(model);
        var note=new TextBlock{Text="默认关闭。仅在明确额度错误，或超时后查询确认额度耗尽时切换；普通网络错误不会触发。\n\n反馈发送到触发失败的飞书会话。记录额度刷新时间，到期复查并提醒可切回，不会自动切回。未提供刷新时间时每 5 分钟复查；关闭窗口后由后台服务继续执行。\n\n原请求不会自动重放；不同后端的历史会话分别保留。pi 的工具权限由 pi 管理。\n\n启用时若服务正在运行，会在空闲时重启当前机器人。首次使用须部署本版桥接保护补丁。",TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,12,0,12)};
        note.SetResourceReference(TextBlock.ForegroundProperty,"Muted");panel.Children.Add(note);
        var status=new TextBlock{TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,6,0,12)};panel.Children.Add(status);
        var buttons=new WrapPanel();var save=new Button{Content="保存自动路由设置"};var refresh=new Button{Content="刷新状态"};var restore=new Button{Content="切回原 Codex 路由"};buttons.Children.Add(save);buttons.Children.Add(refresh);buttons.Children.Add(restore);panel.Children.Add(buttons);
        bool changing=false;
        void Refresh(){status.Text=previewOnly?"只读预览 · 未访问真实策略":backend.AutoRouteStatus(bot);}
        if(!previewOnly){var p=backend.AutoRoutePolicy(bot);enabled.IsChecked=JsonFiles.Text(p["enabled"])=="true";model.Text=JsonFiles.Text(p["fallbackModel"],"default");}
        Refresh();refresh.Click+=(_,_)=>Refresh();
        save.Click+=async(_,_)=>{
            if(changing)return;changing=true;buttons.IsEnabled=false;
            try{await backend.SaveAutoRouteAsync(bot,enabled.IsChecked==true,model.Text.Trim());Refresh();status.Text="设置已保存。\n"+status.Text;}
            catch(Exception e){status.Text=Redactor.Clean(e.Message);MessageBox.Show(this,status.Text,"自动路由设置未完成",MessageBoxButton.OK,MessageBoxImage.Warning);}
            finally{changing=false;buttons.IsEnabled=true;}
        };
        restore.Click+=async(_,_)=>{
            if(changing)return;
            if(MessageBox.Show(this,"确认切回原 Codex 模型和工作目录？请先确认额度已恢复。不同后端的会话分别保留。","切回 Codex",MessageBoxButton.OKCancel,MessageBoxImage.Information)!=MessageBoxResult.OK)return;
            changing=true;buttons.IsEnabled=false;status.Text="正在恢复原 Codex 路由…";
            try{await backend.ReturnPrimaryAsync(bot);Refresh();status.Text="已恢复原 Codex 路由。\n"+status.Text;}
            catch(Exception e){status.Text=Redactor.Clean(e.Message);MessageBox.Show(this,status.Text,"切回未完成");}
            finally{changing=false;buttons.IsEnabled=true;}
        };
        Closing+=(_,e)=>{if(changing)e.Cancel=true;};
        if(previewOnly)buttons.IsEnabled=false;
    }
}
