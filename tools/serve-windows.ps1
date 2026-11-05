# Serves Bit Cycler's game folder on this computer and opens it in the
# default browser, with nothing to install: Windows PowerShell's own web
# listener (Windows 10 and 11). "Play Bit Cycler.bat" starts it. The game is
# plain files, but browsers only run its modules from a web address, not by
# opening index.html directly. Close the window to stop.

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\game')).Path.TrimEnd('\') + '\'

# What each kind of file is (a module must be served as JavaScript, or the browser refuses it).
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.map' = 'application/json'
  '.css' = 'text/css'; '.json' = 'application/json'; '.txt' = 'text/plain; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.ttf' = 'font/ttf'; '.otf' = 'font/otf'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'
  '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.mp3' = 'audio/mpeg'
}

# The first free port from 8000 (only this computer can reach it: localhost).
$listener = $null
foreach ($port in 8000..8020) {
  try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
    break
  } catch {
    $listener = $null
  }
}
if (-not $listener) {
  Write-Host 'No free port between 8000 and 8020: close other servers and try again.'
  exit 1
}

$address = "http://localhost:$port/"
Write-Host ''
Write-Host '  BIT CYCLER'
Write-Host "  Playing at $address"
Write-Host '  Close this window to stop the game.'
Write-Host ''
Start-Process $address

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $response = $context.Response
  try {
    $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    # Only files inside the game folder.
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $type = $types[[IO.Path]::GetExtension($file).ToLowerInvariant()]
      $response.ContentType = $(if ($type) { $type } else { 'application/octet-stream' })
      # Always the latest files, after an update.
      $response.Headers.Add('Cache-Control', 'no-cache')
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $response.StatusCode = 404
    }
  } catch {
    # The browser gave up on a request (a reload mid-download): carry on.
  } finally {
    $response.Close()
  }
}
