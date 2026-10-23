$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'app\FeishuRouterManager.exe'
if(-not (Test-Path -LiteralPath $exe)){throw 'Run build.ps1 before installing the shortcut.'}
$directory=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Microsoft\Windows\Start Menu\Programs'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut((Join-Path $directory '飞书机器人路由控制台.lnk'))
$shortcut.TargetPath=$exe
$shortcut.WorkingDirectory=Split-Path -Parent $exe
$shortcut.IconLocation=(Join-Path $PSScriptRoot 'app\Assets\app-icon.ico')+',0'
$shortcut.Description='本地飞书机器人路由控制台'
$shortcut.Save()
Write-Host "Start menu shortcut: $exe"
