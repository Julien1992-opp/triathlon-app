$ErrorActionPreference = "Stop"
$port = 8765
$prefix = "http://localhost:$port/"
$root = (Get-Location).Path

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
    ".md"   = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    Write-Host "Impossible de demarrer sur $prefix : $($_.Exception.Message)"
    exit 1
}

Write-Host "Serveur local actif"
Write-Host "URL : $prefix"
Write-Host "Dossier servi : $root"
Write-Host "Pour arreter, fermer cette fenetre ou Ctrl C"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }
    $req = $context.Request
    $res = $context.Response

    $rel = [System.Uri]::UnescapeDataString($req.Url.LocalPath)
    if ($rel -eq "/" -or [string]::IsNullOrEmpty($rel)) {
        $rel = "/index.html"
    }
    $full = Join-Path $root ($rel.TrimStart('/').Replace('/', '\'))

    try {
        if ((Test-Path $full -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
            $res.ContentType = $ct
            $res.Headers.Add("Cache-Control", "no-store")
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "200 $rel"
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found : $rel")
            $res.ContentType = "text/plain; charset=utf-8"
            $res.ContentLength64 = $msg.Length
            $res.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host "404 $rel"
        }
    } catch {
        try {
            $res.StatusCode = 500
            $msg = [System.Text.Encoding]::UTF8.GetBytes("500 : $($_.Exception.Message)")
            $res.OutputStream.Write($msg, 0, $msg.Length)
        } catch {}
        Write-Host "500 $rel : $($_.Exception.Message)"
    } finally {
        try { $res.Close() } catch {}
    }
}
