param([string]$BridgeEntry=$env:FEISHU_TEST_BRIDGE_ENTRY)
$ErrorActionPreference='Stop'
if(-not $BridgeEntry){$BridgeEntry=Join-Path $PSScriptRoot 'integrations\lark-channel-bridge\bin\lark-channel-bridge.mjs'}
Push-Location $PSScriptRoot
try {
    $env:MSBuildEnableWorkloadResolver='false'
    dotnet run --project RouterManager.Tests
    if($LASTEXITCODE -ne 0){throw 'C# tests failed'}
    if(-not $BridgeEntry -or -not (Test-Path -LiteralPath $BridgeEntry)){throw 'Pass -BridgeEntry with your existing lark-channel-bridge.mjs path'}
    $env:FEISHU_TEST_BRIDGE_ENTRY=$BridgeEntry
    node --test RouterManager.Tests/routes.test.mjs RouterManager.Tests/pi-isolation.test.mjs RouterManager.Tests/agent-data.test.mjs RouterManager.Tests/lifecycle.test.mjs RouterManager.Tests/skills.test.mjs RouterManager.Tests/auto-route.test.mjs
    if($LASTEXITCODE -ne 0){throw 'Node tests failed'}
} finally {Pop-Location}
