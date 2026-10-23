using System.IO;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using RouterManager.Core;
namespace RouterManager.App;

public sealed class NewBotWindow:Window
{
    public NewBot? Result{get;private set;}
    public NewBotWindow(RouterBackend backend,IReadOnlyList<BotSnapshot> bots)
    {
        Title="新增飞书机器人";Width=680;Height=830;MinHeight=650;WindowStartupLocation=WindowStartupLocation.CenterOwner;
        var panel=new StackPanel{Margin=new Thickness(26)};Content=new ScrollViewer{Content=panel,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        panel.Children.Add(new TextBlock{Text="新增机器人",FontSize=25,FontWeight=FontWeights.SemiBold});
        var note=new TextBlock{Text="填写飞书企业自建应用的凭据。保存后可在控制台管理路由、服务和日志。",TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,8,0,18)};note.SetResourceReference(TextBlock.ForegroundProperty,"Muted");panel.Children.Add(note);
        TextBox Input(string label,string text=""){panel.Children.Add(new TextBlock{Text=label});var box=new TextBox{Text=text};panel.Children.Add(box);return box;}
        var name=Input("机器人名称");var appId=Input("飞书 App ID（cli_ 开头）");
        panel.Children.Add(new TextBlock{Text="App Secret（加密保存）"});var secret=new PasswordBox{Padding=new Thickness(10),Margin=new Thickness(0,5,0,12)};secret.SetResourceReference(BackgroundProperty,"ControlBg");secret.SetResourceReference(ForegroundProperty,"Ink");secret.SetResourceReference(BorderBrushProperty,"Line");panel.Children.Add(secret);
        panel.Children.Add(new TextBlock{Text="目标 Agent"});var agent=new ComboBox();foreach(var a in new[]{("codex","Codex CLI"),("antigravity","Antigravity CLI"),("pi","pi Agent")})agent.Items.Add(new ComboBoxItem{Tag=a.Item1,Content=a.Item2});agent.SelectedIndex=0;panel.Children.Add(agent);
        var workspace=Input("工作目录（选择已有目录）",bots.FirstOrDefault()?.Workspace??Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));
        var browse=new Button{Content="选择文件夹…",HorizontalAlignment=HorizontalAlignment.Right};browse.Click+=(_,_)=>{var d=new Microsoft.Win32.OpenFolderDialog{Title="选择机器人工作目录",InitialDirectory=Directory.Exists(workspace.Text)?workspace.Text:""};if(d.ShowDialog(this)==true)workspace.Text=d.FolderName;};panel.Children.Add(browse);
        panel.Children.Add(new TextBlock{Text="模型"});var model=new ComboBox{IsEditable=true,IsTextSearchEnabled=true,DisplayMemberPath="Display"};TextSearch.SetTextPath(model,"Id");model.Text="default";panel.Children.Add(model);
        var modelNote=new TextBlock{TextWrapping=TextWrapping.Wrap,FontSize=11};modelNote.SetResourceReference(TextBlock.ForegroundProperty,"Muted");panel.Children.Add(modelNote);
        var refresh=new Button{Content="读取模型",HorizontalAlignment=HorizontalAlignment.Right};panel.Children.Add(refresh);
        panel.Children.Add(new TextBlock{Text="执行权限（pi 的工具权限由 pi 自身管理）"});var permission=new ComboBox();foreach(var p in new[]{("read-only","只读"),("workspace","工作目录内读写"),("full","完整访问")})permission.Items.Add(new ComboBoxItem{Tag=p.Item1,Content=p.Item2});permission.SelectedIndex=1;panel.Children.Add(permission);
        var autoStart=new CheckBox{Content="登录 Windows 时自动启动",IsChecked=false};var startNow=new CheckBox{Content="保存后立即启动并验证连接",IsChecked=false};panel.Children.Add(autoStart);panel.Children.Add(startNow);
        var status=new TextBlock{Text="飞书应用需启用机器人、长连接事件订阅，并发布所需权限。",TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,8,0,12)};status.SetResourceReference(TextBlock.ForegroundProperty,"Muted");panel.Children.Add(status);
        CancellationTokenSource? pending=null;bool closed=false;
        async Task LoadModels(){
            pending?.Cancel();pending=new();var token=pending.Token;var target=(string)((ComboBoxItem)agent.SelectedItem).Tag;modelNote.Text="正在读取模型…";
            var context=bots.FirstOrDefault()??new BotSnapshot("new","新增","cli_new",BridgeKind.LarkChannel,target,"default",workspace.Text,"workspace",backend.Paths.ChannelHome,"","",null,"",null,false,null);
            try{var catalog=await backend.ModelsAsync(context,target,false,token);if(closed||token.IsCancellationRequested)return;var text=model.Text;model.ItemsSource=catalog.Models;model.Text=text;modelNote.Text=catalog.Note;}
            catch(OperationCanceledException){}catch(Exception e){if(!closed&&!token.IsCancellationRequested)modelNote.Text="可手动输入模型 ID："+Redactor.Clean(e.Message);}
        }
        agent.SelectionChanged+=async(_,_)=>{model.Text="default";await LoadModels();};refresh.Click+=async(_,_)=>await LoadModels();Loaded+=async(_,_)=>await LoadModels();Closed+=(_,_)=>{closed=true;pending?.Cancel();secret.Clear();};
        var buttons=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right};var cancel=new Button{Content="取消",IsCancel=true};var save=new Button{Content="保存机器人"};buttons.Children.Add(cancel);buttons.Children.Add(save);panel.Children.Add(buttons);
        save.Click+=(_,_)=>{
            var id=appId.Text.Trim();var title=name.Text.Trim();var modelId=string.IsNullOrWhiteSpace(model.Text)?"default":model.Text.Trim();
            if(title.Length is <1 or >60){MessageBox.Show(this,"名称须为 1–60 个字符。");return;}
            if(!Regex.IsMatch(id,@"^cli_[A-Za-z0-9]+$")){MessageBox.Show(this,"请填写有效的飞书 App ID。");return;}
            if(bots.Any(b=>string.Equals(b.AppId,id,StringComparison.OrdinalIgnoreCase))){MessageBox.Show(this,"该 App ID 已配置，请选择已有机器人修改路由。");return;}
            if(string.IsNullOrWhiteSpace(secret.Password)||secret.Password.Length>512){MessageBox.Show(this,"请填写有效的 App Secret。");return;}
            if(!Path.IsPathFullyQualified(workspace.Text.Trim())||!Directory.Exists(workspace.Text.Trim())){MessageBox.Show(this,"请选择已存在的完整工作目录。");return;}
            if(!Regex.IsMatch(modelId,@"^[A-Za-z0-9][A-Za-z0-9_.:/@+\-]{0,159}$")){MessageBox.Show(this,"模型 ID 无效，请从列表选择或填写有效 ID。");return;}
            Result=new(title,id,secret.Password,(string)((ComboBoxItem)agent.SelectedItem).Tag,workspace.Text.Trim(),modelId,(string)((ComboBoxItem)permission.SelectedItem).Tag,autoStart.IsChecked==true,startNow.IsChecked==true);DialogResult=true;
        };
    }
}
