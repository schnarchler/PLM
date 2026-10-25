@echo off
title PLM ^& ERP

:: Sicherheitssperre entfernen (Zone.Identifier / SmartScreen)
:: Diese Zeile entfernt die "Herausgeber nicht verifiziert"-Markierung ein fuer allemal.
powershell -NoProfile -Command "Unblock-File -LiteralPath '%~f0'" >nul 2>&1

:: Konfiguration
set "PLM_DIR=%~dp0backend"
set "PLM_DATA_DIR="

:: Datenpfad aus plm.config lesen
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0plm.config") do (
    set "_key=%%a"
    if /i "%%a"=="data_dir" (
        if not "%%b"=="" set "PLM_DATA_DIR=%%b"
    )
)

if "%PLM_DATA_DIR%"=="" (
    echo HINWEIS: Kein Datenpfad in plm.config gefunden.
    echo Bitte plm.config im PLM-Verzeichnis bearbeiten und data_dir setzen.
    echo Verwende Standardpfad: %PLM_DIR%\data
    set "PLM_DATA_DIR=%PLM_DIR%\data"
)

:: Node.js pruefen
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo FEHLER: Node.js nicht gefunden. Bitte installieren: https://nodejs.org
    pause
    exit /b 1
)
echo Node.js gefunden: OK

:: Python-Pakete fuer Etikettendruck installieren (qrcode + Pillow)
where py >nul 2>&1
if %errorlevel% equ 0 (
    echo Pruefe Python-Pakete fuer Etikettendruck...
    py -c "import qrcode, PIL" >nul 2>&1
    if %errorlevel% neq 0 (
        echo  Installiere qrcode und Pillow...
        py -m pip install qrcode pillow --quiet
        if %errorlevel% equ 0 (
            echo  qrcode + Pillow installiert: OK
        ) else (
            echo  HINWEIS: qrcode/Pillow konnten nicht installiert werden - Etiketten werden ohne QR-Code gedruckt.
        )
    ) else (
        echo qrcode + Pillow: OK
    )
) else (
    echo HINWEIS: Python ^(py^) nicht gefunden - Etiketten ohne QR-Code.
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
if not exist "%PLM_DATA_DIR%" (
    mkdir "%PLM_DATA_DIR%"
    if %errorlevel% neq 0 (
        echo FEHLER: Datenverzeichnis konnte nicht erstellt werden: %PLM_DATA_DIR%
        echo Bitte Pfad pruefen oder als Administrator ausfuehren.
        pause
        exit /b 1
    )
)
if not exist "%PLM_DATA_DIR%\files" mkdir "%PLM_DATA_DIR%\files"

:: Info
echo.
echo  =========================================
echo   PLM ^& ERP startet
echo   Daten: %PLM_DATA_DIR%
echo  =========================================
echo.
echo  Der Browser oeffnet sich, sobald der Server bereit ist.
echo  Fenster NICHT schliessen - Strg+C zum Beenden
echo.

:: Server starten. Den Port waehlt er selbst (3000, sonst der naechste freie)
:: und oeffnet dann den Browser - nur er weiss, welchen Port er bekommen hat.
cd /d "%PLM_DIR%"
set "PLM_DATA_DIR=%PLM_DATA_DIR%"
set "PLM_OPEN_BROWSER=1"
set "PLM_START_SCRIPT=1"

:: Ab hier ein Block: cmd liest ihn ganz ein, bevor node startet. Ersetzt ein
:: Update diese Datei, liest cmd danach nicht mitten in der neuen weiter -
:: "goto run" springt an die Marke der neuen Fassung.
:: Code 75 = Update installiert -> neu starten, ohne neuen Browser-Tab.
:: Sauber beendet (auch per "Beenden" in der Oberflaeche) -> Fenster schliesst
:: sich sofort. Nur bei einem Fehler stehen bleiben, damit die Meldung lesbar ist.
:run
(
    node server.js
    if errorlevel 75 if not errorlevel 76 (
        echo.
        echo  Update installiert - PLM startet neu...
        echo.
        set "PLM_OPEN_BROWSER="
        goto run
    )
    if errorlevel 1 (
        echo.
        call echo  FEHLER: Server beendet sich mit Fehlercode %%errorlevel%%
        echo.
        echo  Druecke eine Taste zum Schliessen...
        pause >nul
    )
    exit
)
