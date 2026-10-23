using System.Diagnostics;
using System.Text;
using System.Text.Json;
namespace RouterManager.Core;

public interface IScriptRunner
{
    Task<string> RunAsync(string script, object? input = null, CancellationToken cancellation = default);
}

public sealed class PowerShellRunner : IScriptRunner
{
    public async Task<string> RunAsync(string script, object? input = null, CancellationToken cancellation = default)
    {
        var prefix = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; ";
        var info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"))
        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true };
        foreach (var arg in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Convert.ToBase64String(Encoding.Unicode.GetBytes(prefix + script)) }) info.ArgumentList.Add(arg);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("无法启动 PowerShell。");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var errors = process.StandardError.ReadToEndAsync(timeout.Token);
        await process.StandardInput.WriteAsync(input is null ? "{}" : JsonSerializer.Serialize(input));
        process.StandardInput.Close();
        try { await process.WaitForExitAsync(timeout.Token); }
        catch { try { process.Kill(true); } catch (InvalidOperationException) { } throw; }
        var stdout = await output; var stderr = await errors;
        if (process.ExitCode != 0) throw new InvalidOperationException(Redactor.Clean(stderr.Trim()));
        return stdout.Trim().TrimStart('\uFEFF');
    }
}
