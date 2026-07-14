$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "index.html"
$output = Join-Path $root "dist\single.html"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$html = [System.IO.File]::ReadAllText($source, [System.Text.Encoding]::UTF8)

function Inline-Css([string]$content, [string]$relativePath) {
  $path = Join-Path $root $relativePath
  $css = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $tag = '<link rel="stylesheet" href="' + $relativePath + '" />'
  if (-not $content.Contains($tag)) { throw "Tag CSS mancante: $tag" }
  return $content.Replace($tag, "<style>`n$css`n</style>")
}

function Inline-Js([string]$content, [string]$relativePath) {
  $path = Join-Path $root $relativePath
  $javascript = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $tag = '<script src="' + $relativePath + '"></script>'
  if (-not $content.Contains($tag)) { throw "Tag JavaScript mancante: $tag" }
  return $content.Replace($tag, "<script>`n$javascript`n</script>")
}

$html = Inline-Css $html "style.css"

$logoInline = [System.IO.File]::ReadAllText((Join-Path $root "assets\logo.inline.js"), [System.Text.Encoding]::UTF8)
$logoMatch = [regex]::Match($logoInline, '(?:window\.)?LOGO_DATA_URL\s*=\s*"([^"]+)"')
if (-not $logoMatch.Success) { throw "LOGO_DATA_URL non trovato" }
$logoUrl = $logoMatch.Groups[1].Value
$html = [regex]::Replace(
  $html,
  '<img\s+class="app-logo"\s+src="[^"]+"',
  [System.Text.RegularExpressions.MatchEvaluator]{ param($match) '<img class="app-logo" src="' + $logoUrl + '"' },
  1
)

$faviconPath = Join-Path $root "assets\favicon.inline.js"
if (Test-Path -LiteralPath $faviconPath) {
  $faviconInline = [System.IO.File]::ReadAllText($faviconPath, [System.Text.Encoding]::UTF8)
  $faviconMatch = [regex]::Match($faviconInline, '(?:window\.)?FAVICON_DATA_URL\s*=\s*"([^"]+)"')
  if (-not $faviconMatch.Success) { throw "FAVICON_DATA_URL non trovato" }
  $faviconUrl = $faviconMatch.Groups[1].Value
  $faviconTag = '<link rel="icon" href="' + $faviconUrl + '" type="image/png" />'
  $html = [regex]::Replace($html, '<link\s+rel="icon"[^>]*>', $faviconTag, 1)
}

foreach ($javascript in @(
  "libs/jspdf.umd.min.js",
  "libs/jspdf-autotable.min.js",
  "assets/logo.inline.js",
  "image-utils.js",
  "pdf.js",
  "app.js"
)) {
  $html = Inline-Js $html $javascript
}

[System.IO.Directory]::CreateDirectory((Split-Path -Parent $output)) | Out-Null
[System.IO.File]::WriteAllText($output, $html, $utf8NoBom)
Write-Output "Scritto: $output"
