using System.Text.Json.Nodes;
namespace RouterManager.Core;

public sealed record Inventory(IReadOnlyList<TaskSnapshot> Tasks, IReadOnlySet<int> LivePids);
public sealed class WindowsInventory(IScriptRunner scripts)
{
    public async Task<Inventory> ReadAsync()
    {
        const string script = """
            $tasks=@(Get-ScheduledTask | Where-Object {$_.TaskName -match 'LarkChannelBridge|Feishu|FeishuRouterManager'} | ForEach-Object {
                @{Name=$_.TaskName;State=[string]$_.State;Arguments=([string]($_.Actions.Arguments -join ' '))}
            });
            $pids=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
                $_.CommandLine -match 'lark-channel-bridge\.mjs.+\brun\b|pi-remote-feishu\.js.+\bserve\b'
            } | ForEach-Object {[int]$_.ProcessId});
            @{Tasks=$tasks;Pids=$pids}|ConvertTo-Json -Depth 5 -Compress
            """;
        var data = JsonNode.Parse(await scripts.RunAsync(script));
        var tasks = (data?["Tasks"] as JsonArray ?? []).Select(t => new TaskSnapshot(JsonFiles.Text(t?["Name"]), JsonFiles.Text(t?["State"]), JsonFiles.Text(t?["Arguments"]))).ToArray();
        var pids = (data?["Pids"] as JsonArray ?? []).Select(p => (int)p!).ToHashSet();
        return new(tasks, pids);
    }
}
