using System.Text.RegularExpressions;
namespace RouterManager.Core;

public static partial class Redactor
{
    [GeneratedRegex("(?i)(app[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)([\\\"'\\s:=]+)([^\\\"'\\s,}]+)")]
    private static partial Regex NamedSecret();
    [GeneratedRegex(@"\b(?:sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9]{32,})\b")]
    private static partial Regex Token();
    public static string Clean(string text) => Token().Replace(NamedSecret().Replace(text, "$1$2[已隐藏]"), "[已隐藏]");
}
