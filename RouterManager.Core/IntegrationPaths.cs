using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace RouterManager.Core;

public sealed record IntegrationPaths(string ChannelHome, string BridgeEntry, string PiRoot, string NodeBinary, string ManagerRoot)
{
    public static IntegrationPaths Detect(IEnumerable<TaskSnapshot> tasks, IEnumerable<BotSnapshot> bots)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var channelHome = Path.Combine(home, ".lark-channel");
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FeishuRouterManager");
        string bridge = "";
        var pi = BotDiscovery.InferPiRoots(tasks, bots).FirstOrDefault() ?? "";
        foreach (var task in tasks.Where(t => t.Name.StartsWith("LarkChannelBridge.", StringComparison.Ordinal)))
        foreach (Match match in Regex.Matches(task.Arguments, "\"([^\"]+)\""))
        {
            var wrapper = match.Groups[1].Value;
            if (!File.Exists(wrapper) || !new[] { ".vbs", ".cmd", ".ps1" }.Contains(Path.GetExtension(wrapper), StringComparer.OrdinalIgnoreCase)) continue;
            var content = File.ReadAllText(wrapper);
            var entry = Regex.Match(content, "[A-Za-z]:[^\"\r\n]*?lark-channel-bridge\\.mjs");
            if (entry.Success && File.Exists(entry.Value)) bridge = entry.Value;
        }
        var node = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        return new(channelHome, bridge, pi, node, root);
    }
    public static IntegrationPaths LoadOrDetect(IEnumerable<TaskSnapshot> tasks, IEnumerable<BotSnapshot> bots)
    {
        var detected = Detect(tasks, bots);
        var config = JsonFiles.Read(Path.Combine(detected.ManagerRoot, "integrations.json"));
        if (config is null) return detected;
        return detected with {
            ChannelHome = JsonFiles.Text(config["ChannelHome"], detected.ChannelHome),
            BridgeEntry = JsonFiles.Text(config["BridgeEntry"], detected.BridgeEntry),
            PiRoot = JsonFiles.Text(config["PiRoot"], detected.PiRoot),
            NodeBinary = JsonFiles.Text(config["NodeBinary"], detected.NodeBinary)
        };
    }
}
