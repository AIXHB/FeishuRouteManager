namespace RouterManager.Core;

public enum BridgeKind { LarkChannel, PiFeishu }
public sealed record TaskSnapshot(string Name, string State, string Arguments);
public sealed record RuntimeSnapshot(int Pid, string Profile, string Agent, string BotName);
public sealed record BotSnapshot(
    string Id, string Name, string AppId, BridgeKind Bridge, string Backend,
    string Model, string Workspace, string Permission, string Root, string TaskName,
    string TaskState, int? Pid, string Connection, DateTimeOffset? LastEvent,
    bool Busy, string? Warning)
{
    public string BridgeLabel => Bridge == BridgeKind.LarkChannel ? "Lark Channel Bridge" : "pi-remote-feishu";
    public string BackendLabel => Backend switch { "codex" => "Codex CLI", "antigravity" => "Antigravity CLI", "claude" => "Claude Code", "pi" => "pi Agent", _ => Backend };
    public string StatusLabel => Pid is null ? "已停止" : Connection;
    public string StatusColor => Pid is null ? "#8794AA" : Connection == "已连接" ? "#82DDBD" : "#F3C67D";
    public string RouteLabel => $"{Name} → {BackendLabel}";
}
public sealed record RouteChange(string Profile, string Backend, string Workspace, string Model);
public sealed record OperationResult(bool Success, string Message);
