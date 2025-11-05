# VideoControl TV - PowerShell Build Script
# Автоматическая сборка APK для Android TV

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  📱 VideoControl TV - Сборка APK" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Проверка что мы в правильной директории
if (-Not (Test-Path ".\gradlew.bat")) {
    Write-Host "❌ Ошибка: gradlew.bat не найден!" -ForegroundColor Red
    Write-Host "   Запустите скрипт из папки VideoControlTV" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Меню выбора типа сборки
Write-Host "Выберите тип сборки:" -ForegroundColor Yellow
Write-Host "  [1] Debug APK (для тестирования)" -ForegroundColor White
Write-Host "  [2] Release APK (для продакшена)" -ForegroundColor White
Write-Host "  [3] Clean + Debug" -ForegroundColor White
Write-Host "  [4] Clean + Release" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Ваш выбор (1-4)"

# Определяем команду сборки
switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🔨 Сборка Debug APK..." -ForegroundColor Green
        $buildType = "assembleDebug"
        $outputPath = "app\build\outputs\apk\debug\app-debug.apk"
    }
    "2" {
        Write-Host ""
        Write-Host "🔨 Сборка Release APK..." -ForegroundColor Green
        $buildType = "assembleRelease"
        $outputPath = "app\build\outputs\apk\release\app-release-unsigned.apk"
    }
    "3" {
        Write-Host ""
        Write-Host "🧹 Очистка проекта..." -ForegroundColor Yellow
        & .\gradlew.bat clean
        Write-Host "🔨 Сборка Debug APK..." -ForegroundColor Green
        $buildType = "assembleDebug"
        $outputPath = "app\build\outputs\apk\debug\app-debug.apk"
    }
    "4" {
        Write-Host ""
        Write-Host "🧹 Очистка проекта..." -ForegroundColor Yellow
        & .\gradlew.bat clean
        Write-Host "🔨 Сборка Release APK..." -ForegroundColor Green
        $buildType = "assembleRelease"
        $outputPath = "app\build\outputs\apk\release\app-release-unsigned.apk"
    }
    default {
        Write-Host ""
        Write-Host "❌ Неверный выбор!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Запуск сборки
$startTime = Get-Date

try {
    & .\gradlew.bat $buildType
    
    if ($LASTEXITCODE -eq 0) {
        $endTime = Get-Date
        $duration = $endTime - $startTime
        
        Write-Host ""
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host "  ✅ Сборка успешно завершена!" -ForegroundColor Green
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host ""
        Write-Host "⏱️  Время сборки: $($duration.Minutes)м $($duration.Seconds)с" -ForegroundColor Cyan
        Write-Host ""
        
        # Проверяем существование APK
        if (Test-Path $outputPath) {
            $apkSize = (Get-Item $outputPath).Length / 1MB
            $apkSizeFormatted = "{0:N2}" -f $apkSize
            $fullPath = (Resolve-Path $outputPath).Path
            
            Write-Host "📦 APK файл:" -ForegroundColor Yellow
            Write-Host "   Путь: $fullPath" -ForegroundColor White
            Write-Host "   Размер: $apkSizeFormatted MB" -ForegroundColor White
            Write-Host ""
            
            # Предложение открыть папку
            Write-Host "Открыть папку с APK? (y/n): " -NoNewline -ForegroundColor Yellow
            $openFolder = Read-Host
            
            if ($openFolder -eq "y" -or $openFolder -eq "Y") {
                $folderPath = Split-Path $fullPath
                Start-Process explorer.exe -ArgumentList $folderPath
            }
            
            # Предложение установить через ADB
            Write-Host ""
            Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
            Write-Host "  📲 Установка на Android TV" -ForegroundColor Cyan
            Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Установить APK через ADB? (y/n): " -NoNewline -ForegroundColor Yellow
            $installAdb = Read-Host
            
            if ($installAdb -eq "y" -or $installAdb -eq "Y") {
                Write-Host ""
                Write-Host "Введите IP адрес Android TV: " -NoNewline -ForegroundColor Yellow
                $tvIp = Read-Host
                
                if ($tvIp) {
                    Write-Host ""
                    Write-Host "🔌 Подключение к TV..." -ForegroundColor Cyan
                    adb connect "${tvIp}:5555"
                    
                    Write-Host "📦 Установка APK..." -ForegroundColor Cyan
                    adb install -r $fullPath
                    
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host ""
                        Write-Host "✅ APK успешно установлен!" -ForegroundColor Green
                        Write-Host ""
                        Write-Host "Запустить приложение? (y/n): " -NoNewline -ForegroundColor Yellow
                        $launchApp = Read-Host
                        
                        if ($launchApp -eq "y" -or $launchApp -eq "Y") {
                            Write-Host "🚀 Запуск приложения..." -ForegroundColor Cyan
                            adb shell am start -n com.videocontrol.tv/.MainActivity
                            Write-Host ""
                            Write-Host "✅ Приложение запущено на TV!" -ForegroundColor Green
                        }
                    } else {
                        Write-Host ""
                        Write-Host "❌ Ошибка установки APK" -ForegroundColor Red
                        Write-Host "   Проверьте подключение к TV и USB Debugging" -ForegroundColor Yellow
                    }
                }
            }
            
        } else {
            Write-Host "⚠️  APK файл не найден по пути: $outputPath" -ForegroundColor Yellow
        }
        
    } else {
        Write-Host ""
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Red
        Write-Host "  ❌ Ошибка сборки!" -ForegroundColor Red
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Red
        Write-Host ""
        Write-Host "Проверьте логи выше для деталей ошибки." -ForegroundColor Yellow
        exit 1
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ Критическая ошибка: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🎉 Готово!" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

