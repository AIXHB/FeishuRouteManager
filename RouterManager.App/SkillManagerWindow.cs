using System.Windows;
using System.Windows.Controls;
using RouterManager.Core;

namespace RouterManager.App;

public sealed class SkillManagerWindow : Window
{
    private readonly ListBox list = new() { DisplayMemberPath = "Id", MinWidth = 190 };
    private readonly TextBox preview = new() { IsReadOnly = true, TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    private readonly TextBlock status = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 0) };
    private readonly StackPanel buttons = new() { Orientation = Orientation.Horizontal };
    private bool changing;

    public SkillManagerWindow(RouterBackend backend, BotSnapshot bot, bool previewOnly = false)
    {
        Title = bot.Name + " · 专属 Skills"; Width = 860; Height = 680; MinWidth = 680; MinHeight = 480;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var panel = new Grid { Margin = new Thickness(24) }; Content = panel;
        panel.RowDefinitions.Add(new() { Height = GridLength.Auto });
        panel.RowDefinitions.Add(new() { Height = GridLength.Auto });
        panel.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        panel.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var heading = new TextBlock { Text = bot.Name + " 的专属 Skills", FontSize = 24, FontWeight = FontWeights.SemiBold };
        panel.Children.Add(heading);
        var note = new TextBlock { Text = $"App ID：{bot.AppId}\n从包含 SKILL.md 的本地文件夹安装，支持 scripts / references / assets。安装目录按机器人隔离，与工作目录和目标后端无关。\n请先停止机器人再操作；卸载只归档该机器人安装的副本，来源文件和其他机器人不变。启用此功能需部署本版桥接。",
            TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 12, 0, 12) };
        note.SetResourceReference(TextBlock.ForegroundProperty, "Muted"); Grid.SetRow(note, 1); panel.Children.Add(note);
        var body = new Grid(); body.ColumnDefinitions.Add(new() { Width = new GridLength(210) });
        body.ColumnDefinitions.Add(new() { Width = new GridLength(14) }); body.ColumnDefinitions.Add(new());
        body.Children.Add(list); Grid.SetColumn(preview, 2); body.Children.Add(preview); Grid.SetRow(body, 2); panel.Children.Add(body);
        list.SelectionChanged += (_, _) => preview.Text = (list.SelectedItem as BotSkill)?.Preview ?? "选择 skill 查看 SKILL.md。";
        var footer = new StackPanel { Margin = new Thickness(0, 12, 0, 0) }; footer.Children.Add(buttons); footer.Children.Add(status);
        Grid.SetRow(footer, 3); panel.Children.Add(footer); status.SetResourceReference(TextBlock.ForegroundProperty, "Muted");
        var install = new Button { Content = "安装本地 Skill…" }; var uninstall = new Button { Content = "卸载选中 Skill" }; var refresh = new Button { Content = "刷新列表" };
        buttons.Children.Add(install); buttons.Children.Add(uninstall); buttons.Children.Add(refresh);
        void Refresh() {
            try {
                var id = (list.SelectedItem as BotSkill)?.Id;
                list.ItemsSource = backend.Skills(bot); list.SelectedItem = list.Items.OfType<BotSkill>().FirstOrDefault(s => s.Id == id) ?? list.Items.OfType<BotSkill>().FirstOrDefault();
                status.Text = $"已安装 {list.Items.Count} 个 · {backend.SkillDirectory(bot)}";
            } catch (Exception e) { status.Text = "读取失败：" + Redactor.Clean(e.Message); }
        }
        async Task Change(string? source = null, string? id = null) {
            if (changing) return; changing = true; buttons.IsEnabled = false; status.Text = "正在更新当前机器人的专属 skill…";
            try { await backend.ChangeSkillAsync(bot, source, id); Refresh(); }
            catch (Exception e) { status.Text = Redactor.Clean(e.Message); MessageBox.Show(this, status.Text, "Skill 操作未完成", MessageBoxButton.OK, MessageBoxImage.Warning); }
            finally { changing = false; buttons.IsEnabled = true; }
        }
        install.Click += async (_, _) => {
            var picker = new Microsoft.Win32.OpenFolderDialog { Title = "选择包含 SKILL.md 的 skill 文件夹" };
            if (picker.ShowDialog(this) != true) return;
            if (MessageBox.Show(this, $"安装到机器人“{bot.Name}”？\n\n来源：{picker.FolderName}\n\nSkill 会指导 Agent 执行操作，请仅安装可信内容。安装时只复制文件，不执行脚本。", "安装专属 Skill", MessageBoxButton.OKCancel, MessageBoxImage.Information) == MessageBoxResult.OK)
                await Change(source: picker.FolderName);
        };
        uninstall.Click += async (_, _) => {
            if (list.SelectedItem is not BotSkill skill) { status.Text = "请先选择要卸载的 skill。"; return; }
            if (MessageBox.Show(this, $"从“{bot.Name}”卸载 {skill.Id}？\n只移出当前机器人的专属目录，副本保留在 skill-archives。", "卸载专属 Skill", MessageBoxButton.OKCancel, MessageBoxImage.Warning) == MessageBoxResult.OK)
                await Change(id: skill.Id);
        };
        refresh.Click += (_, _) => Refresh();
        Closing += (_, e) => { if (changing) e.Cancel = true; };
        if (previewOnly) {
            buttons.IsEnabled = false; list.ItemsSource = new[] { new BotSkill("example", "", "# Example\n机器人专属 skill 预览。") }; list.SelectedIndex = 0;
            status.Text = "只读预览 · 未访问或修改真实 skill。";
        } else Refresh();
    }
}
