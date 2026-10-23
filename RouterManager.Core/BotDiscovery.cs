using System.Text.Json.Nodes;
namespace RouterManager.Core;

public sealed class BotDiscovery(string channelHome)
{
    public IReadOnlyList<BotSnapshot> Discover(IReadOnlyList<TaskSnapshot> tasks, IReadOnlySet<int> liveBridgePids)
    {
        var result = new List<BotSnapshot>();
        var root = JsonFiles.Read(Path.Combine(channelHome, "config.json"));
        var registry = JsonFiles.Read(Path.Combine(channelHome, "registry", "processes.json"));
        var entries = registry?["entries"] as JsonArray ?? [];
        if (root?["profiles"] is JsonObject profiles)
        {
            foreach (var pair in profiles)
            {
                if (pair.Value is not JsonObject p) continue;
                var profile = pair.Key;
                var entry = entries.OfType<JsonObject>().FirstOrDefault(e => JsonFiles.Text(e["profileName"]) == profile &&
                    int.TryParse(JsonFiles.Text(e["pid"]), out var id) && liveBridgePids.Contains(id));
                int? pid = int.TryParse(JsonFiles.Text(entry?["pid"]), out var parsed) ? parsed : null;
                var logs = Path.Combine(channelHome, "profiles", profile, "logs");
                var state = ReadChannelState(logs);
                var taskName = $"LarkChannelBridge.Bot.{profile}";
                var task = tasks.FirstOrDefault(t => t.Name == taskName);
                var workspace = JsonFiles.Text(p["workspaces"]?["default"]);
                result.Add(new(profile, JsonFiles.Text(entry?["botName"], state.Name ?? profile),
                    JsonFiles.Text(p["accounts"]?["app"]?["id"]), BridgeKind.LarkChannel,
                    JsonFiles.Text(p["agentKind"]), JsonFiles.Text(p["preferences"]?["model"], "default"),
                    workspace, JsonFiles.Text(p["permissions"]?["defaultAccess"], "workspace"), channelHome,
                    taskName, task?.State ?? "未注册", pid, pid is null ? "已停止" : state.Connection,
                    state.Time, pid is not null && state.Busy, state.Warning));
            }
        }
        return result;
    }

    public BotSnapshot? DiscoverPi(string root, IReadOnlyList<TaskSnapshot> tasks, IReadOnlySet<int> liveBridgePids)
    {
        var cfg = JsonFiles.Read(Path.Combine(root, ".pi", "feishu.json"));
        if (cfg is null) return null;
        var settings = JsonFiles.Read(Path.Combine(root, ".agent", "settings.json"));
        var health = JsonFiles.Read(Path.Combine(root, "connection-health.json"));
        int? pid = int.TryParse(JsonFiles.Text(health?["pid"]), out var id) && liveBridgePids.Contains(id) ? id : null;
        DateTimeOffset? time = DateTimeOffset.TryParse(JsonFiles.Text(health?["time"]), out var dt) ? dt : null;
        var fresh = time is not null && DateTimeOffset.UtcNow - time < TimeSpan.FromSeconds(90);
        var task = tasks.FirstOrDefault(t => t.Name == "Pi-Feishu-Autostart");
        var state = JsonFiles.Text(health?["state"]);
        var name = JsonFiles.Text(cfg["botName"], "pi Agent");
        var pointers = JsonFiles.Read(Path.Combine(root, "bridge-log-paths.json"));
        foreach (var key in new[] { "stdout", "stderr" })
        {
            var file=JsonFiles.Text(pointers?[key]);
            if (!File.Exists(file)) continue;
            using var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);
            using var reader=new StreamReader(stream);
            for(var i=0;i<20;i++)
            {
                var line=reader.ReadLine();if(line is null)break;
                var match=System.Text.RegularExpressions.Regex.Match(line,@"Feishu bot connected as (.+)\.$");
                if(match.Success)name=match.Groups[1].Value;
            }
        }
        var busy = IsPiBusy(JsonFiles.Text(pointers?["stdout"]));
        return new("pi:" + JsonFiles.Text(cfg["appId"]), name,
            JsonFiles.Text(cfg["appId"]), BridgeKind.PiFeishu, "pi",
            $"{JsonFiles.Text(settings?["defaultProvider"])}/{JsonFiles.Text(settings?["defaultModel"])}",
            root, "由 pi 管理", root, task?.Name ?? "Pi-Feishu-Autostart", task?.State ?? "未注册", pid,
            pid is null ? "已停止" : !fresh ? "心跳过期" : state == "connected" ? "已连接" : "重连中",
            time, pid is not null && busy, pid is not null && !fresh ? "进程存在，但超过 90 秒没有更新连接心跳。" : null);
    }

    public static bool IsPiBusy(string log)
    {
        var pending=new HashSet<string>();
        foreach(var line in JsonFiles.Tail(log,1000,524288))
        {
            JsonObject? row;try{row=JsonNode.Parse(line) as JsonObject;}catch(System.Text.Json.JsonException){continue;}
            var kind=JsonFiles.Text(row?["event"]);var id=JsonFiles.Text(row?["messageId"]);
            if(kind=="bridge_started")pending.Clear();
            if(kind=="message_start")pending.Add(id);
            if(kind is "message_done" or "message_failed")pending.Remove(id);
        }
        return pending.Count>0;
    }

    public static IEnumerable<string> InferPiRoots(IEnumerable<TaskSnapshot> tasks, IEnumerable<BotSnapshot> bots)
    {
        var candidates = bots.Select(b => b.Workspace).ToList();
        foreach (var task in tasks.Where(t => t.Name.Contains("Feishu", StringComparison.OrdinalIgnoreCase)))
            foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(task.Arguments, "\"([^\"]+)\""))
                if (Path.GetDirectoryName(match.Groups[1].Value) is { } dir) candidates.Add(dir);
        return candidates.Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(Path.Combine(p, ".pi", "feishu.json")))
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static (string? Name, string Connection, DateTimeOffset? Time, bool Busy, string? Warning) ReadChannelState(string logs)
    {
        if (!Directory.Exists(logs)) return (null, "状态未知", null, false, "未发现日志");
        var files = Directory.GetFiles(logs, "bridge-*.jsonl").OrderDescending(StringComparer.Ordinal).Take(2).Reverse();
        string? name = null, warning = null;
        var connection = "状态未知"; bool busy = false; DateTimeOffset? time = null;
        foreach (var file in files)
        foreach (var line in JsonFiles.Tail(file, 600, 524288))
        {
            JsonObject? e;
            try { e = JsonNode.Parse(line) as JsonObject; } catch (System.Text.Json.JsonException) { continue; }
            if (e is null) continue;
            if (DateTimeOffset.TryParse(JsonFiles.Text(e["ts"]), out var dt)) time = dt;
            var key = $"{JsonFiles.Text(e["phase"])}.{JsonFiles.Text(e["event"])}";
            if (key == "ws.connected") { name = JsonFiles.Text(e["bot"], name ?? ""); connection = "已连接"; warning = null; busy = false; }
            if (key is "ws.reconnected" or "network.reachable-again") connection = key == "ws.reconnected" ? "已连接" : "网络恢复";
            if (key is "ws.reconnecting" or "network.unreachable") connection = "重连中";
            if (key == "supervisor.profile-offline") { connection = "已停止"; busy = false; }
            if (key == "run.started") busy = true;
            if (key is "run.completed" or "run.failed") busy = false;
            if (key == "run.failed") warning = "最近一次任务执行失败，请查看日志。";
        }
        return (name, connection, time, busy, warning);
    }
}
