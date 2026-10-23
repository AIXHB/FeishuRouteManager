using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Threading;
using RouterManager.Core;
namespace RouterManager.App;

public sealed record LogTreeNode(string Header,string? BotId,string? Agent,List<LogTreeNode> Children);
public sealed class LogWindow : Window
{
    private readonly RouterBackend backend;
    private readonly Func<IReadOnlyList<BotSnapshot>> getBots;
    private readonly ComboBox order=new(){Width=205},robot=new(){Width=160},agent=new(){Width=165},level=new(){Width=100},period=new(){Width=120};
    private readonly TextBox search=new(){Width=250};
    private readonly TreeView tree=new();
    private readonly DataGrid grid=new();
    private readonly TextBlock state=new(){TextWrapping=TextWrapping.Wrap};
    private readonly DispatcherTimer timer=new(){Interval=TimeSpan.FromSeconds(5)};
    private IReadOnlyList<RouteLogEntry> entries=[];
    private string? treeBot,treeAgent;
    private bool ready,refreshing;
    public LogWindow(RouterBackend backend,Func<IReadOnlyList<BotSnapshot>> bots)
    {
        this.backend=backend;getBots=bots;Title="路由日志 · 机器人与 Agent";Width=1280;Height=780;MinWidth=1050;MinHeight=650;WindowStartupLocation=WindowStartupLocation.CenterOwner;
        var root=new Grid{Margin=new Thickness(22)};Content=root;
        root.RowDefinitions.Add(new(){Height=GridLength.Auto});root.RowDefinitions.Add(new(){Height=GridLength.Auto});root.RowDefinitions.Add(new());root.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var title=new DockPanel();var heading=new TextBlock{Text="路由日志",FontSize=24,FontWeight=FontWeights.SemiBold,Margin=new Thickness(0,0,18,12)};title.Children.Add(heading);
        Add(order,"机器人 → Agent","bot");Add(order,"Agent → 机器人","agent");order.SelectedIndex=0;title.Children.Add(order);
        Add(period,"最近 24 小时","1");Add(period,"最近 7 天","7");Add(period,"最近 30 天","30");period.SelectedIndex=0;period.Margin=new Thickness(12,5,0,12);title.Children.Add(period);
        var refresh=new Button{Content="刷新日志",Margin=new Thickness(16,0,0,10)};refresh.Click+=async(_,_)=>await RefreshAsync();DockPanel.SetDock(refresh,Dock.Right);title.Children.Add(refresh);root.Children.Add(title);
        var filters=new WrapPanel();Grid.SetRow(filters,1);root.Children.Add(filters);
        Add(robot,"全部机器人","");foreach(var b in bots())Add(robot,b.Name,b.Id);robot.SelectedIndex=0;
        Add(agent,"全部 Agent","");Add(agent,"Codex CLI","codex");Add(agent,"Antigravity CLI","antigravity");Add(agent,"pi Agent","pi");Add(agent,"Agent 未记录","unknown");agent.SelectedIndex=0;
        Add(level,"全部级别","");Add(level,"错误","error");Add(level,"警告","warn");Add(level,"信息","info");level.SelectedIndex=0;
        foreach(var control in new Control[]{robot,agent,level,search}){control.Margin=new Thickness(0,0,10,14);filters.Children.Add(control);}search.ToolTip="搜索事件、机器人或日志内容";
        var body=new Grid();Grid.SetRow(body,2);root.Children.Add(body);body.ColumnDefinitions.Add(new(){Width=new GridLength(250)});body.ColumnDefinitions.Add(new(){Width=new GridLength(12)});body.ColumnDefinitions.Add(new());body.Children.Add(tree);Grid.SetColumn(grid,2);body.Children.Add(grid);
        var template=new HierarchicalDataTemplate(typeof(LogTreeNode)){ItemsSource=new Binding("Children")};var text=new FrameworkElementFactory(typeof(TextBlock));text.SetBinding(TextBlock.TextProperty,new Binding("Header"));template.VisualTree=text;tree.ItemTemplate=template;
        grid.Columns.Add(new DataGridTextColumn{Header="时间",Binding=new Binding("TimeLabel"),Width=125});grid.Columns.Add(new DataGridTextColumn{Header="机器人",Binding=new Binding("Bot"),Width=80});grid.Columns.Add(new DataGridTextColumn{Header="Agent",Binding=new Binding("AgentLabel"),Width=120});grid.Columns.Add(new DataGridTextColumn{Header="来源",Binding=new Binding("Source"),Width=65});grid.Columns.Add(new DataGridTextColumn{Header="事件",Binding=new Binding("Event"),Width=185});
        var wrap=new Style(typeof(TextBlock));wrap.Setters.Add(new Setter(TextBlock.TextWrappingProperty,TextWrapping.Wrap));grid.Columns.Add(new DataGridTextColumn{Header="详情",Binding=new Binding("Summary"),Width=new DataGridLength(1,DataGridLengthUnitType.Star),ElementStyle=wrap});
        Grid.SetRow(state,3);state.Margin=new Thickness(0,12,0,0);state.SetResourceReference(TextBlock.ForegroundProperty,"Muted");root.Children.Add(state);
        void FilterChanged(){if(!ready)return;treeBot=null;treeAgent=null;Render();}
        order.SelectionChanged+=(_,_)=>FilterChanged();robot.SelectionChanged+=(_,_)=>FilterChanged();agent.SelectionChanged+=(_,_)=>FilterChanged();level.SelectionChanged+=(_,_)=>FilterChanged();search.TextChanged+=(_,_)=>FilterChanged();period.SelectionChanged+=async(_,_)=>{if(ready)await RefreshAsync();};
        tree.SelectedItemChanged+=(_,e)=>{if(e.NewValue is LogTreeNode node){treeBot=node.BotId;treeAgent=node.Agent;ShowRows();}};
        timer.Tick+=async(_,_)=>await RefreshAsync();Loaded+=async(_,_)=>{ready=true;await RefreshAsync();timer.Start();};Closed+=(_,_)=>timer.Stop();
    }
    private static void Add(ComboBox box,string name,string value)=>box.Items.Add(new ComboBoxItem{Content=name,Tag=value});
    private static string? Value(ComboBox box)=>box.SelectedItem is ComboBoxItem i&&i.Tag is string s&&s.Length>0?s:null;
    private async Task RefreshAsync()
    {
        if(refreshing)return;refreshing=true;
        try{var days=int.Parse(Value(period)??"1");var bots=getBots().ToArray();entries=await Task.Run(()=>backend.ReadRouteLogs(bots,days));Render();}
        catch(Exception e){state.Text="日志读取失败："+Redactor.Clean(e.Message);}
        finally{refreshing=false;}
    }
    private IReadOnlyList<RouteLogEntry> Filtered()=>RouteLogs.Filter(entries,Value(robot),Value(agent),Value(level),search.Text);
    private void Render()
    {
        var rows=Filtered();var list=new List<LogTreeNode>{new($"全部日志（{rows.Count}）",null,null,[])};
        if(Value(order)=="agent")
            foreach(var group in rows.GroupBy(e=>e.Agent).OrderBy(g=>g.Key))list.Add(new($"{group.First().AgentLabel}（{group.Count()}）",null,group.Key,group.GroupBy(e=>e.BotId).Select(g=>new LogTreeNode($"{g.First().Bot}（{g.Count()}）",g.Key,group.Key,[])).ToList()));
        else
            foreach(var group in rows.GroupBy(e=>e.BotId).OrderBy(g=>g.First().Bot))list.Add(new($"{group.First().Bot}（{group.Count()}）",group.Key,null,group.GroupBy(e=>e.Agent).Select(g=>new LogTreeNode($"{g.First().AgentLabel}（{g.Count()}）",group.Key,g.Key,[])).ToList()));
        tree.ItemsSource=list;ShowRows();
    }
    private void ShowRows()
    {
        var rows=RouteLogs.Filter(Filtered(),treeBot,treeAgent,null,"");grid.ItemsSource=rows;
        state.Text=$"显示 {rows.Count} / {entries.Count} 条 · 最多读取 5000 条 · {DateTime.Now:HH:mm:ss} 更新 · 历史 Agent 缺失时标注“未记录”，不按当前路由猜测。";
    }
}
