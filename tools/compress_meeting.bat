@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

REM ============================================================
REM  週次ミーティング動画 圧縮バッチ
REM    - ドラッグ&ドロップで使用（複数ファイル対応）
REM    - Intel QSV (h264_qsv) によるハードウェア加速で高速圧縮
REM    - 失敗時は自動で libx264 (CPUエンコード) にフォールバック
REM    - 出力: {元名}_compressed.mp4（同じフォルダ）
REM    - 解像度: 720p / 音声: AAC 96kbps / 先頭シーク対応
REM ============================================================

if "%~1"=="" (
  echo.
  echo 使い方: このバッチに動画ファイルをドラッグ ^& ドロップしてください
  echo          または: compress_meeting.bat input.mp4 [input2.mp4 ...]
  echo.
  pause
  exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: ffmpeg が見つかりません
  echo.
  echo 手順:
  echo   1. https://www.gyan.dev/ffmpeg/builds/ から「ffmpeg-release-essentials.zip」をダウンロード
  echo   2. 解凍してできた bin フォルダ^(例: C:\ffmpeg\bin^)を環境変数 PATH に追加
  echo   3. PC 再起動後、このバッチを再実行
  echo.
  pause
  exit /b 1
)

:loop
if "%~1"=="" goto :all_done

set "INPUT=%~1"
set "DIR=%~dp1"
set "NAME=%~n1"
set "OUTPUT=%DIR%%NAME%_compressed.mp4"

echo.
echo ============================================================
echo 処理中: %INPUT%
echo 出力先: %OUTPUT%
echo ============================================================

REM ── Intel QSV でハードウェア圧縮（高速） ──
ffmpeg -hide_banner -loglevel warning -stats -y ^
  -i "%INPUT%" ^
  -c:v h264_qsv -preset medium -global_quality 25 ^
  -vf "scale=-2:720" ^
  -c:a aac -b:a 96k -ac 2 ^
  -movflags +faststart ^
  "%OUTPUT%"

if errorlevel 1 (
  echo.
  echo [!] Intel QSV が使用できないようです。CPU エンコードで再試行します...
  echo.
  ffmpeg -hide_banner -loglevel warning -stats -y ^
    -i "%INPUT%" ^
    -c:v libx264 -preset medium -crf 23 ^
    -vf "scale=-2:720" ^
    -c:a aac -b:a 96k -ac 2 ^
    -movflags +faststart ^
    "%OUTPUT%"
  if errorlevel 1 (
    echo.
    echo !! 圧縮に失敗しました: %INPUT%
    goto :next
  )
)

REM ── サイズ比較表示 ──
for %%A in ("%INPUT%")  do set "ORIG_BYTES=%%~zA"
for %%A in ("%OUTPUT%") do set "COMP_BYTES=%%~zA"
set /a "ORIG_MB=ORIG_BYTES / 1048576"
set /a "COMP_MB=COMP_BYTES / 1048576"
if !ORIG_MB! LEQ 0 set "ORIG_MB=1"
set /a "RATIO=COMP_MB * 100 / ORIG_MB"

echo.
echo [OK] 完了: !ORIG_MB! MB  =^>  !COMP_MB! MB  ^(!RATIO!%% に圧縮^)

:next
shift
goto :loop

:all_done
echo.
echo ============================================================
echo すべての処理が完了しました
echo ============================================================
echo.
pause
endlocal
