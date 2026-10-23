using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using RouterManager.Core;

namespace RouterManager.App;

public partial class MainWindow : Window
{
    private readonly RouterBackend backend = new();
    private readonly DispatcherTimer timer = new() {Interval=TimeSpan.FromSeconds(5)};
    private IReadOnlyList<BotSnapshot> bots=[];
    private bool refreshing, operating, suppressSelection, dirty, updatingEditor;
    private string? selectedId;
    private BotSnapshot? Selected => bots.FirstOrDefault(b => b.Id == selectedId);
    private readonly QuotaSchedule quotaSchedule=new();
    private CancellationTokenSource? modelCancellation,quotaCancellation;
    private bool queryingQuota,initializingTheme;
    private LogWindow? routeLogWindow;

    public MainWindow()
    {
        InitializeComponent();
        initializingTheme=true;
        ThemeManager.Apply(backend.Preferences.Theme);
        ThemeChoice.SelectedItem=ThemeChoice.Items.OfType<ComboBoxItem>().First(i=>(string)i.Tag==backend.Preferences.Theme);
        initializingTheme=false;
        Loaded += LoadedAsync;
        timer.Tick += async (_,_) => { if (!operating) {await RefreshAsync();await MaybeQueryQuotaAsync();} };
        Workspace.TextChanged += (_,_)=>dirty=true;
        Model.AddHandler(TextBox.TextChangedEvent,new TextChangedEventHandler((_,_)=>{if(!updatingEditor)dirty=true;}));
        Backend.SelectionChanged += async (_,_)=>{if(!updatingEditor){dirty=true;Model.Text="default";await LoadModelsAsync(false);}};
        Closing += OnClosing;
    }
    private async void LoadedAsync(object sender, RoutedEventArgs e)
    {
        var args=Environment.GetCommandLineArgs();
        if(args.Contains("--demo"))
        {
            bots = [
                new("codex","路飞","cli_demo_lufei",BridgeKind.LarkChannel,"codex","default",@"D:\Projects\Workspace","workspace","","LarkChannelBridge.Bot.codex","Running",12560,"已连接",DateTimeOffset.Now,false,null),
                new("dangdang","当当","cli_demo_dangdang",BridgeKind.LarkChannel,"codex","default",@"D:\Projects\Dangdang","full","","LarkChannelBridge.Bot.dangdang","Running",15744,"已连接",DateTimeOffset.Now,false,null),
                new("pi","娟娟","cli_demo_juanjuan",BridgeKind.PiFeishu,"pi","deepseek/deepseek-v4-flash",@"D:\Projects\Pi","由 pi 管理","","Pi-Feishu-Autostart","Running",13884,"已连接",DateTimeOffset.Now,false,null)
            ];
            ShowList();BotList.SelectedIndex=0;Status.Text="演示模式 · 按钮操作已禁用，不会修改真实配置";Actions.IsEnabled=false;AddBotButton.IsEnabled=false;
            Logs.Text="11:29:54  ws.connected        当当 → Codex CLI\n11:30:49  intake.enter         已收到私聊消息\n11:30:53  run.started          正在处理请求\n11:32:06  run.completed        任务完成\n11:32:07  outbound.sent        回复发送成功";
        }
        else await RefreshAsync();
        QuotaGrid.ItemsSource=backend.ReadQuotaCache();UpdateQuotaState();
        var probe=Array.IndexOf(args,"--probe");
        if(probe>=0&&probe+1<args.Length){
            await LoadModelsAsync(false);
            var modelSelectionMatchesId=true;
            if(Model.Items.Count>1){Model.SelectedIndex=1;modelSelectionMatchesId=Model.SelectedItem is ModelOption option&&Model.Text==option.Id;}
            UpdateLayout();
            var themes=new List<object>();
            double Contrast(Brush a,Brush b){
                double L(Brush brush){var c=((SolidColorBrush)brush).Color;double F(byte v){var n=v/255.0;return n<=0.04045?n/12.92:Math.Pow((n+0.055)/1.055,2.4);}return .2126*F(c.R)+.7152*F(c.G)+.0722*F(c.B);}
                var left=L(a);var right=L(b);return (Math.Max(left,right)+.05)/(Math.Min(left,right)+.05);
            }
            foreach(var choice in new[]{"dark","light"}){
                ThemeManager.Apply(choice);Backend.ApplyTemplate();Model.ApplyTemplate();UpdateLayout();
                var editable=Model.Template.FindName("PART_EditableTextBox",Model) as TextBox;
                var item=(ComboBoxItem)Backend.Items[0];
                themes.Add(new{Theme=choice,SelectedContrast=Contrast(Backend.Foreground,Backend.Background),DropdownContrast=Contrast(item.Foreground,item.Background),ModelContrast=editable is null?0:Contrast(editable.Foreground,Model.Background)});
            }
            ThemeManager.Apply(backend.Preferences.Theme);
            var logRows=await Task.Run(()=>backend.ReadRouteLogs(bots,1));
            var newDialog=new NewBotWindow(backend,bots){Owner=this};newDialog.Show();newDialog.UpdateLayout();
            int CountControls(DependencyObject parent,Type type){var count=type.IsInstanceOfType(parent)?1:0;for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++)count+=CountControls(VisualTreeHelper.GetChild(parent,i),type);return count;}
            var botManagement=new{AddEnabled=AddBotButton.IsEnabled,DialogWidth=newDialog.ActualWidth,DialogHeight=newDialog.ActualHeight,MaskedSecretFields=CountControls(newDialog,typeof(PasswordBox)),SelectionLists=CountControls(newDialog,typeof(ComboBox))};newDialog.Close();
            var skillDialog=new SkillManagerWindow(backend,bots.FirstOrDefault()??new BotSnapshot("probe","预览","cli_probe",BridgeKind.LarkChannel,"codex","default","","workspace","","","",null,"",null,false,null),true){Owner=this};skillDialog.Show();skillDialog.UpdateLayout();
            var skillManagement=new{DialogWidth=skillDialog.ActualWidth,DialogHeight=skillDialog.ActualHeight,Buttons=CountControls(skillDialog,typeof(Button)),Lists=CountControls(skillDialog,typeof(ListBox)),PreviewFields=CountControls(skillDialog,typeof(TextBox))};skillDialog.Close();
            var autoDialog=new AutoRouteWindow(backend,bots.FirstOrDefault()??new BotSnapshot("probe","预览","cli_probe",BridgeKind.LarkChannel,"codex","default","","workspace","","","",null,"",null,false,null),true){Owner=this};autoDialog.Show();autoDialog.UpdateLayout();
            var autoRouting=new{DialogWidth=autoDialog.ActualWidth,DialogHeight=autoDialog.ActualHeight,Switches=CountControls(autoDialog,typeof(CheckBox)),Buttons=CountControls(autoDialog,typeof(Button))};autoDialog.Close();
            List<QuotaRow>? quotaProbe=null;if(args.Contains("--probe-quota"))quotaProbe=await backend.QuotasAsync(bots,CancellationToken.None);
            File.WriteAllText(args[probe+1],JsonSerializer.Serialize(new{Bots=bots,backend.Paths,Preferences=backend.Preferences,Themes=themes,Models=Model.Items.Count,ModelSelectionMatchesId=modelSelectionMatchesId,RouteLogs=logRows.Count,LogAgents=logRows.Select(r=>r.Agent).Distinct().ToArray(),Quota=quotaProbe,BotManagement=botManagement,SkillManagement=skillManagement,AutoRouting=autoRouting,Layout=new {Width=ActualWidth,Height=ActualHeight,BotCards=BotList.Items.Count,Backends=Backend.Items.Count,WorkspaceEditor=Workspace.ActualWidth,RoutePanel=Actions.ActualWidth}},new JsonSerializerOptions{WriteIndented=true}));
            Application.Current.Shutdown();return;
        }
        if(!args.Contains("--demo")){timer.Start();await MaybeQueryQuotaAsync();}
    }
    private async Task RefreshAsync()
    {
        if(refreshing||operating)return;refreshing=true;
        try
        {
            bots=await backend.RefreshAsync();ShowList();
            if(backend.Preferences.Theme=="system")ThemeManager.Apply("system");
            if(Selected is { } selected)UpdateDetails(selected, false);
            Status.Text=$"已刷新 {DateTime.Now:HH:mm:ss} · {bots.Count} 个机器人 · 配置保存在原桥接目录";
        }
        catch(Exception e){Status.Text="读取失败："+Redactor.Clean(e.Message);}
        finally{refreshing=false;}
    }
    private void ShowList()
    {
        if(BotList is null)return;
        suppressSelection=true;
        var term=Search?.Text?.Trim()??"";
        var visible=bots.Where(b=>string.Join(" ",b.Name,b.AppId,b.BackendLabel).Contains(term,StringComparison.OrdinalIgnoreCase)).ToArray();
        BotList.ItemsSource=visible;
        BotList.SelectedItem=visible.FirstOrDefault(b=>b.Id==selectedId)??visible.FirstOrDefault();
        var changed=selectedId!=(BotList.SelectedItem as BotSnapshot)?.Id;
        selectedId=(BotList.SelectedItem as BotSnapshot)?.Id;
        suppressSelection=false;
        if(changed&&Selected is {} selected)UpdateDetails(selected,true);
        Overview.Text=$"{bots.Count} 个机器人   /   {bots.Count(b=>b.Pid is not null)} 个运行中   /   {bots.Count(b=>b.Busy)} 个执行任务";
        if(visible.Length==0){BotTitle.Text="未找到机器人";BotSubtitle.Text="点击“新增”配置机器人，或检查搜索条件与集成设置。";Actions.IsEnabled=false;RouteBot.Text="—";RouteBackend.Text="—";BusyBadge.Text="";Workspace.Text="";Model.Text="default";RuntimeDetails.Text="";BotWarning.Text="";PermissionLabel.Text="";ModelSource.Text="";Logs.Text="";}
    }
    private void UpdateDetails(BotSnapshot b,bool resetEditor)
    {
        BotTitle.Text=b.Name;BotSubtitle.Text=$"{b.AppId}  ·  {b.BridgeLabel}";
        RouteBot.Text=b.Name;RouteBackend.Text=b.BackendLabel;
        BusyBadge.Text=b.Busy?"● 正在执行任务":b.StatusLabel;
        PermissionLabel.Text=$"现有权限配置：{b.Permission}。pi 的工具权限由 pi 自身管理。";
        RuntimeDetails.Text=$"PID：{b.Pid?.ToString()??"—"}    自启任务：{b.TaskState}\n{b.TaskName}\n最近事件：{b.LastEvent?.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")??"暂无"}";
        BotWarning.Text=b.Warning??"";Actions.IsEnabled=!operating;
        if(!resetEditor&&!dirty){
            updatingEditor=true;
            Backend.SelectedItem=Backend.Items.OfType<ComboBoxItem>().FirstOrDefault(i=>(string)i.Tag==b.Backend);
            Workspace.Text=b.Workspace;Model.Text=b.Model;dirty=false;updatingEditor=false;
        }
        if(resetEditor)
        {
            updatingEditor=true;
            Backend.SelectedItem=Backend.Items.OfType<ComboBoxItem>().FirstOrDefault(i=>(string)i.Tag==b.Backend);
            Workspace.Text=b.Workspace;Model.Text=b.Model;dirty=false;updatingEditor=false;
            _=LoadModelsAsync(false);
        }
        try{if(!Environment.GetCommandLineArgs().Contains("--demo")){var log=backend.ReadLogs(b);if(Logs.Text!=log){Logs.Text=log;Logs.ScrollToEnd();}}}
        catch(Exception e){Logs.Text="日志暂不可读："+Redactor.Clean(e.Message);}
    }
    private void BotList_SelectionChanged(object sender,SelectionChangedEventArgs e)
    {
        if(suppressSelection)return;
        selectedId=(BotList.SelectedItem as BotSnapshot)?.Id;
        if(Selected is {} selected)UpdateDetails(selected,true);
    }
    private void Search_Changed(object sender,TextChangedEventArgs e)=>ShowList();
    private async void Refresh_Click(object sender,RoutedEventArgs e)
    {
        if(dirty&&MessageBox.Show(this,"刷新将保留未保存的编辑，是否继续刷新运行状态？","刷新状态",MessageBoxButton.YesNo,MessageBoxImage.Information)!=MessageBoxResult.Yes)return;
        await RefreshAsync();
    }
    private async Task RunOperation(string label,Func<Task> action)
    {
        if(operating)return;operating=true;Actions.IsEnabled=false;AddBotButton.IsEnabled=false;
        var editingId=selectedId;var succeeded=false;
        Status.Text=label+"；切换或重启可能需要约一分钟，请勿关闭应用。";
        try{await action();succeeded=true;Status.Text=label+"完成。";dirty=false;}
        catch(Exception e){if(selectedId==editingId)dirty=true;MessageBox.Show(this,Redactor.Clean(e.Message),"操作失败",MessageBoxButton.OK,MessageBoxImage.Error);Status.Text="操作未完成，请查看错误与日志；编辑内容已保留。";}
        finally{operating=false;Actions.IsEnabled=true;AddBotButton.IsEnabled=true;await RefreshAsync();if(succeeded&&Selected is {} b)UpdateDetails(b,true);if(!succeeded&&selectedId==editingId)Status.Text="操作未完成；编辑内容已保留，请检查错误后重试。";}
    }
    private async void AddBot_Click(object sender,RoutedEventArgs e)
    {
        if(operating||Environment.GetCommandLineArgs().Contains("--demo"))return;
        var dialog=new NewBotWindow(backend,bots){Owner=this};
        if(dialog.ShowDialog()!=true||dialog.Result is not {} bot)return;
        await RunOperation("新增机器人",async()=>{await backend.AddBotAsync(bot);Search.Text="";selectedId="managed-"+bot.AppId[4..];});
    }
    private void Skills_Click(object sender,RoutedEventArgs e)
    {
        if(operating||Selected is not {} bot||Environment.GetCommandLineArgs().Contains("--demo"))return;
        new SkillManagerWindow(backend,bot){Owner=this}.ShowDialog();
    }
    private async void AutoRoute_Click(object sender,RoutedEventArgs e)
    {
        if(operating||Selected is not {} bot||Environment.GetCommandLineArgs().Contains("--demo"))return;
        operating=true;
        try{new AutoRouteWindow(backend,bot){Owner=this}.ShowDialog();}
        finally{operating=false;await RefreshAsync();}
    }
    private async void DeleteBot_Click(object sender,RoutedEventArgs e)
    {
        if(operating||Selected is not {} bot||Environment.GetCommandLineArgs().Contains("--demo"))return;
        if(bot.Busy){MessageBox.Show(this,"当前有任务正在执行，请完成后再删除。","暂不可删除");return;}
        var message=$"删除机器人“{bot.Name}”？\n\nApp ID：{bot.AppId}\n当前后端：{bot.BackendLabel}\n\n将停止该机器人的服务、移除对应自启任务和配置。\n工作目录、历史会话、日志和加密凭据保留；配置及任务备份保存到控制台 archives 目录。";
        if(MessageBox.Show(this,message,"删除机器人配置",MessageBoxButton.OKCancel,MessageBoxImage.Warning)!=MessageBoxResult.OK)return;
        await RunOperation("删除机器人",async()=>{var archive=await backend.DeleteBotAsync(bot);MessageBox.Show(this,"已删除机器人配置。\n\n备份位置："+archive,"删除完成",MessageBoxButton.OK,MessageBoxImage.Information);});
    }
    private async void Apply_Click(object sender,RoutedEventArgs e)
    {
        if(Selected is not {} bot)return;
        if(bot.Busy){MessageBox.Show(this,"当前有任务正在执行，请完成后再切换。","暂不可切换");return;}
        if(Backend.SelectedItem is not ComboBoxItem item){MessageBox.Show(this,"请选择后端。");return;}
        var target=(string)item.Tag;var workspace=Workspace.Text.Trim();var model=Model.Text.Trim();
        if(model.Length>0&&!System.Text.RegularExpressions.Regex.IsMatch(model,@"^[A-Za-z0-9][A-Za-z0-9_.:/@+\-]{0,159}$")){MessageBox.Show(this,"模型 ID 不能包含空格，请从列表选择或手动输入有效 ID。");return;}
        if(!Directory.Exists(workspace)){MessageBox.Show(this,"工作目录不存在，请选择已有目录。");return;}
        var text=$"将 {bot.Name} 路由到 {item.Content}。\n\n工作目录：{workspace}\n模型：{model}\n\n会备份配置、停用原自启入口，并启动独立服务；历史会话保留。";
        if(target=="pi"&&bot.Backend!="pi")text+="\n\npi 使用自己的工具执行权限，不能直接继承 Codex 的文件沙箱限制。";
        if(MessageBox.Show(this,text,"应用机器人路由",MessageBoxButton.OKCancel,MessageBoxImage.Information)!=MessageBoxResult.OK)return;
        await RunOperation("应用路由",()=>backend.ApplyAsync(bot,target,workspace,string.IsNullOrWhiteSpace(model)?"default":model));
    }
    private async void Start_Click(object sender,RoutedEventArgs e){if(Selected is {} b)await RunOperation("启动服务",()=>backend.ServiceAsync(b,"start"));}
    private async void Stop_Click(object sender,RoutedEventArgs e)
    {
        if(Selected is not {} b)return;
        if(MessageBox.Show(this,$"停止 {b.Name}？"+(b.Busy?"正在执行的任务会被中断。":""),"停止服务",MessageBoxButton.OKCancel,MessageBoxImage.Warning)==MessageBoxResult.OK)await RunOperation("停止服务",()=>backend.ServiceAsync(b,"stop"));
    }
    private async void Restart_Click(object sender,RoutedEventArgs e)
    {
        if(Selected is not {} b)return;
        if(b.Busy&&MessageBox.Show(this,"重启会中断当前任务。是否继续？","重启服务",MessageBoxButton.YesNo,MessageBoxImage.Warning)!=MessageBoxResult.Yes)return;
        await RunOperation("重启服务",()=>backend.ServiceAsync(b,"restart"));
    }
    private void OpenLogs_Click(object sender,RoutedEventArgs e)
    {
        if(Selected is not {} b)return;
        var dir=backend.LogDirectory(b);if(Directory.Exists(dir))Process.Start(new ProcessStartInfo("explorer.exe"){ArgumentList={dir},UseShellExecute=true});
    }
    private async void Settings_Click(object sender,RoutedEventArgs e)
    {
        if(operating)return;
        if(new SettingsWindow(backend){Owner=this}.ShowDialog()==true){
            initializingTheme=true;ThemeChoice.SelectedItem=ThemeChoice.Items.OfType<ComboBoxItem>().First(i=>(string)i.Tag==backend.Preferences.Theme);initializingTheme=false;
            ThemeManager.Apply(backend.Preferences.Theme);quotaSchedule.Reset();
            if(!backend.Preferences.QuotaEnabled)quotaCancellation?.Cancel();
            await RefreshAsync();UpdateQuotaState();await MaybeQueryQuotaAsync();
        }
    }
    private void OnClosing(object? sender,CancelEventArgs e)
    {
        if(operating){e.Cancel=true;MessageBox.Show(this,"操作尚未结束，请等待完成或自动恢复后再关闭。","后台操作中");return;}
        timer.Stop();modelCancellation?.Cancel();quotaCancellation?.Cancel();routeLogWindow?.Close();
    }
    private async Task LoadModelsAsync(bool refresh)
    {
        if(Selected is not {} bot||Backend.SelectedItem is not ComboBoxItem item)return;
        modelCancellation?.Cancel();modelCancellation=new();var cancellation=modelCancellation;
        var agent=(string)item.Tag;ModelSource.Text="正在读取 Agent 模型…";
        try{
            var result=await backend.ModelsAsync(bot,agent,refresh,cancellation.Token);
            if(cancellation.IsCancellationRequested||Selected?.Id!=bot.Id||(Backend.SelectedItem as ComboBoxItem)?.Tag?.ToString()!=agent)return;
            var text=Model.Text;var wasDirty=dirty;updatingEditor=true;
            Model.ItemsSource=result.Models;Model.Text=string.IsNullOrEmpty(text)?"default":text;
            dirty=wasDirty;updatingEditor=false;ModelSource.Text=$"{result.Models.Count-1} 个模型 · {result.Note}";
        }catch(OperationCanceledException){}
        catch(Exception e){if(!cancellation.IsCancellationRequested)ModelSource.Text="模型读取失败，可手动输入："+Redactor.Clean(e.Message);}
    }
    private async void ModelsRefresh_Click(object sender,RoutedEventArgs e)=>await LoadModelsAsync(true);
    private void Theme_Changed(object sender,SelectionChangedEventArgs e)
    {
        if(initializingTheme||ThemeChoice.SelectedItem is not ComboBoxItem item)return;
        var theme=(string)item.Tag;
        try{backend.SavePreferences(backend.Preferences with{Theme=theme});ThemeManager.Apply(theme);}
        catch(Exception error){Status.Text="主题设置保存失败："+error.Message;}
    }
    private async Task MaybeQueryQuotaAsync()
    {
        if(bots.Count==0||!quotaSchedule.TryBegin(backend.Preferences,DateTimeOffset.Now)){UpdateQuotaState();return;}
        try{await QueryQuotaAsync();}finally{quotaSchedule.Complete(backend.Preferences,DateTimeOffset.Now);UpdateQuotaState();}
    }
    private async Task QueryQuotaAsync()
    {
        if(queryingQuota)return;queryingQuota=true;quotaCancellation=new();QuotaState.Text="正在查询 Agent 额度…";
        try{QuotaGrid.ItemsSource=await backend.QuotasAsync(bots,quotaCancellation.Token);}
        catch(OperationCanceledException){}
        catch(Exception e){QuotaState.Text="额度查询失败："+Redactor.Clean(e.Message);}
        finally{queryingQuota=false;UpdateQuotaState();}
    }
    private async void QuotaRefresh_Click(object sender,RoutedEventArgs e){await QueryQuotaAsync();quotaSchedule.Complete(backend.Preferences,DateTimeOffset.Now);UpdateQuotaState();}
    private void UpdateQuotaState()
    {
        if(queryingQuota)return;
        QuotaState.Text=backend.Preferences.QuotaEnabled?$"定时查询已开启 · 每 {backend.Preferences.QuotaIntervalMinutes} 分钟"+(quotaSchedule.NextDue is {} at?$" · 下次 {at.LocalDateTime:HH:mm}":""):"定时查询已关闭 · 可手动查询；关闭窗口后不查询。";
    }
    private void RouteLogs_Click(object sender,RoutedEventArgs e)
    {
        if(routeLogWindow is null||!routeLogWindow.IsLoaded){routeLogWindow=new LogWindow(backend,()=>bots){Owner=this};routeLogWindow.Show();}else routeLogWindow.Activate();
    }
}
