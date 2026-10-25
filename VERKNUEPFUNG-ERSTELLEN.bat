@echo off
title PLM ^& ERP - Desktop-Verknuepfung

:: Legt auf dem Desktop die Verknuepfung "PLM & ERP" zu START-PLM.bat an,
:: mit dem PLM-Logo (PLM-ERP.ico) als Symbol. Eine eigene .bat-Datei kann
:: kein Symbol tragen, nur eine Verknuepfung. Eine bestehende Verknuepfung
:: wird ueberschrieben - nochmals ausfuehren, nachdem der PLM-Ordner
:: verschoben wurde. Der Pfad geht ueber eine Umgebungsvariable an
:: PowerShell, damit Leerzeichen und Apostrophe im Pfad nicht stoeren.

set "PLM_HOME=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desk = [Environment]::GetFolderPath('Desktop');" ^
  "$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk 'PLM & ERP.lnk'));" ^
  "$lnk.TargetPath = Join-Path $env:PLM_HOME 'START-PLM.bat';" ^
  "$lnk.WorkingDirectory = $env:PLM_HOME;" ^
  "$lnk.IconLocation = (Join-Path $env:PLM_HOME 'PLM-ERP.ico') + ',0';" ^
  "$lnk.Description = 'PLM & ERP starten';" ^
  "$lnk.Save()"

if %errorlevel% neq 0 (
    echo FEHLER: Die Verknuepfung konnte nicht angelegt werden.
    pause
    exit /b 1
)
echo Verknuepfung "PLM & ERP" mit Logo auf dem Desktop angelegt.
timeout /t 3 >nul
