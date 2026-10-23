using System.Text.RegularExpressions;

namespace RouterManager.Core;

public sealed record BotSkill(string Id, string Path, string Preview);

public sealed class BotSkills(string managerRoot)
{
    private static readonly Regex IdPattern = new("^[a-z0-9][a-z0-9-]{0,63}$", RegexOptions.CultureInvariant);
    private static readonly string[] Forbidden = [".git", ".pi", ".agent", ".agents", ".lark-channel", "node_modules", ".env", "auth.json", "secrets.enc", ".keystore.salt"];

    public string Root(string appId)
    {
        if (!Regex.IsMatch(appId, "^cli_[A-Za-z0-9]+$")) throw new ArgumentException("无效的机器人 App ID。");
        var root = System.IO.Path.GetFullPath(managerRoot);
        SafePath(root);
        foreach (var part in new[] { "bots", appId, "skills" }) { root = System.IO.Path.Combine(root, part); SafePath(root); }
        return root;
    }

    public IReadOnlyList<BotSkill> List(string appId)
    {
        var root = Root(appId);
        if (!Directory.Exists(root)) return [];
        return Directory.EnumerateDirectories(root).Where(d => ValidId(System.IO.Path.GetFileName(d))).Select(d => {
            SafePath(d); var file = System.IO.Path.Combine(d, "SKILL.md"); SafePath(file);
            var preview = File.Exists(file) ? ReadSkill(file) : "缺少 SKILL.md，可卸载后重新安装。";
            return new BotSkill(System.IO.Path.GetFileName(d), d, preview);
        }).OrderBy(s => s.Id).ToArray();
    }

    public BotSkill Install(string appId, string source)
    {
        var root = Root(appId); var runtime = Directory.GetParent(root)!.FullName;
        source = System.IO.Path.GetFullPath(source);
        if (!Directory.Exists(source)) throw new ArgumentException("请选择包含 SKILL.md 的 skill 文件夹。");
        // Reject ancestors too: a normal folder can sit inside a directory junction.
        for (var p = new DirectoryInfo(source); p is not null; p = p.Parent) SafePath(p.FullName);
        if (Within(source, runtime) || Within(runtime, source)) throw new ArgumentException("来源目录不能与机器人运行目录重叠。");
        var document = System.IO.Path.Combine(source, "SKILL.md"); SafePath(document);
        var text = ReadSkill(document);
        if (string.IsNullOrWhiteSpace(text)) throw new ArgumentException("SKILL.md 不能为空。");
        var header = Regex.Match(text, @"\A(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)");
        var name = Regex.Match(header.Groups[1].Value, @"^name:[ \t]*['""]?([a-z0-9-]+)['""]?[ \t]*\r?$", RegexOptions.Multiline);
        var id = name.Success ? name.Groups[1].Value : System.IO.Path.GetFileName(source);
        if (!ValidId(id)) throw new ArgumentException("skill 名称须为小写字母、数字、短横线，最多 64 字符，且不能使用 Windows 保留名称。");
        Directory.CreateDirectory(runtime);
        var lockPath = System.IO.Path.Combine(runtime, "skills.lock"); SafePath(lockPath);
        using var gate = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        Directory.CreateDirectory(root);
        if (List(appId).Count >= 128) throw new InvalidOperationException("每个机器人最多安装 128 个专属 skill。");
        var target = System.IO.Path.Combine(root, id); SafePath(target);
        if (Directory.Exists(target) || File.Exists(target)) throw new InvalidOperationException("该机器人已安装同名 skill，请先卸载后再安装。");
        var staging = System.IO.Path.Combine(root, ".install-" + Guid.NewGuid().ToString("N"));
        try {
            long bytes = 0; var files = 0;
            void Copy(string from, string to, int depth) {
                if (depth > 20) throw new ArgumentException("skill 目录层级过深。");
                SafePath(from); Directory.CreateDirectory(to);
                foreach (var entry in Directory.EnumerateFileSystemEntries(from)) {
                    SafePath(entry); var leaf = System.IO.Path.GetFileName(entry);
                    if (Forbidden.Contains(leaf, StringComparer.OrdinalIgnoreCase) || leaf.StartsWith(".env.", StringComparison.OrdinalIgnoreCase))
                        throw new ArgumentException("skill 包含运行数据、凭据或依赖目录，不能安装：" + leaf);
                    var dest = System.IO.Path.Combine(to, leaf);
                    if (Directory.Exists(entry)) Copy(entry, dest, depth + 1);
                    else {
                        bytes += new FileInfo(entry).Length;
                        if (++files > 2048 || bytes > 64 * 1024 * 1024) throw new ArgumentException("skill 超过 2048 个文件或 64 MB 限制。");
                        File.Copy(entry, dest);
                    }
                }
            }
            Copy(source, staging, 0);
            // Recheck the published tree before the atomic directory rename.
            CheckTree(staging); SafePath(root); Directory.Move(staging, target);
            return new(id, target, ReadSkill(System.IO.Path.Combine(target, "SKILL.md")));
        }
        finally { if (Directory.Exists(staging)) DeleteOwned(root, staging); }
    }

    public void Uninstall(string appId, string id)
    {
        if (!ValidId(id)) throw new ArgumentException("无效的 skill 名称。");
        var root = Root(appId); var runtime = Directory.GetParent(root)!.FullName;
        Directory.CreateDirectory(runtime);
        var lockPath = System.IO.Path.Combine(runtime, "skills.lock"); SafePath(lockPath);
        using var gate = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var target = System.IO.Path.Combine(root, id);
        if (!Directory.Exists(target)) throw new InvalidOperationException("该 skill 已不存在，请刷新列表。");
        CheckTree(target);
        var archive = System.IO.Path.Combine(runtime, "skill-archives"); SafePath(archive); Directory.CreateDirectory(archive);
        Directory.Move(target, System.IO.Path.Combine(archive, id + "-" + Guid.NewGuid().ToString("N")));
    }

    private static bool ValidId(string id) => IdPattern.IsMatch(id) && !Regex.IsMatch(id, @"^(con|prn|aux|nul|com[1-9]|lpt[1-9])$", RegexOptions.IgnoreCase);
    private static bool Within(string path, string root) => string.Equals(path, root, StringComparison.OrdinalIgnoreCase) || path.StartsWith(root.TrimEnd('\\', '/') + System.IO.Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    private static void SafePath(string path) {
        try {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("不支持符号链接或目录联接：" + path);
        } catch (FileNotFoundException) {} catch (DirectoryNotFoundException) {}
    }
    private static string ReadSkill(string file) {
        if (!File.Exists(file)) throw new ArgumentException("所选文件夹缺少 SKILL.md。");
        if (new FileInfo(file).Length > 128 * 1024) throw new ArgumentException("SKILL.md 超过 128 KB 限制。");
        return File.ReadAllText(file);
    }
    private static void CheckTree(string root) {
        SafePath(root);
        foreach (var entry in Directory.EnumerateFileSystemEntries(root)) { SafePath(entry); if (Directory.Exists(entry)) CheckTree(entry); }
    }
    private static void DeleteOwned(string root, string target) {
        root = System.IO.Path.GetFullPath(root); target = System.IO.Path.GetFullPath(target);
        if (!Within(target, root) || string.Equals(root, target, StringComparison.OrdinalIgnoreCase)) throw new IOException("拒绝删除 skill 目录以外的路径。");
        SafePath(root); CheckTree(target); Directory.Delete(target, true);
    }
}
