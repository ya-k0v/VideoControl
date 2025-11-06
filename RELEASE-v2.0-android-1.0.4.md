# Release v2.0 - Android TV 1.0.4

## 📦 Релиз подготовлен!

### ✅ Что сделано:

1. **Код обновлен:**
   - Android TV v1.0.4 с оптимизацией черного фона
   - Двойная буферизация для плеера (img1/img2)
   - CSS оптимизации для Raspberry Pi
   
2. **APK собран:**
   - `VCPlayer-1.0.4.apk` (3.3 MB)
   - Подписан debug keystore
   - Расположен: `/vid/videocontrol/clients/android-tv/VCPlayer-1.0.4.apk`

3. **Git коммит создан:**
   ```
   commit: ac9a8e3
   message: Release v2.0 - Android TV 1.0.4: Black screen optimization & double buffering
   ```

4. **Git тег создан:**
   ```
   tag: v2.0-android-1.0.4
   ```

5. **README обновлен:**
   - Версия Android TV: 1.0.2 → 1.0.4
   - Добавлено описание оптимизаций

---

## 🚀 Для завершения релиза выполните:

### 1. Push в GitHub

```bash
cd /vid/videocontrol

# Push коммита
git push origin main

# Push тега
git push origin v2.0-android-1.0.4
```

### 2. Создайте GitHub Release

#### Через веб-интерфейс GitHub:

1. Перейдите: https://github.com/ya-k0v/VideoControl/releases/new
2. **Choose a tag**: `v2.0-android-1.0.4`
3. **Release title**: `v2.0 - Android TV 1.0.4: Black Screen Optimization`
4. **Description**:

```markdown
## 🎯 Android TV Client v1.0.4

### Основные улучшения:

#### 🖤 Оптимизация черного экрана
- **WebView black background** - принудительный черный фон
- **onPageStarted** - черный экран во время загрузки
- **onPageFinished** - черный экран после загрузки
- **Нет белых вспышек** при смене контента

#### ⚡ Двойная буферизация
- **img1/img2** - два слоя изображений
- **Плавные переходы** между типами контента
- **Мгновенное листание** слайдов презентаций
- **Кросс-фейд** для смены видео/изображений

#### 🎨 CSS оптимизации для Raspberry Pi
- `isolation: isolate` - изоляция рендеринга
- `contain: strict` - оптимизация перерисовки
- `backface-visibility: hidden` - устранение вспышек
- `body::before` с `z-index: -9999` - постоянный черный фон

### 📦 Файлы

- **VCPlayer-1.0.4.apk** (3.3 MB) - подписанный APK для установки
- Минимальная версия Android: 5.0 (API 21)
- Поддерживаемые устройства: Android TV, планшеты, телефоны

### 📱 Установка

```bash
adb install -r VCPlayer-1.0.4.apk
```

### 🔧 Технические детали

**Android TV App:**
- versionCode: 5
- versionName: 1.0.4
- MainActivity.kt: WebView black background optimization
- build.gradle: Version bump

**Web Player:**
- player-videojs.html: Double buffering HTML structure
- player-videojs.js: img1/img2 buffer management
- CSS: Raspberry Pi optimizations

### 📝 Changelog

См. полный changelog: [clients/android-tv/CHANGELOG.md](clients/android-tv/CHANGELOG.md)

### 🐛 Исправлено

- Белые вспышки при смене контента
- Моргание при переключении слайдов презентаций
- Белый фон WebView по умолчанию
- Ошибки соединения в версии 1.0.3

### ⬆️ Обновление с 1.0.3

Если у вас установлена версия 1.0.3, просто переустановите:

```bash
adb install -r VCPlayer-1.0.4.apk
```

Настройки сохранятся (server URL и device ID).

---

**Совместимость:** VideoControl Server v2.0+  
**Разработчик:** @ya-k0v  
**Дата релиза:** 2025-11-06
```

5. **Прикрепите файлы:**
   - Нажмите "Attach binaries by dropping them here or selecting them"
   - Загрузите: `/vid/videocontrol/clients/android-tv/VCPlayer-1.0.4.apk`

6. **Publish release** ✅

---

## 📋 Альтернатива: GitHub CLI

```bash
cd /vid/videocontrol

# Установите gh если нет
# brew install gh  (macOS)
# apt install gh   (Ubuntu)

# Авторизуйтесь
gh auth login

# Создайте релиз с APK
gh release create v2.0-android-1.0.4 \
  --title "v2.0 - Android TV 1.0.4: Black Screen Optimization" \
  --notes-file RELEASE-v2.0-android-1.0.4.md \
  clients/android-tv/VCPlayer-1.0.4.apk
```

---

## ✅ Checklist

- [x] Код обновлен и протестирован
- [x] APK собран и подписан
- [x] README обновлен
- [x] CHANGELOG создан
- [x] Git коммит создан
- [x] Git тег создан
- [ ] Push в GitHub
- [ ] GitHub Release создан
- [ ] APK прикреплен к релизу

---

## 📞 Поддержка

После создания релиза:
- Тестирование на реальных устройствах
- Обновление документации если нужно
- Закрытие связанных issues

**GitHub:** https://github.com/ya-k0v/VideoControl  
**Issues:** https://github.com/ya-k0v/VideoControl/issues

