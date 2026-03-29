@echo off
title ROULETTE CLASSIC - LOCAL SERVER
echo ==========================================
echo  ROULETTE CLASSIC - INICIANDO LOCAL...
echo ==========================================
echo.

:: Ir al directorio del proyecto
cd /d "%~dp0"

:: Verificar que node_modules exista
if not exist "node_modules" (
    echo [SETUP] Instalando dependencias...
    npm install
)

:: Abrir ventana del Servidor en una nueva consola
echo [1/3] Iniciando Servidor Web en puerto 3000...
start "SERVIDOR WEB" cmd /k "cd /d %~dp0 && node server.js"

:: Esperar 4 segundos para que el servidor arranque
timeout /t 4 /nobreak > nul

:: Abrir ventana del Bot 1 (Auto Roulette)
echo [2/3] Iniciando BOT-1 (Auto Roulette)...
start "BOT-1 AUTO ROULETTE" cmd /k "cd /d %~dp0 && node crawler.js --table 1 --url https://www.casino.org/casinoscores/es/auto-roulette/ --api http://localhost:3000/api/spin --interval 12000"

:: Esperar 2 segundos
timeout /t 2 /nobreak > nul

:: Abrir ventana del Bot 2 (Immersive Roulette)
echo [3/3] Iniciando BOT-2 (Immersive Roulette)...
start "BOT-2 IMMERSIVE ROULETTE" cmd /k "cd /d %~dp0 && node crawler.js --table 2 --url https://www.casino.org/casinoscores/es/immersive-roulette/ --api http://localhost:3000/api/spin --interval 15000"

echo.
echo ==========================================
echo  TODO CORRIENDO! Abre tu navegador en:
echo  http://localhost:3000
echo ==========================================
echo.
pause
