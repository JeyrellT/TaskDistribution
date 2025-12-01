@echo off
REM ============================================
REM Script de Push Automático - Distribution Manager PWA
REM Uso: deploy.bat "mensaje del commit"
REM ============================================

cd /d %~dp0

echo ========================================
echo  Distribution Manager PWA - Deploy
echo  Desarrollado por JC Analytics
echo ========================================
echo.

REM Verificar si hay cambios
git status --porcelain > nul
if %errorlevel% neq 0 (
    echo [ERROR] No es un repositorio Git
    pause
    exit /b 1
)

REM Obtener mensaje del commit
if "%~1"=="" (
    set /p COMMIT_MSG="Mensaje del commit: "
) else (
    set COMMIT_MSG=%~1
)

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=Update: %date% %time:~0,8%
)

echo.
echo [1/4] Agregando cambios...
git add -A

echo [2/4] Creando commit: "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"

echo [3/4] Sincronizando con GitHub...
git pull origin main --rebase

echo [4/4] Subiendo cambios...
git push origin main

echo.
echo ========================================
echo  ✅ Deploy completado exitosamente!
echo  📦 Repositorio: https://github.com/JeyrellT/TaskDistribution
echo ========================================
echo.
pause
