# Android MediaPlayer - Все исправления

## ✅ ВСЕ 4 ПРОБЛЕМЫ ИСПРАВЛЕНЫ:

### 1. Картинки не показывались
**Было:**
```kotlin
// TODO: Загрузка изображения
```

**Исправлено:**
```kotlin
showImage(fileName, isPlaceholder) {
    loadImageToView(imageUrl)
    isPlayingPlaceholder = isPlaceholder
}
```

### 2. Моргание в черный при loop
**Было:**
```kotlin
Player.STATE_ENDED -> loadPlaceholder()
```

**Исправлено:**
```kotlin
Player.STATE_ENDED -> {
    if (!isPlayingPlaceholder) loadPlaceholder()
    // Заглушка loop сама перезапустится
}
```

### 3. После паузы видео начинается сначала
**Было:**
```kotlin
playVideo(fileName) {
    // Всегда reload
}
```

**Исправлено:**
```kotlin
playVideo(fileName, isPlaceholder) {
    if (isSameFile) {
        seekTo(savedPosition) // Продолжаем
    } else {
        // Новый файл
    }
}

player/pause -> savedPosition = currentPosition
```

### 4. Постоянно падает в "Не готов"
**Было:**
- Нет ping/pong

**Исправлено:**
```kotlin
startPingTimer() // Каждые 20 сек
pingTimer.emit("player/ping")
```

## ✅ ЛОГИКА ПО ПРАВИЛАМ:

### Заглушка (постоянно loop):
✅ onCreate() → loadPlaceholder()
✅ Видео-заглушка: repeatMode = REPEAT_MODE_ONE
✅ Картинка-заглушка: isPlayingPlaceholder = true
✅ Постоянно показывается пока не придет команда

### Контент (играет 1 раз):
✅ player/play → playVideo(file, isPlaceholder=false)
✅ repeatMode = REPEAT_MODE_OFF
✅ STATE_ENDED → loadPlaceholder()

### Презентации (листаются):
✅ showPdfPage/showPptxSlide → isPlayingPlaceholder = false
✅ Листаются по командам player/pdfPage, player/pptxPage
✅ player/stop → loadPlaceholder()

### Постоянно в сети:
✅ ping каждые 20 сек
✅ Backend timeout 30 сек
✅ Статус "Готов" постоянно

## 📦 Коммиты:

1. `1857ba1` - images, loop, pause fixes
2. `adb05fb` - ping/pong
3. `47e7698` - placeholder/content logic

## ✅ ИТОГО:

MainActivity.kt: ВСЕ правила реализованы!
Коммитов: 46
