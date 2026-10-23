using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using RouterManager.Core;
namespace RouterManager.App;

public sealed class SettingsWindow : Window
{
    public SettingsWindow(RouterBackend backend)
    {
        Title="控制台设置";Width=800;Height=790;WindowStartupLocation=WindowStartupLocation.CenterOwner;MinHeight=650;
        var panel=new StackPanel{Margin=new Thickness(26)};Content=new ScrollViewer{Content=panel,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        panel.Children.Add(new TextBlock{Text="连接已有的本地桥接",FontSize=22,FontWeight=FontWeights.SemiBold,Margin=new Thickness(0,0,0,8)});
        var description=new TextBlock{Text="保存界面、查询计划与集成路径，不会切换机器人路由。",Margin=new Thickness(0,0,0,16)};description.SetResourceReference(TextBlock.ForegroundProperty,"Muted");panel.Children.Add(description);
        panel.Children.Add(new TextBlock{Text="界面主题"});
        var theme=new ComboBox();foreach(var item in new[]{("system","跟随系统"),("dark","深色 · 黑"),("light","浅色 · 白")})theme.Items.Add(new ComboBoxItem{Tag=item.Item1,Content=item.Item2});
        theme.SelectedItem=theme.Items.OfType<ComboBoxItem>().First(i=>(string)i.Tag==backend.Preferences.Theme);panel.Children.Add(theme);
        var quota=new CheckBox{Content="启用 Agent 额度定时查询（控制台打开期间）",IsChecked=backend.Preferences.QuotaEnabled};panel.Children.Add(quota);
        var intervalRow=new StackPanel{Orientation=Orientation.Horizontal};intervalRow.Children.Add(new TextBlock{Text="查询间隔（分钟，5–1440）",VerticalAlignment=VerticalAlignment.Center});
        var interval=new TextBox{Text=backend.Preferences.QuotaIntervalMinutes.ToString(),Width=90,Margin=new Thickness(12,0,0,0)};intervalRow.Children.Add(interval);panel.Children.Add(intervalRow);
        var agents=new StackPanel{Orientation=Orientation.Horizontal};
        var codex=new CheckBox{Content="Codex",IsChecked=backend.Preferences.QuotaCodex};var antigravity=new CheckBox{Content="Antigravity",IsChecked=backend.Preferences.QuotaAntigravity};var piQuota=new CheckBox{Content="pi",IsChecked=backend.Preferences.QuotaPi};agents.Children.Add(codex);agents.Children.Add(antigravity);agents.Children.Add(piQuota);panel.Children.Add(agents);
        var note=new TextBlock{Text="Codex 读取账号限额；没有统一额度接口的 Agent 显示“不支持”。关闭窗口即停止查询，不自动发送消息或购买额度。",TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,0,0,16)};note.SetResourceReference(TextBlock.ForegroundProperty,"Muted");panel.Children.Add(note);
        TextBox Add(string label,string value){panel.Children.Add(new TextBlock{Text=label});var box=new TextBox{Text=value};panel.Children.Add(box);return box;}
        var home=Add("Lark Channel 配置目录",backend.Paths.ChannelHome);
        var entry=Add("Lark Bridge 入口文件（lark-channel-bridge.mjs）",backend.Paths.BridgeEntry);
        var pi=Add("pi 桥接目录（包含 node_modules/pi-remote-feishu）",backend.Paths.PiRoot);
        var node=Add("Node.js 程序",backend.Paths.NodeBinary);
        var save=new Button{Content="保存设置",HorizontalAlignment=HorizontalAlignment.Right,Margin=new Thickness(0,4,0,0)};
        save.Click+=(_,_)=>{
            if(!int.TryParse(interval.Text,out var minutes)||minutes is <5 or >1440){MessageBox.Show(this,"查询间隔须为 5–1440 分钟。");return;}
            if(!File.Exists(Path.Combine(home.Text.Trim(),"config.json"))||!File.Exists(entry.Text.Trim())||!File.Exists(node.Text.Trim())){MessageBox.Show(this,"请检查配置目录、桥接入口和 Node.js 路径。");return;}
            try{
                backend.SavePaths(backend.Paths with{ChannelHome=home.Text.Trim(),BridgeEntry=entry.Text.Trim(),PiRoot=pi.Text.Trim(),NodeBinary=node.Text.Trim()});
                backend.SavePreferences(backend.Preferences with{Theme=(string)((ComboBoxItem)theme.SelectedItem).Tag,QuotaEnabled=quota.IsChecked==true,QuotaIntervalMinutes=minutes,QuotaCodex=codex.IsChecked==true,QuotaAntigravity=antigravity.IsChecked==true,QuotaPi=piQuota.IsChecked==true});DialogResult=true;
            }catch(Exception error){MessageBox.Show(this,Redactor.Clean(error.Message),"设置保存失败");}
        };panel.Children.Add(save);
    }
}
