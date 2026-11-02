@echo off
cd /d "C:\Users\Eren\Desktop\BibleHelper\backend"
node server.js
timeout /t 5 >nul
curl -X POST http://localhost:3000/api/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\": \"What is the meaning of life?\"}"