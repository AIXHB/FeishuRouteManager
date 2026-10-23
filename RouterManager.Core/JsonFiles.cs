using System.Text;
using System.Text.Json.Nodes;
namespace RouterManager.Core;

public static class JsonFiles
{
    public static JsonObject? Read(string path)
    {
        if (!File.Exists(path)) return null;
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(stream, Encoding.UTF8, true);
        return JsonNode.Parse(reader.ReadToEnd()) as JsonObject;
    }
    public static string Text(JsonNode? node, string fallback = "") => node?.ToString() ?? fallback;
    public static IReadOnlyList<string> Tail(string path, int count = 160, long maxBytes = 196608)
    {
        if (!File.Exists(path)) return [];
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var truncated = stream.Length > maxBytes;
        if (truncated) stream.Seek(-maxBytes, SeekOrigin.End);
        using var reader = new StreamReader(stream, Encoding.UTF8, true);
        if (truncated) reader.ReadLine();
        var lines = new Queue<string>();
        string? line;
        while ((line = reader.ReadLine()) is not null) { lines.Enqueue(line); if (lines.Count > count) lines.Dequeue(); }
        return lines.ToArray();
    }
}
