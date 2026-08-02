@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   1993 W202 C220 - 3D 捲動展示
echo   Starting local server...
echo ============================================
set "PYEXE=python"
where python >nul 2>nul
if errorlevel 1 set "PYEXE=D:\anaconda\python.exe"
start "W202ShowcaseServer" "%PYEXE%" -m http.server 8323
timeout /t 2 >nul
start "" "http://localhost:8323/w202-3d-scroll.html"
echo.
echo 瀏覽器應該已經打開了。若沒有，請手動開啟：
echo    http://localhost:8323/w202-3d-scroll.html
echo.
echo (使用期間請保持這個黑色視窗開著，關掉就會停止伺服器)
pause
