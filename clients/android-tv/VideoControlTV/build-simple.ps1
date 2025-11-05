# VideoControl TV - Простая сборка APK
# Быстрая сборка без интерактивных вопросов

Write-Host ""
Write-Host "🔨 Сборка Debug APK..." -ForegroundColor Green
Write-Host ""

# Проверка gradlew.bat
if (-Not (Test-Path ".\gradlew.bat")) {
    Write-Host "❌ Ошибка: gradlew.bat не найден!" -ForegroundColor Red
    Write-Host "   Запустите скрипт из папки VideoControlTV" -ForegroundColor Yellow
    exit 1
}

# Сборка
& .\gradlew.bat assembleDebug

# Проверка результата
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Сборка успешна!" -ForegroundColor Green
    Write-Host ""
    
    $apkPath = "app\build\outputs\apk\debug\app-debug.apk"
    
    if (Test-Path $apkPath) {
        $fullPath = (Resolve-Path $apkPath).Path
        $apkSize = (Get-Item $apkPath).Length / 1MB
        $apkSizeFormatted = "{0:N2}" -f $apkSize
        
        Write-Host "📦 APK готов:" -ForegroundColor Yellow
        Write-Host "   $fullPath" -ForegroundColor White
        Write-Host "   Размер: $apkSizeFormatted MB" -ForegroundColor White
        Write-Host ""
        
        # Открыть папку
        $folderPath = Split-Path $fullPath
        Start-Process explorer.exe -ArgumentList $folderPath
    }
} else {
    Write-Host ""
    Write-Host "❌ Ошибка сборки!" -ForegroundColor Red
    exit 1
}

