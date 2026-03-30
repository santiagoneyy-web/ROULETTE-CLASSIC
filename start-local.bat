@echo off
echo.
echo 🚀 --- SISTEMA ANTI-BLOQUEO ROULETTE CLASSIC ---
echo.

:: Moverse a la carpeta del script
cd /d "%~dp0"

echo [1/3] Verificando Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Node.js no esta instalado o no esta en el PATH.
    pause
    exit /b
)

echo [2/3] Instalando/Actualizando motores de busqueda (Puppeteer)...
echo      Esto puede tardar un poco... no cierres la ventana.
call npm install --no-audit --no-fund
call npx puppeteer browsers install chrome

echo [3/3] Arrancando Servidor y Bots...
echo.

npx concurrently -n "SERV,BOT1,BOT2" -c "blue,magenta,cyan" "node server.js" "node crawler.js --table 1 --url https://www.casino.org/casinoscores/es/auto-roulette/ --delay 2000" "node crawler.js --table 2 --url https://www.casino.org/casinoscores/es/immersive-roulette/ --delay 4000"

if %errorlevel% neq 0 (
    echo.
    echo ❌ El sistema se detuvo con un error.
    pause
)
pause
