@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  Weekly Meeting Video Compression (drag and drop)
REM    - Uses Intel QSV (h264_qsv); falls back to libx264
REM    - Output: {name}_compressed.mp4  (720p / AAC 96k / faststart)
REM  NOTE: ASCII only inside this file to avoid CP-mismatch issues.
REM ============================================================

if "%~1"=="" (
  echo.
  echo Usage: Drag and drop video files onto this batch file.
  echo        Or:  compress_meeting.bat input.mp4 [input2.mp4 ...]
  echo.
  pause
  exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: ffmpeg not found in PATH.
  echo        Install via: winget install Gyan.FFmpeg
  echo        Or download from: https://www.gyan.dev/ffmpeg/builds/
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
echo ------------------------------------------------------------
echo IN : %INPUT%
echo OUT: %OUTPUT%
echo ------------------------------------------------------------

REM Try Intel QSV first
ffmpeg -hide_banner -loglevel warning -stats -y ^
  -i "%INPUT%" ^
  -c:v h264_qsv -preset medium -global_quality 25 ^
  -vf "scale=-2:720" ^
  -c:a aac -b:a 96k -ac 2 ^
  -movflags +faststart ^
  "%OUTPUT%"

if errorlevel 1 (
  echo.
  echo [WARN] QSV failed. Retrying with libx264 (CPU)...
  echo.
  ffmpeg -hide_banner -loglevel warning -stats -y ^
    -i "%INPUT%" ^
    -c:v libx264 -preset medium -crf 23 ^
    -vf "scale=-2:720" ^
    -c:a aac -b:a 96k -ac 2 ^
    -movflags +faststart ^
    "%OUTPUT%"
  if errorlevel 1 (
    echo [ERROR] Compression failed.
    goto :next
  )
)

for %%A in ("%INPUT%")  do set "ORIG_BYTES=%%~zA"
for %%A in ("%OUTPUT%") do set "COMP_BYTES=%%~zA"
set /a "ORIG_MB=!ORIG_BYTES! / 1048576"
set /a "COMP_MB=!COMP_BYTES! / 1048576"
if !ORIG_MB! LEQ 0 set "ORIG_MB=1"
set /a "RATIO=!COMP_MB! * 100 / !ORIG_MB!"
echo.
echo [OK] !ORIG_MB! MB -^> !COMP_MB! MB  ^(!RATIO!%% of original^)

:next
shift
goto :loop

:all_done
echo.
echo ============================================================
echo All done.
echo ============================================================
echo.
pause
endlocal
