@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

cd /d "%~dp0\.."

echo ========================================
echo   動画の無音カットツール
echo ========================================
echo.

REM ffmpeg がインストールされてるか確認
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo [エラー] ffmpeg がインストールされていません。
  echo.
  echo 先に以下のコマンドを「PowerShell ^(管理者^)」で実行してください:
  echo.
  echo   winget install Gyan.FFmpeg
  echo.
  echo インストールが終わったら、PCを再起動してこのバッチファイルをもう一度実行してください。
  echo.
  pause
  exit /b 1
)

REM 引数が無い場合 (ダブルクリックで開いた場合)
if "%~1"=="" (
  echo 使い方:
  echo   このバッチファイルに動画ファイルを「ドラッグ ^&^& ドロップ」してください。
  echo.
  echo   または、コマンドラインで以下のように呼び出せます:
  echo     trim-silence.bat C:\path\to\video.mp4
  echo.
  pause
  exit /b 0
)

REM 動画を編集
echo 動画: %~1
echo.
echo 編集を開始します。完了まで5〜10分ほどかかります...
echo.

node scripts/trim-silence.mjs "%~1"

set EXITCODE=%errorlevel%
echo.
if %EXITCODE% equ 0 (
  echo ========================================
  echo   編集が完了しました
  echo ========================================
  echo.
  echo 出力された "*_trimmed.mp4" ファイルを Library 画面でアップロードしてください。
) else (
  echo ========================================
  echo   エラーが発生しました
  echo ========================================
)
echo.
pause
endlocal
