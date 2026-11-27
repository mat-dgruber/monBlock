# Gera packaging\windows\monblock.ico a partir do logo PNG embutido no renderer (16 a 256 px, entradas PNG).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\make-ico.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Add-Type -AssemblyName System.Drawing
$html = [IO.File]::ReadAllText((Join-Path $root 'src\renderer\index.html'))
$b64 = [regex]::Match($html, 'data:image/png;base64,([A-Za-z0-9+/=]+)').Groups[1].Value
if (-not $b64) { throw 'logo PNG nao encontrado no index.html' }
$src = [Drawing.Image]::FromStream([IO.MemoryStream]::new([Convert]::FromBase64String($b64)))
$sizes = 16, 24, 32, 48, 64, 128, 256
$pngs = foreach ($s in $sizes) {
  $bmp = [Drawing.Bitmap]::new($s, $s)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($src, 0, 0, $s, $s)
  $ms = [IO.MemoryStream]::new(); $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  , $ms.ToArray()
}
$out = [IO.MemoryStream]::new(); $w = [IO.BinaryWriter]::new($out)
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
$dest = Join-Path $root 'packaging\windows\monblock.ico'
[IO.File]::WriteAllBytes($dest, $out.ToArray())
Write-Host "ok: $dest ($($out.Length) bytes, $($sizes -join '/') px)"
