# Android App - Почему изображения грузятся медленно и моргают

## 🎥 ExoPlayer (Видео) - Все отлично:

ExoPlayer специально создан для медиа-стриминга и имеет:

1. **Встроенный кэш** (SimpleCache)
   - Видео кешируется на диск (500 MB)
   - Повторные просмотры мгновенны

2. **Буферизация**
   - Предзагружает данные заранее
   - DefaultLoadControl управляет буферами

3. **Плавные переходы**
   - Смена источника без моргания
   - Transition между треками

```kotlin
// ExoPlayer с кэшем
val simpleCache = SimpleCache(
    cacheDir, 
    LeastRecentlyUsedCacheEvictor(500 * 1024 * 1024)
)
val cacheDataSourceFactory = CacheDataSource.Factory()
    .setCache(simpleCache)
    
player.setMediaSource(mediaSource)
player.prepare()
```

---

## 🖼️ ImageView (Изображения) - Проблема:

Текущая реализация **ОЧЕНЬ простая** и имеет проблемы:

### ❌ Что не так:

```kotlin
private fun showImage(fileName: String) {
    // 1. Сразу показываем ImageView
    imageView.visibility = VISIBLE  // Показываем пустой/старый imageView
    
    // 2. Загружаем изображение асинхронно
    CoroutineScope(Dispatchers.IO).launch {
        val bitmap = BitmapFactory.decodeStream(connection.inputStream)
        
        withContext(Dispatchers.Main) {
            imageView.setImageBitmap(bitmap)  // Только СЕЙЧАС показываем
        }
    }
}
```

### Проблемы:

1. **Нет кэша** - каждый раз загружаем по сети
2. **Нет предзагрузки** - грузим только когда показываем
3. **Одинарный буфер** - старое изображение видно пока грузится новое
4. **Моргание** - imageView.setImageBitmap() заменяет содержимое резко

---

## 🎯 Решение: Двойная буферизация (как в player-videojs.html)

### Как работает в браузерном плеере:

```html
<!-- Два ImageView вместо одного -->
<img id="img1" class="layer" />
<img id="img2" class="layer" />
```

```javascript
let currentImgBuffer = 1;

function showImage() {
    // 1. Определяем текущий и следующий буфер
    const current = currentImgBuffer === 1 ? img1 : img2;
    const next = currentImgBuffer === 1 ? img2 : img1;
    
    // 2. Предзагружаем в СКРЫТЫЙ буфер
    const tempImg = new Image();
    tempImg.onload = () => {
        // Изображение загружено!
        next.src = imageUrl;  // Ставим в следующий буфер
        
        // 3. Плавно показываем следующий буфер
        next.classList.add('visible');      // opacity: 1
        current.classList.remove('visible'); // opacity: 0
        
        // 4. Переключаем указатель
        currentImgBuffer = currentImgBuffer === 1 ? 2 : 1;
    };
    tempImg.src = imageUrl;  // Начинаем загрузку
}
```

**Результат:**
- ✅ Старое изображение видно ДО загрузки нового
- ✅ Новое изображение предзагружено в фоне
- ✅ Плавный crossfade между изображениями
- ✅ Никакого моргания!

---

## 🔧 Решение для Android

### Вариант 1: Библиотека Glide (рекомендуется)

Glide - стандарт индустрии для загрузки изображений в Android:

```kotlin
// build.gradle
dependencies {
    implementation 'com.github.bumptech.glide:glide:4.16.0'
}

// Использование
Glide.with(this)
    .load(imageUrl)
    .diskCacheStrategy(DiskCacheStrategy.ALL)  // Кэш на диск
    .placeholder(currentDrawable)              // Показываем текущее
    .transition(DrawableTransitionOptions.withCrossFade(300)) // Crossfade
    .into(imageView)
```

**Преимущества Glide:**
- ✅ Автоматический кэш (память + диск)
- ✅ Предзагрузка
- ✅ Плавные переходы (crossfade)
- ✅ Обработка ошибок
- ✅ Управление памятью

### Вариант 2: Двойная буферизация (как в браузере)

```xml
<!-- activity_main.xml -->
<FrameLayout>
    <ImageView
        android:id="@+id/imageView1"
        android:visibility="gone"
        android:scaleType="fitCenter" />
    
    <ImageView
        android:id="@+id/imageView2"
        android:visibility="gone"
        android:scaleType="fitCenter" />
    
    <com.google.android.exoplayer2.ui.StyledPlayerView
        android:id="@+id/playerView" />
</FrameLayout>
```

```kotlin
private var currentImageBuffer = 1
private var imageView1: ImageView
private var imageView2: ImageView

private fun showImage(fileName: String, isPlaceholder: Boolean = false) {
    val imageUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(fileName)}"
    
    // Определяем текущий и следующий буфер
    val current = if (currentImageBuffer == 1) imageView1 else imageView2
    val next = if (currentImageBuffer == 1) imageView2 else imageView1
    
    // Загружаем в следующий буфер (скрытый)
    CoroutineScope(Dispatchers.IO).launch {
        try {
            val connection = URL(imageUrl).openConnection() as HttpURLConnection
            val bitmap = BitmapFactory.decodeStream(connection.inputStream)
            
            withContext(Dispatchers.Main) {
                // Загружено! Ставим в следующий буфер
                next.setImageBitmap(bitmap)
                
                // Плавный переход
                next.animate()
                    .alpha(1f)
                    .setDuration(300)
                    .withStartAction {
                        next.visibility = VISIBLE
                        next.alpha = 0f
                    }
                    .withEndAction {
                        // Скрываем предыдущий
                        current.visibility = GONE
                        current.setImageDrawable(null)
                        
                        // Переключаем буфер
                        currentImageBuffer = if (currentImageBuffer == 1) 2 else 1
                    }
                    .start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading image", e)
        }
    }
}
```

---

## 🎯 Рекомендация:

**Используй Glide!** 

Это:
1. Стандарт индустрии
2. Решает все проблемы (кэш, crossfade, предзагрузка)
3. 2-3 строки кода вместо 50+
4. Оптимизирован и протестирован

Двойная буферизация вручную - только если нужен особый контроль.

---

## 📊 Сравнение:

| Аспект | ExoPlayer (видео) | ImageView (сейчас) | Glide (решение) |
|--------|-------------------|-------------------|-----------------|
| Кэш | ✅ 500MB диск | ❌ Нет | ✅ Память+диск |
| Предзагрузка | ✅ Буферизация | ❌ Нет | ✅ Есть |
| Плавность | ✅ Плавно | ❌ Моргание | ✅ Crossfade |
| Переход | ✅ Без артефактов | ❌ Скачок | ✅ Анимация |
| Код | ~80 строк | 20 строк | 5 строк |

---

**Вывод:** Проблема не в принципе работы, а в отсутствии кэша и буферизации для изображений!
