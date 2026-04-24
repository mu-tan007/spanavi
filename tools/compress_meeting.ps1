# Weekly Meeting Video Compression (PowerShell版 / Unicodeパス対応)
# 使い方:
#   powershell -ExecutionPolicy Bypass -File compress_meeting.ps1 <input>
# またはエクスプローラで右クリック → PowerShell で実行

param(
  [Parameter(Mandatory=$true, ValueFromRemainingArguments=$true)]
  [string[]]$Inputs
)

$ErrorActionPreference = 'Continue'

# Ensure ffmpeg in PATH
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: ffmpeg not found in PATH.' -ForegroundColor Red
  Write-Host '      Install via: winget install Gyan.FFmpeg'
  Pause
  exit 1
}

foreach ($input in $Inputs) {
  if (-not (Test-Path -LiteralPath $input)) {
    Write-Host ('[WARN] Not found: {0}' -f $input) -ForegroundColor Yellow
    continue
  }
  $item = Get-Item -LiteralPath $input
  $dir  = $item.Directory.FullName
  $name = $item.BaseName
  $output = Join-Path $dir ($name + '_compressed.mp4')

  Write-Host ''
  Write-Host ('------------------------------------------------------------')
  Write-Host ('IN : ' + $input)
  Write-Host ('OUT: ' + $output)
  Write-Host ('------------------------------------------------------------')

  # Try Intel QSV
  & ffmpeg -hide_banner -loglevel warning -stats -y `
    -i $input `
    -c:v h264_qsv -preset medium -global_quality 25 `
    -vf 'scale=-2:720' `
    -c:a aac -b:a 96k -ac 2 `
    -movflags +faststart `
    $output

  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
    Write-Host ''
    Write-Host '[WARN] QSV failed. Retrying with libx264 (CPU)...' -ForegroundColor Yellow
    & ffmpeg -hide_banner -loglevel warning -stats -y `
      -i $input `
      -c:v libx264 -preset medium -crf 23 `
      -vf 'scale=-2:720' `
      -c:a aac -b:a 96k -ac 2 `
      -movflags +faststart `
      $output
    if ($LASTEXITCODE -ne 0) {
      Write-Host ('[ERROR] Compression failed: ' + $input) -ForegroundColor Red
      continue
    }
  }

  $origMB = [math]::Round($item.Length / 1MB, 1)
  $compMB = [math]::Round((Get-Item -LiteralPath $output).Length / 1MB, 1)
  $ratio  = [math]::Round($compMB * 100 / $origMB, 1)
  Write-Host ''
  Write-Host ('[OK] {0} MB -> {1} MB  ({2}% of original)' -f $origMB, $compMB, $ratio) -ForegroundColor Green
}

Write-Host ''
Write-Host '============================================================'
Write-Host 'All done.'
Write-Host '============================================================'
