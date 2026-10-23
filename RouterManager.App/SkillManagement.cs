using RouterManager.Core;

namespace RouterManager.App;

public sealed partial class RouterBackend
{
    public string SkillDirectory(BotSnapshot bot) => new BotSkills(Paths.ManagerRoot).Root(bot.AppId);
    public IReadOnlyList<BotSkill> Skills(BotSnapshot bot) => new BotSkills(Paths.ManagerRoot).List(bot.AppId);

    public async Task ChangeSkillAsync(BotSnapshot bot, string? source = null, string? uninstall = null)
    {
        if ((source is null) == (uninstall is null)) throw new ArgumentException("请选择安装或卸载操作。");
        await operation.WaitAsync();
        try {
            var current = (await RefreshAsync()).SingleOrDefault(b => b.AppId == bot.AppId)
                ?? throw new InvalidOperationException("机器人已移除，请刷新列表。");
            if (current.Busy || current.Pid is not null || current.TaskState.Equals("Running", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("请先停止该机器人，再安装或卸载 skill，避免影响正在执行的任务。");
            var store = new BotSkills(Paths.ManagerRoot);
            var id = await Task.Run(() => {
                if (source is not null) return store.Install(current.AppId, source).Id;
                store.Uninstall(current.AppId, uninstall!); return uninstall!;
            });
            Audit(current, current.Backend, source is not null ? "skill.install.completed" : "skill.uninstall.completed", "机器人专属 skill：" + id);
        }
        catch (Exception e) { Audit(bot, bot.Backend, "skill.change.failed", e.Message, "error"); throw; }
        finally { operation.Release(); }
    }
}
