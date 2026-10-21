@echo off
title LabLedger Launcher
echo ===================================================
echo   Starting LabLedger (Blockchain Node + Frontend)
echo ===================================================

echo [1/3] Starting Hardhat Local Blockchain Node in a background window...
start "LabLedger - Hardhat Node" cmd /k "npm run node"

echo Waiting 5 seconds for node to initialize...
timeout /t 5 /nobreak >nul

echo [2/3] Deploying smart contracts and seeding test equipment...
call npm run deploy
call npm run seed

echo [3/3] Launching React Bits Frontend...
start "LabLedger - Frontend" cmd /k "npm run frontend:dev"

echo ===================================================
echo   LabLedger is running!
echo   - Blockchain RPC:  http://127.0.0.1:8545 (Chain ID: 31337)
echo   - React Bits UI:   http://localhost:5173
echo ===================================================
pause
