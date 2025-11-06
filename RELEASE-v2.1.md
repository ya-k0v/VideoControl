# Release v2.1 - VideoControl System

## 🎯 Основные улучшения

### 📱 Android TV Client v1.0.7 (FINAL)

#### 🖤 Полное устранение кнопки Play Android

**4-уровневая защита:**

1. **Постоянный черный слой под WebView**
   ```xml
   <View id="blackBackground" background="#000000" />
   <FrameLayout id="webViewContainer">
       <!-- WebView добавляется программно -->
   </FrameLayout>
   ```

2. **Блокировка fullscreen overlay**
   ```kotlin
   override fun onShowCustomView(...) {
       // НЕ вызываем super - блокируем overlay
       callback?.onCustomViewHidden()
   }
   ```

3. **JavaScript скрытие video до воспроизведения**
   ```javascript
   // Скрываем при паузе/загрузке/ошибке
   video.style.opacity = '0';
   video.style.visibility = 'hidden';
   
   // Показываем только при воспроизведении
   video.addEventListener('playing', () => show());
   ```

4. **Агрессивная CSS инъекция (20+ правил)**
   - `::-webkit-media-controls-*` - все WebView контролы
   - `.vjs-*` - Video.js контролы
   - `pointer-events: none` - блокировка взаимодействия
   - `width: 0, height: 0` - нулевые размеры

**Результат:**
- ✅ Кнопка Play **полностью устранена**
- ✅ Черный экран при всех переходах
- ✅ Профессиональный kiosk mode
- ✅ Работает на всех Android устройствах

---

### 🎨 Web Player v2.1

#### Двойная буферизация (img1/img2)

**Плавные переходы презентаций:**
- Два img элемента (`img1`, `img2`) переключаются как ping-pong buffer
- Пока один слайд виден, следующий предзагружается в другой буфер
- Кросс-фейд для смены типов контента (0.5s)
- Мгновенное листание слайдов из кэша

**Оптимизации для Raspberry Pi:**
```css
#stage {
  isolation: isolate;
  contain: layout style paint;
}

.layer {
  contain: strict;
  backface-visibility: hidden;
}

body::before {
  z-index: -9999;
  background: #000;
}
```

#### Admin Panel Preview Fix

**Проблема:** Превью не работало для PDF/PPTX/изображений  
**Решение:** Добавлены параметры `type` и `page` как в speaker.js

```javascript
if (ext === 'pdf') u += `&type=pdf&page=1`;
else if (ext === 'pptx') u += `&type=pptx&page=1`;
else if (['png','jpg','jpeg','gif','webp'].includes(ext)) u += `&type=image&page=1`;

u += `&t=${Date.now()}`; // Cache busting
```

---

## 📦 Файлы

### Android TV APK:
- **VCPlayer-1.0.7.apk** (3.3 MB, signed)
- Min Android: 5.0 (API 21)
- Target Android: 14 (API 34)
- Package: `com.videocontrol.tv`

### Измененные файлы:

**Android TV:**
- `MainActivity.kt` - permanent black layer, video hiding JS
- `activity_main.xml` - two-layer layout architecture
- `build.gradle` - version 1.0.7
- `CHANGELOG.md` - detailed v1.0.7 changelog
- `README.md` - updated to v1.0.7

**Web Player:**
- `player-videojs.js` - double buffering (img1/img2)
- `player-videojs.html` - two image layers, CSS optimizations
- `admin.js` - preview fix with type/page parameters

**Documentation:**
- `README.md` - version 2.1, changelog
- `RELEASE-v2.1.md` - this file

---

## 🚀 Установка

### Обновление сервера:

```bash
cd /vid/videocontrol
git pull
sudo systemctl restart videocontrol
```

### Android TV устройства:

```bash
# Одно устройство
cd /vid/videocontrol/clients/android-tv
adb install -r VCPlayer-1.0.7.apk

# Все устройства
bash mass-install.sh
```

---

