# Turns the 4-up Logo.jpg sheet into the individual assets the app needs.
#
# The sheet has four lockups on two background colours. This crops the
# RINGS MARK ONLY out of the top-left lockup (the one on cream), keys the cream
# background out to transparency, and writes square PNGs sized for the favicon,
# the iOS home screen, and the header.
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File make-logo-assets.ps1
# Delete this file once you're happy with the output.

Add-Type -AssemblyName System.Drawing

$root = "C:\Users\USER\Videos\Variant\HTML\HAckathon\Nimi"
$src = Join-Path $root "Logo.jpg"
$outDir = Join-Path $root "nimiq-quiz-app-frontend\public"

if (-not (Test-Path $src)) { Write-Error "Not found: $src"; exit 1 }

$bmp = [System.Drawing.Bitmap]::FromFile($src)
$W = $bmp.Width
$H = $bmp.Height

# Background colour: average a small patch in the very top-left corner, which is
# plain cream in every version of this sheet.
$sumR = 0; $sumG = 0; $sumB = 0; $n = 0
for ($x = 0; $x -lt 12; $x++) {
  for ($y = 0; $y -lt 12; $y++) {
    $p = $bmp.GetPixel($x, $y)
    $sumR += $p.R; $sumG += $p.G; $sumB += $p.B; $n++
  }
}
$bgR = [int]($sumR / $n); $bgG = [int]($sumG / $n); $bgB = [int]($sumB / $n)
Write-Host "source  : ${W} x ${H}"
Write-Host "bg      : $bgR,$bgG,$bgB"

# Only ever search inside the top-left lockup, so the right-hand stacked
# lockup can't be picked up.
#
# The vertical bound is the full height on purpose. It used to be 46% of H,
# which was sized for the original 4-up sheet where an orange band filled the
# bottom half — but on the cropped single-band sheet that ceiling lands
# mid-mark, and the run gets truncated (172x37 instead of the real ~172x125).
# If you ever go back to a multi-band sheet, clamp this again.
$tol = 34
$xLim = [int]($W * 0.55)
$yLim = $H

function Test-Ink($p) {
  return ([Math]::Abs($p.R - $bgR) -gt $tol) -or ([Math]::Abs($p.G - $bgG) -gt $tol) -or ([Math]::Abs($p.B - $bgB) -gt $tol)
}

# --- horizontal extent of the FIRST blob, which is the rings -------------
# A column counts as occupied when it contains more than a few non-background
# pixels; the run ends once we've seen GAP empty columns in a row, so the
# rings and the "ROVA" text beside them are separated rather than merged.
$GAP = 8
$cols = New-Object int[] $xLim
for ($x = 0; $x -lt $xLim; $x++) {
  $c = 0
  for ($y = 0; $y -lt $yLim; $y++) {
    if (Test-Ink $bmp.GetPixel($x, $y)) { $c++ }
  }
  $cols[$x] = $c
}

$x0 = -1; $x1 = -1; $gap = 0
for ($x = 0; $x -lt $xLim; $x++) {
  if ($cols[$x] -gt 3) {
    if ($x0 -lt 0) { $x0 = $x }
    $x1 = $x
    $gap = 0
  }
  elseif ($x0 -ge 0) {
    $gap++
    if ($gap -ge $GAP) { break }
  }
}
if ($x0 -lt 0) { Write-Error "Could not locate the mark. Is Logo.jpg the 4-up sheet?"; $bmp.Dispose(); exit 1 }

# --- vertical extent within those columns ---------------------------------
$y0 = -1; $y1 = -1
for ($y = 0; $y -lt $yLim; $y++) {
  $c = 0
  for ($x = $x0; $x -le $x1; $x++) {
    if (Test-Ink $bmp.GetPixel($x, $y)) { $c++ }
  }
  if ($c -gt 2) {
    if ($y0 -lt 0) { $y0 = $y }
    $y1 = $y
  }
}

Write-Host "mark    : x $x0..$x1  y $y0..$y1  ($($x1 - $x0 + 1) x $($y1 - $y0 + 1))"

# --- square crop, centred on the mark, with breathing room ---------------
$mw = $x1 - $x0 + 1
$mh = $y1 - $y0 + 1
$side = [Math]::Max($mw, $mh)
$side = $side + [int]($side * 0.18)          # padding around the mark
$cx = [int](($x0 + $x1) / 2)
$cy = [int](($y0 + $y1) / 2)
$left = $cx - [int]($side / 2)
$top = $cy - [int]($side / 2)

# --- crop + alpha-key the flat background out ---------------------------
# Three-band alpha rather than a hard cut: pixels close to the background go
# fully transparent, pixels far from it stay opaque, and the narrow band
# between them is partial. A hard cut leaves a jagged cream fringe on the
# antialiased ring edges.
$crop = New-Object System.Drawing.Bitmap($side, $side, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$alphaLow = 18
$alphaHigh = 45
for ($i = 0; $i -lt $side; $i++) {
  for ($j = 0; $j -lt $side; $j++) {
    $sx = $left + $i
    $sy = $top + $j
    if ($sx -lt 0 -or $sy -lt 0 -or $sx -ge $W -or $sy -ge $H) {
      $crop.SetPixel($i, $j, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      continue
    }
    $p = $bmp.GetPixel($sx, $sy)
    $d = [Math]::Max([Math]::Max([Math]::Abs($p.R - $bgR), [Math]::Abs($p.G - $bgG)), [Math]::Abs($p.B - $bgB))
    if ($d -le $alphaLow) { $a = 0 }
    elseif ($d -ge $alphaHigh) { $a = 255 }
    else { $a = [int](255 * ($d - $alphaLow) / ($alphaHigh - $alphaLow)) }
    $crop.SetPixel($i, $j, [System.Drawing.Color]::FromArgb($a, $p.R, $p.G, $p.B))
  }
}

# --- emit the sizes ------------------------------------------------------
function Save-Scaled($source, $size, $path, $background) {
  $t = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($t)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  if ($background) { $g.Clear($background) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $g.DrawImage($source, 0, 0, $size, $size)
  $g.Dispose()
  $t.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $t.Dispose()
  Write-Host "wrote   : $path"
}

$cream = [System.Drawing.Color]::FromArgb(255, 251, 245, 233)   # --rova-bg #fbf5e9

Save-Scaled $crop 512 (Join-Path $outDir "rova-mark.png") $null
Save-Scaled $crop 32  (Join-Path $outDir "favicon-32.png") $null
Save-Scaled $crop 16  (Join-Path $outDir "favicon-16.png") $null
# iOS renders a transparent home-screen icon on black, so this one gets the
# app's own cream behind it instead.
Save-Scaled $crop 180 (Join-Path $outDir "apple-touch-icon.png") $cream

$crop.Dispose()
$bmp.Dispose()
Write-Host ""
Write-Host "Done. Check the bounds above look like the rings and nothing else -"
Write-Host "if the width is close to the full lockup, the text got included."
