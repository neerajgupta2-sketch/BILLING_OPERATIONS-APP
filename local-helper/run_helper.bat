@echo off
echo Billing Reports Helper
echo ======================
echo Make sure your VPN is connected before continuing.
pause
python fetch_reports.py
echo.
pause
