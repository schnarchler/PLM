@echo off
title 3D-PLM beenden
echo.
echo  3D-PLM wird beendet...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq 3D-PLM" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq 3D-PLM" >nul 2>&1
echo  Fertig.
timeout /t 2 /nobreak > nul
