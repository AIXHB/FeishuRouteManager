param([string]$OutputDirectory=(Join-Path $PSScriptRoot 'artifacts'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=[IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$destination=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $destination -Force|Out-Null
$all=@(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object {
    $relative=$_.FullName.Substring($root.Length+1).Replace('\','/')
    -not $_.FullName.StartsWith($destination+'\',[StringComparison]::OrdinalIgnoreCase) -and
    $relative -notmatch '(^|/)(node_modules|\.git|\.vs|\.agent|\.pi|\.lark-channel)/' -and
    $relative -notmatch '^(artifacts|work)/' -and
    ($relative -notmatch '(^|/)\.env(?:\..*)?$' -or $relative -match '(^|/)\.env\.example$') -and
    $relative -notmatch '^RouterManager\.[^/]+/(bin|obj)/'
})
$source=@($all|Where-Object {$_.FullName.Substring($root.Length+1).Replace('\','/') -notmatch '^app/'})
$binary=@($all|Where-Object {$_.FullName.Substring($root.Length+1).Replace('\','/') -match '^(app/|docs/|install-start-menu\.ps1$|README\.md$|RELEASE-NOTES\.md$|TEST-RESULTS\.md$)'})
function Write-Zip([string]$name,$files){
    $zipPath=Join-Path $destination $name
    $stream=[IO.File]::Open($zipPath,[IO.FileMode]::Create)
    $zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
    try{foreach($file in $files){$relative=$file.FullName.Substring($root.Length+1).Replace('\','/');[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal)|Out-Null}}
    finally{$zip.Dispose();$stream.Dispose()}
}
Write-Zip 'FeishuRouteManager-Source.zip' $source
if($binary.Count -gt 2){Write-Zip 'FeishuRouteManager-Windows.zip' $binary}
$manifest=@($source|ForEach-Object {[ordered]@{path=$_.FullName.Substring($root.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
$manifest|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $destination 'source-manifest.json') -Encoding utf8
Get-ChildItem -LiteralPath $destination -File|Where-Object {$_.Extension -eq '.zip'}|Get-FileHash -Algorithm SHA256|Select-Object Path,Hash
