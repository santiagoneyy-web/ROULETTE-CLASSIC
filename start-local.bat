@echo off
echo.
echo --- CLASI ROULETTE V2 ---
echo.

:: Moverse a la carpeta del script
cd /d "%~dp0"

echo [1/3] Verificando Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado o no esta en el PATH.
    pause
    exit /b
)

echo [2/3] Instalando motores (Puppeteer)...
echo      Esto puede tardar... no cierres la ventana.
call npm install --no-audit --no-fund 2>nul

echo [3/3] Arrancando Servidor + Crawlers V2...
echo      API       : http://127.0.0.1:3000
echo      CasinoOrg : API mode (fast)
echo      GamblingC : Browser mode (persistent)
echo.
echo Abre http://127.0.0.1:3000 en tu navegador
echo.

node start_v2.js

if %errorlevel% neq 0 (
    echo.
    echo El sistema se detuvo con un error.
    pause
)
pause
