param(
  [string]$UrlFile = "scripts/sample_urls.txt",
  [int]$Samples = 5
)

$urls = Get-Content -Path $UrlFile -Encoding UTF8 | Where-Object { $_ -and $_.Trim() } | Select-Object -First $Samples

$tmpDir = Join-Path $env:TEMP "spanavi_calib"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$rows = @()
$i = 0
foreach ($url in $urls) {
  $i++
  $local = Join-Path $tmpDir ("c{0}.m4a" -f $i)
  Write-Host ("[{0}/{1}] downloading..." -f $i, $urls.Count)
  Invoke-WebRequest -Uri $url -OutFile $local -UseBasicParsing -TimeoutSec 60

  $bytes = (Get-Item $local).Length
  $durStr = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $local
  $dur = [double]$durStr
  $bitrate_kbps = if ($dur -gt 0) { [math]::Round(($bytes * 8 / $dur) / 1024, 2) } else { 0 }

  $rows += [pscustomobject]@{
    Sample        = $i
    Bytes         = $bytes
    Duration_sec  = [math]::Round($dur, 1)
    Duration_mmss = ("{0:D2}:{1:D2}" -f [int]($dur/60), [int]($dur%60))
    Bitrate_kbps  = $bitrate_kbps
  }
  Remove-Item $local -Force
}

$rows | Format-Table -AutoSize | Out-String | Write-Output

$avgBitrate = ($rows | Measure-Object -Property Bitrate_kbps -Average).Average
Write-Output ("Avg bitrate across samples: {0:N2} kbps" -f $avgBitrate)
Write-Output ("Use this value with probe_recording_durations.ps1 -Bitrate_kbps {0}" -f [math]::Round($avgBitrate))

Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
