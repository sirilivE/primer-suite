@echo off
rem Starts the Primer Suite web version and opens it in the default browser (needs Node.js installed).
cd /d "%~dp0"
start "" http://localhost:8080
node serve.js 8080
