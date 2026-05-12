@echo off
title PLM & ERP

:: Sicherheitssperre entfernen (Zone.Identifier / SmartScreen)
:: Diese Zeile entfernt die "Herausgeber nicht verifiziert"-Markierung ein fuer allemal.
powershell -NoProfile -Command "Unblock-File -LiteralPath '%~f0'" >nul 2>&1

:: Konfiguration
set "PLM_PORT=3000"
set "PLM_DATA_DIR=D:\Proton Drive\My files\020_Dokumente\020_3D_Print\plm-data"
set "PLM_DIR=%~dp0backend"

:: Node.js pruefen
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo FEHLER: Node.js nicht gefunden. Bitte installieren: https://nodejs.org
    pause
    exit /b 1
)

:: npm install nur wenn node_modules fehlt
if not exist "%PLM_DIR%\node_modules" (
    echo Erstmaliger Start - Pakete werden installiert, bitte warten...
    cd /d "%PLM_DIR%"
    call npm install --production
    if %errorlevel% neq 0 (
        echo FEHLER: npm install fehlgeschlagen.
        pause
        exit /b 1
    )
)

:: Datenverzeichnis anlegen
if not exist "%PLM_DATA_DIR%" mkdir "%PLM_DATA_DIR%"
if not exist "%PLM_DATA_DIR%\files" mkdir "%PLM_DATA_DIR%\files"

:: Info
echo.
echo  =========================================
echo   PLM ^& ERP startet auf Port %PLM_PORT%
echo   Daten: %PLM_DATA_DIR%
echo  =========================================
echo.
echo  Browser wird in 4 Sekunden geoeffnet...
echo  Fenster NICHT schliessen - Strg+C zum Beenden
echo.

:: Browser nach Verzoegerung oeffnen (eigenes Fenster)
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:%PLM_PORT%"

:: Server starten - Umgebungsvariable direkt mitgeben
cd /d "%PLM_DIR%"
set "PLM_DATA_DIR=%PLM_DATA_DIR%"
set "PLM_PORT=%PLM_PORT%"
node server.js

echo.
echo  Server beendet.
exit
