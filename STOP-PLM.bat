@echo off
title PLM ^& ERP beenden
:: Port aus plm.config (dort merkt sich PLM einen Ausweich-Port), sonst 3000
set "PLM_PORT=3000"
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0plm.config") do (
    if /i "%%a"=="port" if not "%%b"=="" set "PLM_PORT=%%b"
)
echo.
echo  PLM ^& ERP wird beendet...

:: Sauber ueber "Beenden" wie in der Oberflaeche - der Server schliesst sich selbst
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri http://localhost:%PLM_PORT%/api/shutdown -TimeoutSec 3 | Out-Null } catch {}"
timeout /t 2 /nobreak >nul

:: Reagiert er nicht: den Node-Prozess beenden, der den Port belegt - nur Node,
:: kein anderes Programm, das zufaellig denselben Port nutzt
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PLM_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } | Where-Object { $_.ProcessName -eq 'node' } | Stop-Process -Force -ErrorAction SilentlyContinue"

echo  Fertig.
timeout /t 2 /nobreak >nul
