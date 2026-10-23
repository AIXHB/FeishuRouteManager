Add-Type -AssemblyName PresentationCore,WindowsBase
$assetDir=Join-Path $PSScriptRoot '..\RouterManager.App\Assets'
$svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="15" fill="#181A1F" stroke="#424750"/><path d="M30 32H36V16H46M36 32H46M36 32V48H46" fill="none" stroke="#58BEF4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 23V18" stroke="#EEF3F8" stroke-width="3"/><circle cx="20" cy="16" r="2.5" fill="#58BEF4"/><rect x="9" y="23" width="22" height="20" rx="6" fill="#EEF3F8"/><g fill="#181A1F"><circle cx="16" cy="32" r="2"/><circle cx="24" cy="32" r="2"/></g><path d="M17 38H23" stroke="#181A1F" stroke-width="2" stroke-linecap="round"/><rect x="45" y="11" width="10" height="10" rx="3" fill="#58BEF4"/><rect x="45" y="27" width="10" height="10" rx="3" fill="#80DFC4"/><rect x="45" y="43" width="10" height="10" rx="3" fill="#A5ACFF"/></svg>'
[IO.File]::WriteAllText((Join-Path $assetDir 'app-icon.svg'),$svg,[Text.UTF8Encoding]::new($false))
function Brush($hex){[Windows.Media.BrushConverter]::new().ConvertFromString($hex)}
function Render-Png([int]$size){
 $visual=[Windows.Media.DrawingVisual]::new();$dc=$visual.RenderOpen();$dc.PushTransform([Windows.Media.ScaleTransform]::new($size/64.0,$size/64.0))
 $dark=Brush '#181A1F';$ink=Brush '#EEF3F8';$blue=Brush '#58BEF4';$pen=[Windows.Media.Pen]::new($blue,4);$pen.StartLineCap='Round';$pen.EndLineCap='Round';$pen.LineJoin='Round'
 $dc.DrawRoundedRectangle($dark,[Windows.Media.Pen]::new((Brush '#424750'),1),[Windows.Rect]::new(2,2,60,60),15,15)
 $dc.DrawGeometry($null,$pen,[Windows.Media.Geometry]::Parse('M30,32 L36,32 L36,16 L46,16 M36,32 L46,32 M36,32 L36,48 L46,48'))
 $dc.DrawLine([Windows.Media.Pen]::new($ink,3),[Windows.Point]::new(20,23),[Windows.Point]::new(20,18));$dc.DrawEllipse($blue,$null,[Windows.Point]::new(20,16),2.5,2.5)
 $dc.DrawRoundedRectangle($ink,$null,[Windows.Rect]::new(9,23,22,20),6,6)
 foreach($x in @(16,24)){$dc.DrawEllipse($dark,$null,[Windows.Point]::new($x,32),2,2)}
 $mouth=[Windows.Media.Pen]::new($dark,2);$mouth.StartLineCap='Round';$mouth.EndLineCap='Round';$dc.DrawLine($mouth,[Windows.Point]::new(17,38),[Windows.Point]::new(23,38))
 $dc.DrawRoundedRectangle($blue,$null,[Windows.Rect]::new(45,11,10,10),3,3);$dc.DrawRoundedRectangle((Brush '#80DFC4'),$null,[Windows.Rect]::new(45,27,10,10),3,3);$dc.DrawRoundedRectangle((Brush '#A5ACFF'),$null,[Windows.Rect]::new(45,43,10,10),3,3)
 $dc.Pop();$dc.Close();$bmp=[Windows.Media.Imaging.RenderTargetBitmap]::new($size,$size,96,96,[Windows.Media.PixelFormats]::Pbgra32);$bmp.Render($visual);$enc=[Windows.Media.Imaging.PngBitmapEncoder]::new();$enc.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bmp));$stream=[IO.MemoryStream]::new();$enc.Save($stream);return ,$stream.ToArray()
}
[IO.File]::WriteAllBytes((Join-Path $assetDir 'app-icon.png'),(Render-Png 512))
$sizes=@(16,24,32,48,64,128,256);$frames=@($sizes|ForEach-Object {,(Render-Png $_)});$file=[IO.File]::Create((Join-Path $assetDir 'app-icon.ico'));$writer=[IO.BinaryWriter]::new($file);$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$sizes.Count);$offset=6+16*$sizes.Count
for($i=0;$i -lt $sizes.Count;$i++){$dimension=if($sizes[$i]-eq 256){0}else{$sizes[$i]};$writer.Write([byte]$dimension);$writer.Write([byte]$dimension);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$frames[$i].Length);$writer.Write([uint32]$offset);$offset+=$frames[$i].Length}
foreach($frame in $frames){$writer.Write([byte[]]$frame)};$writer.Dispose()
Get-ChildItem -LiteralPath $assetDir -Filter 'app-icon.*' | Select-Object Name,Length