## ✅ Что исправлено

### Критические баги:
- ❌ Стандартная кнопка Play Android при смене контента
- ❌ Белые вспышки на Raspberry Pi
- ❌ Превью не работает в админ панели
- ❌ Моргание при переключении слайдов презентаций

### Все работает:
- ✅ Android TV - полный kiosk mode без кнопок
- ✅ Raspberry Pi - плавные переходы без вспышек
- ✅ Админка - превью для всех типов файлов
- ✅ Презентации - мгновенное листание

---

## 🧪 Тестирование

**Протестировано на:**
- ✅ iconBIT DS2 (Android 7.0)
- ✅ Lumien LS5550SD (Android 11.0)
- ✅ Raspberry Pi 4 (Chromium)
- ✅ Windows 10 (Chrome)
- ✅ Android Tablet (Android 12)

**Типы контента:**
- ✅ Видео (MP4, WebM, OGG)
- ✅ Изображения (PNG, JPG, GIF, WebP)
- ✅ PDF презентации
- ✅ PowerPoint (PPTX)

---

## 📋 Технические детали

### Android TV Architecture:

```
┌─────────────────────────────────┐
│  rootContainer (FrameLayout)    │
│  ├─ blackBackground (View)      │ ← Постоянный черный слой
│  │  [BLACK #000000]              │
│  ├─ webViewContainer             │
│  │  └─ WebView                   │ ← Плеер поверх черного
│  └─ tapBlocker (View)            │ ← Блокировка тапов
└─────────────────────────────────┘
```

### Web Player Architecture:

```
┌─────────────────────────────────┐
│  #stage                          │
│  ├─ ::before (z-index: -9999)   │ ← Постоянный черный
│  ├─ #idle (layer)                │ ← Черный экран
│  ├─ #videoContainer (layer)     │ ← Video.js
│  ├─ #img1 (layer)                │ ← Buffer 1
│  ├─ #img2 (layer)                │ ← Buffer 2
│  └─ #pdf (layer)                 │ ← PDF iframe
└─────────────────────────────────┘
```

### Protection Levels:

| Level | Method | Status |
|-------|--------|--------|
| 1 | Permanent black View | ✅ |
| 2 | Fullscreen overlay block | ✅ |
| 3 | Video hiding JS | ✅ |
| 4 | CSS injection (20+ rules) | ✅ |
| 5 | Tap blocker overlay | ✅ |
| 6 | Double buffering (web) | ✅ |

---

## 🔧 Конфигурация

### Рекомендуемые флаги Chromium для Raspberry Pi:

```bash
chromium-browser \
  --kiosk \
  --force-dark-mode \
  --enable-features=WebUIDarkMode \
  --disable-features=TranslateUI \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  "http://YOUR_SERVER/player-videojs.html?device_id=YOUR_ID"
```

### Nginx на порту 80:
```bash
sudo systemctl status nginx
sudo systemctl status videocontrol
```

---

## 📞 Поддержка

**Проблемы?**
- GitHub Issues: https://github.com/ya-k0v/VideoControl/issues
- Документация: [README.md](README.md)
- Android Logcat: `adb logcat | grep VideoControl`

**Changelog:**
- [CHANGELOG.md](clients/android-tv/CHANGELOG.md) - Android TV
- [AUDIT-REPORT.md](AUDIT-REPORT.md) - Server audit

---

## ⬆️ Обновление

### С версии 2.0 или ниже:

**Сервер:**
```bash
cd /vid/videocontrol
git pull
sudo systemctl restart videocontrol
```

**Android TV:**
```bash
adb install -r VCPlayer-1.0.7.apk
# Настройки сохранятся
```

---

**Разработчик:** @ya-k0v  
**Дата релиза:** 2025-11-06  
**Версия:** v2.1 / Android TV v1.0.7  
**Статус:** Production Ready ✅

## 🙏 Thank you for using VideoControl!

⭐ Star the project: https://github.com/ya-k0v/VideoControl

