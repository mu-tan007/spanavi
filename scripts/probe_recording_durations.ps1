param(
  [string]$UrlFile = "scripts/sample_urls.txt",
  [int]$Bitrate_kbps = 32
)

# Zoom Phone AAC mono is typically 32-64 kbps. Use 32 as default; recalibrate later if needed.

$urls = Get-Content -Path $UrlFile -Encoding UTF8 | Where-Object { $_ -and $_.Trim() }
$bytesPerSec = $Bitrate_kbps * 1024 / 8.0
$total = $urls.Count

$results = New-Object System.Collections.Generic.List[object]
$i = 0
foreach ($url in $urls) {
  $i++
  if ($i % 25 -eq 0) { Write-Host ("  ...{0}/{1}" -f $i, $total) }
  try {
    $req = [System.Net.WebRequest]::Create($url)
    $req.Method = 'HEAD'
    $req.Timeout = 15000
    $resp = $req.GetResponse()
    $len  = $resp.ContentLength
    $resp.Close()
    if ($len -gt 0) {
      $results.Add([pscustomobject]@{ url=$url; bytes=[int64]$len; ok=$true })
    } else {
      $results.Add([pscustomobject]@{ url=$url; bytes=$null; ok=$false })
    }
  } catch {
    $results.Add([pscustomobject]@{ url=$url; bytes=$null; ok=$false })
  }
}

$ok = $results | Where-Object { $_.ok }
if (-not $ok) { Write-Output "no successful HEAD"; return }

$durations = $ok | ForEach-Object { [math]::Round($_.bytes / $bytesPerSec, 1) }

$sorted = $durations | Sort-Object
$count  = $sorted.Count
$avg    = ($sorted | Measure-Object -Average).Average
$median = if ($count % 2 -eq 1) { $sorted[[int](($count-1)/2)] } else { ($sorted[$count/2 - 1] + $sorted[$count/2]) / 2 }
$p10    = $sorted[[math]::Floor($count * 0.10)]
$p25    = $sorted[[math]::Floor($count * 0.25)]
$p75    = $sorted[[math]::Floor($count * 0.75)]
$p90    = $sorted[[math]::Floor($count * 0.90)]
$min    = $sorted[0]
$max    = $sorted[-1]

$buckets = [ordered]@{
  '0-30s'    = ($durations | Where-Object { $_ -lt 30 }).Count
  '30-60s'   = ($durations | Where-Object { $_ -ge 30 -and $_ -lt 60 }).Count
  '1-2min'   = ($durations | Where-Object { $_ -ge 60 -and $_ -lt 120 }).Count
  '2-3min'   = ($durations | Where-Object { $_ -ge 120 -and $_ -lt 180 }).Count
  '3-5min'   = ($durations | Where-Object { $_ -ge 180 -and $_ -lt 300 }).Count
  '5-10min'  = ($durations | Where-Object { $_ -ge 300 -and $_ -lt 600 }).Count
  '10min+'   = ($durations | Where-Object { $_ -ge 600 }).Count
}

Write-Output "==================== Result ===================="
Write-Output ("Sample size       : {0} (failed HEAD: {1})" -f $count, ($urls.Count - $count))
Write-Output ("Assumed bitrate   : {0} kbps  ({1:N1} bytes/sec)" -f $Bitrate_kbps, $bytesPerSec)
Write-Output ("Avg duration      : {0:N1} sec  ({1:N2} min)" -f $avg, ($avg/60))
Write-Output ("Median duration   : {0:N1} sec" -f $median)
Write-Output ("Min / Max         : {0:N1}s / {1:N1}s" -f $min, $max)
Write-Output ("P10 / P25 / P75 / P90 : {0:N1}s / {1:N1}s / {2:N1}s / {3:N1}s" -f $p10, $p25, $p75, $p90)
Write-Output ""
Write-Output "==================== Distribution ===================="
foreach ($k in $buckets.Keys) {
  $v = $buckets[$k]
  Write-Output ("  {0,-9} : {1,4} ({2,5:N1}%)" -f $k, $v, ($v / $count * 100))
}

$avgBytes = ($ok | Measure-Object -Property bytes -Average).Average
Write-Output ""
Write-Output ("Avg file size     : {0:N0} bytes  ({1:N1} KB)" -f $avgBytes, ($avgBytes/1024))
