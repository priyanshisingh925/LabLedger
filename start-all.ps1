Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting LabLedger (Blockchain Node + Frontend)  " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Starting Hardhat Local Blockchain Node in a new window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run node"

Write-Host "Waiting 5 seconds for node to boot..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host "`n[2/3] Deploying smart contracts and seeding initial data..." -ForegroundColor Yellow
npm run deploy
npm run seed

Write-Host "`n[3/3] Launching React Bits Frontend in a new window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run frontend:dev"

Write-Host "`n===================================================" -ForegroundColor Green
Write-Host "  LabLedger is running!" -ForegroundColor Green
Write-Host "  - Blockchain RPC:  http://127.0.0.1:8545 (Chain ID: 31337)" -ForegroundColor White
Write-Host "  - React Bits UI:   http://localhost:5173" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Green
