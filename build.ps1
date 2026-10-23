param([string]$OutputDirectory='app')
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
    $env:MSBuildEnableWorkloadResolver='false'
    dotnet publish RouterManager.App/RouterManager.App.csproj -c Release -o $OutputDirectory --ignore-failed-sources
    if($LASTEXITCODE -ne 0){throw 'Build failed'}
} finally {Pop-Location}
