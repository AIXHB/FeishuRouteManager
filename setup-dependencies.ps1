param([switch]$IncludePi,[switch]$BridgeDevelopment)
$ErrorActionPreference='Stop'
function Install([string]$directory,[bool]$dev){
    Push-Location $directory
    try {
        $options=@('ci','--ignore-scripts','--no-audit','--no-fund')
        if(-not $dev){$options+='--omit=dev'}
        & npm.cmd @options
        if($LASTEXITCODE -ne 0){throw "Dependency installation failed: $directory"}
    } finally {Pop-Location}
}
Install (Join-Path $PSScriptRoot 'integrations\lark-channel-bridge') ([bool]$BridgeDevelopment)
if($IncludePi){
    $pi=Join-Path $PSScriptRoot 'integrations\pi-feishu'
    Install $pi $false
    $target=Join-Path $pi 'node_modules\pi-remote-feishu'
    Get-ChildItem -LiteralPath (Join-Path $pi 'patched-package') -Force | Copy-Item -Destination $target -Recurse -Force
}
Write-Host 'Dependencies ready. Live bot integration settings were not changed.'
