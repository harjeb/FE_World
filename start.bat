@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   AgentTactics  -  start backend + frontend
echo ============================================
echo.

rem ---- 检查依赖，缺失则安装 ----
if not exist "backend\node_modules" (
  echo [backend] dependencies not found, installing...
  pushd backend
  call npm install
  popd
)
if not exist "frontend\node_modules" (
  echo [frontend] dependencies not found, installing...
  pushd frontend
  call npm install
  popd
)

rem ---- 启动后端 (API + 静态前端, 端口 8525) ----
echo [backend] starting API on http://localhost:8525 ...
start "AgentTactics Backend" /D "%~dp0backend" cmd /k "npm start"

rem ---- 启动前端开发服务器 (端口 8524) ----
echo [frontend] starting dev server on http://localhost:8524 ...
start "AgentTactics Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

rem ---- 等待前端构建完成后打开浏览器 ----
echo.
echo waiting for dev server to be ready...
"%SystemRoot%\System32\ping.exe" -n 9 127.0.0.1 >nul
start "" http://localhost:8524

echo.
echo Done. Two windows opened:
echo   - AgentTactics Backend   (port 8525)
echo   - AgentTactics Frontend  (port 8524)
echo Close those windows to stop the services.
echo.
pause
endlocal
