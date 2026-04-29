@echo off
chcp 65001 >nul
echo ========================================
echo   SyncCinema 推送助手
echo ========================================
echo.
echo 当前待推送的提交：
git log --oneline origin/main..main 2>nul
if %errorlevel% neq 0 (
    echo   （首次推送或无法获取远程信息）
)
echo.
echo 正在推送到 GitHub ...
git push -u origin main --no-verify
echo.
if %errorlevel% equ 0 (
    echo ✅ 推送成功！
) else (
    echo ❌ 推送失败，请检查网络或代理设置
)
echo.
pause
