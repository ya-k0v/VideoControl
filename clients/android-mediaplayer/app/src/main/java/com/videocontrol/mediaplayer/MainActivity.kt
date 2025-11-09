package com.videocontrol.mediaplayer

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.exoplayer2.ExoPlayer
import com.google.android.exoplayer2.MediaItem
import com.google.android.exoplayer2.Player
import com.google.android.exoplayer2.ui.StyledPlayerView
import com.google.android.exoplayer2.source.ProgressiveMediaSource
import com.google.android.exoplayer2.upstream.DefaultHttpDataSource
import com.google.android.exoplayer2.upstream.DefaultDataSource
import com.google.android.exoplayer2.upstream.DefaultAllocator
import com.google.android.exoplayer2.DefaultLoadControl
import com.google.android.exoplayer2.C
import com.google.android.exoplayer2.upstream.cache.CacheDataSource
import com.google.android.exoplayer2.upstream.cache.LeastRecentlyUsedCacheEvictor
import com.google.android.exoplayer2.upstream.cache.SimpleCache
import com.google.android.exoplayer2.database.StandaloneDatabaseProvider
import java.io.File
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions
import java.net.URISyntaxException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var playerView: StyledPlayerView
    private lateinit var imageView: ImageView
    private lateinit var statusText: TextView

    private var player: ExoPlayer? = null
    private var socket: Socket? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var simpleCache: SimpleCache? = null
    private val pingHandler = Handler(Looper.getMainLooper())
    private var isPlayingPlaceholder: Boolean = false
    
    // Новые компоненты
    private var config: RemoteConfig.Config = RemoteConfig.Config()
    private var watchdog: ConnectionWatchdog? = null
    private var showStatus: Boolean = false
    
    // Для retry при ошибках
    private var errorRetryCount = 0
    private val maxRetryAttempts = 3

    private val TAG = "VCMediaPlayer"
    private var SERVER_URL = ""
    private var DEVICE_ID = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Log.i(TAG, "=== MainActivity onCreate ===")

        // Проверяем настройки при запуске
        if (!SettingsActivity.isConfigured(this)) {
            Log.w(TAG, "Not configured, redirecting to settings")
            // Перенаправляем на настройки
            startActivity(Intent(this, SettingsActivity::class.java))
            finish()
            return
        }

        // Загружаем настройки
        SERVER_URL = SettingsActivity.getServerUrl(this) ?: ""
        DEVICE_ID = SettingsActivity.getDeviceId(this) ?: ""
        showStatus = SettingsActivity.getShowStatus(this)

        Log.i(TAG, "Loaded settings: SERVER_URL=$SERVER_URL, DEVICE_ID=$DEVICE_ID, showStatus=$showStatus")
        
        // Используем дефолтные настройки (без RemoteConfig для стабильности)
        config = RemoteConfig.Config()
        
        setContentView(R.layout.activity_main)

        // Fullscreen и не гасим экран
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )

        playerView = findViewById(R.id.playerView)
        imageView = findViewById(R.id.imageView)
        statusText = findViewById(R.id.statusText)

        // Длинное нажатие на экран - открывает настройки
        playerView.setOnLongClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
            true
        }

        // Скрываем контролы ExoPlayer
        playerView.useController = false

        // Wake Lock для предотвращения suspend
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "VCMediaPlayer::WakeLock"
        )
        wakeLock?.acquire()

        Log.i(TAG, "MainActivity initialized")

        // Инициализируем Watchdog для автоперезапуска при потере связи
        watchdog = ConnectionWatchdog(this, config.maxDisconnectTime.toLong())
        watchdog?.setCheckInterval(config.watchdogInterval.toLong())
        Log.i(TAG, "Watchdog initialized (max disconnect: ${config.maxDisconnectTime}ms)")

        initializePlayer()
        connectSocket()
        
        // КРИТИЧНО: Загружаем заглушку при старте (постоянно показываем заглушку)
        loadPlaceholder()
    }

    private fun initializePlayer() {
        try {
            // Инициализация кэша для больших видео (используем config)
            val cacheDir = File(cacheDir, "video_cache")
            simpleCache = SimpleCache(
                cacheDir,
                LeastRecentlyUsedCacheEvictor(config.cacheSize),
                StandaloneDatabaseProvider(this)
            )

            // Настройки буферизации для тяжелых видео (используем config)
            val loadControl = DefaultLoadControl.Builder()
                .setAllocator(DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE))
                .setBufferDurationsMs(
                    config.bufferMinMs,  // minBufferMs
                    config.bufferMaxMs,  // maxBufferMs
                    2500,   // bufferForPlaybackMs: начать воспроизведение через 2.5 сек
                    5000    // bufferForPlaybackAfterRebufferMs: после паузы - 5 сек
                )
                .setPrioritizeTimeOverSizeThresholds(true)
                .build()

            player = ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .build()
                .also { exoPlayer ->
                    playerView.player = exoPlayer

                    // Обработчик событий
                    exoPlayer.addListener(object : Player.Listener {
                        override fun onPlaybackStateChanged(playbackState: Int) {
                            when (playbackState) {
                                Player.STATE_IDLE -> Log.d(TAG, "Player STATE_IDLE")
                                Player.STATE_BUFFERING -> {
                                    Log.d(TAG, "Player STATE_BUFFERING")
                                    showStatus("Буферизация...")
                                }

                                Player.STATE_READY -> {
                                    Log.d(TAG, "Player STATE_READY")
                                    errorRetryCount = 0  // Сбрасываем счетчик при успешном воспроизведении
                                    hideStatus()
                                }

                                Player.STATE_ENDED -> {
                                    Log.d(TAG, "Player STATE_ENDED")
                                    // КРИТИЧНО: Заглушка зацикливается (ExoPlayer сам перезапустит)
                                    // Обычное видео - показываем заглушку
                                    if (!isPlayingPlaceholder) {
                                        Log.i(TAG, "Контент закончился, возврат на заглушку")
                                        loadPlaceholder()
                                    } else {
                                        Log.d(TAG, "Заглушка зациклена, ExoPlayer перезапустит автоматически")
                                    }
                                }
                            }
                        }

                        override fun onPlayerError(error: com.google.android.exoplayer2.PlaybackException) {
                            Log.e(TAG, "Player error: ${error.message} (attempt $errorRetryCount/$maxRetryAttempts)", error)
                            showStatus("Ошибка воспроизведения, попытка $errorRetryCount...")
                            
                            // Автоматический retry для стабильности 24/7
                            Handler(Looper.getMainLooper()).postDelayed({
                                if (errorRetryCount < maxRetryAttempts) {
                                    errorRetryCount++
                                    Log.i(TAG, "Retrying playback (attempt $errorRetryCount)...")
                                    
                                    try {
                                        player?.prepare()
                                        player?.play()
                                    } catch (e: Exception) {
                                        Log.e(TAG, "Retry failed: ${e.message}", e)
                                    }
                                } else {
                                    Log.e(TAG, "Max retry attempts reached, loading placeholder")
                                    errorRetryCount = 0
                                    loadPlaceholder()
                                }
                            }, 3000) // Ждем 3 секунды перед retry
                        }

                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            Log.d(TAG, "Player isPlaying: $isPlaying")
                        }
                    })
                }

            Log.i(TAG, "ExoPlayer initialized (cache: ${config.cacheSize / 1024 / 1024}MB, buffer: ${config.bufferMinMs}-${config.bufferMaxMs}ms)")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error initializing player", e)
        }
    }

    private fun connectSocket() {
        try {
            val opts = IO.Options().apply {
                reconnection = true
                reconnectionAttempts = Integer.MAX_VALUE
                reconnectionDelay = config.reconnectDelay.toLong()
                timeout = 20000
            }

            socket = IO.socket(SERVER_URL, opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.i(TAG, "✅ Socket connected")
                runOnUiThread {
                    showStatus("Подключено")
                    watchdog?.updateConnectionStatus(true)
                    watchdog?.start()
                    registerDevice()
                    startPingTimer()
                }
            }

            socket?.on(Socket.EVENT_DISCONNECT) { args ->
                val reason = if (args.isNotEmpty()) args[0].toString() else "unknown"
                Log.w(TAG, "⚠️ Socket disconnected: $reason")
                runOnUiThread {
                    showStatus("Отключено")
                    watchdog?.updateConnectionStatus(false)
                    stopPingTimer()
                }
            }
            
            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                val error = if (args.isNotEmpty()) args[0].toString() else "unknown"
                Log.e(TAG, "❌ Socket connect error: $error")
                runOnUiThread {
                    showStatus("Ошибка подключения")
                }
            }
            
            socket?.on("reconnect") { args ->
                val attempt = if (args.isNotEmpty()) args[0].toString() else "?"
                Log.i(TAG, "🔄 Socket reconnected (attempt $attempt)")
            }
            
            socket?.on("reconnect_attempt") { args ->
                val attempt = if (args.isNotEmpty()) args[0].toString() else "?"
                Log.d(TAG, "🔄 Socket reconnection attempt $attempt")
                runOnUiThread {
                    showStatus("Переподключение...")
                }
            }

            socket?.on("player/play") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    runOnUiThread { handlePlay(data) }
                }
            }

            socket?.on("player/pause") {
                runOnUiThread {
                    // КРИТИЧНО: Заглушка НЕ реагирует на паузу
                    if (isPlayingPlaceholder) {
                        Log.d(TAG, "⏸️ Pause игнорируется - играет заглушка")
                        return@runOnUiThread
                    }
                    
                    // КРИТИЧНО: Сохраняем позицию перед паузой
                    savedPosition = player?.currentPosition ?: 0
                    player?.pause()
                    Log.i(TAG, "⏸️ Пауза на позиции: $savedPosition ms")
                }
            }

            socket?.on("player/stop") {
                runOnUiThread {
                    // КРИТИЧНО: Заглушка НЕ реагирует на stop
                    if (isPlayingPlaceholder) {
                        Log.d(TAG, "⏹️ Stop игнорируется - играет заглушка")
                        return@runOnUiThread
                    }
                    
                    player?.stop()
                    Log.i(TAG, "⏹️ Stop - возврат на заглушку")
                    loadPlaceholder()
                }
            }

            socket?.on("player/restart") {
                runOnUiThread {
                    // КРИТИЧНО: Заглушка НЕ реагирует на restart
                    if (isPlayingPlaceholder) {
                        Log.d(TAG, "🔄 Restart игнорируется - играет заглушка")
                        return@runOnUiThread
                    }
                    
                    player?.seekTo(0)
                    player?.play()
                    Log.i(TAG, "🔄 Restart выполнен")
                }
            }

            socket?.on("placeholder/refresh") {
                runOnUiThread { loadPlaceholder() }
            }

            socket?.on("player/pdfPage") { args ->
                if (args.isNotEmpty()) {
                    val page = args[0] as? Int ?: 1
                    runOnUiThread { showPdfPage(null, page) }
                }
            }

            socket?.on("player/pptxPage") { args ->
                if (args.isNotEmpty()) {
                    val page = args[0] as? Int ?: 1
                    runOnUiThread { showPptxSlide(null, page) }
                }
            }

            socket?.connect()
            Log.d(TAG, "Socket connecting to $SERVER_URL")

        } catch (e: URISyntaxException) {
            Log.e(TAG, "Socket connection error", e)
        }
    }

    private fun registerDevice() {
        try {
            val data = JSONObject().apply {
                put("device_id", DEVICE_ID)
                put("device_type", "NATIVE_MEDIAPLAYER")
                put("platform", "Android ${android.os.Build.VERSION.RELEASE}")
                put("model", android.os.Build.MODEL)
                put("manufacturer", android.os.Build.MANUFACTURER)
                put("capabilities", JSONObject().apply {
                    put("video", true)
                    put("audio", true)
                    put("images", true)
                    put("pdf", true)   // ✅ Теперь поддерживаем через конвертированные изображения
                    put("pptx", true)  // ✅ Теперь поддерживаем через конвертированные изображения
                    put("streaming", true)
                })
            }

            socket?.emit("player/register", data)
            Log.i(TAG, "📡 Device registration sent: $DEVICE_ID (${android.os.Build.MODEL})")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error registering device", e)
        }
    }

    private fun handlePlay(data: JSONObject) {
        try {
            val type = data.optString("type")
            val file = data.optString("file")
            val page = data.optInt("page", 1)

            Log.i(TAG, "📡 player/play: type=$type, file=$file, page=$page")

            when (type) {
                "video" -> playVideo(file, isPlaceholder = false)
                "image" -> showImage(file, isPlaceholder = false)
                "pdf" -> showPdfPage(file, page)
                "pptx" -> showPptxSlide(file, page)
                else -> {
                    Log.w(TAG, "Unknown content type: $type")
                    showStatus("Неподдерживаемый тип контента")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling play command", e)
            showStatus("Ошибка воспроизведения")
        }
    }

    private fun playVideo(fileName: String, isPlaceholder: Boolean = false) {
        try {
            val videoUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(fileName)}"
            Log.i(TAG, "🎬 Playing video: $videoUrl (isPlaceholder=$isPlaceholder)")

            imageView.visibility = View.GONE
            playerView.visibility = View.VISIBLE

            // КРИТИЧНО: Проверяем тот же ли файл воспроизводится
            val isSameFile = currentVideoFile == fileName
            
            if (isSameFile && player != null) {
                // Тот же файл - продолжаем с сохраненной позиции
                Log.d(TAG, "⏯️ Тот же файл, продолжаем с позиции: $savedPosition ms")
                player?.apply {
                    seekTo(savedPosition)
                    playWhenReady = true
                    play()
                }
                return
            }
            
            // Новый файл - загружаем с начала
            Log.i(TAG, "🎬 Загрузка НОВОГО видео: $fileName")
            currentVideoFile = fileName
            savedPosition = 0

            // HTTP Data Source с увеличенными таймаутами для больших файлов
            val httpDataSourceFactory = DefaultHttpDataSource.Factory().apply {
                setAllowCrossProtocolRedirects(true)
                setConnectTimeoutMs(60000)   // 60 секунд на подключение
                setReadTimeoutMs(60000)      // 60 секунд на чтение
                setUserAgent("VideoControl/1.0")
            }

            // Data Source с кэшированием
            val cacheDataSourceFactory = if (simpleCache != null) {
                CacheDataSource.Factory()
                    .setCache(simpleCache!!)
                    .setUpstreamDataSourceFactory(DefaultDataSource.Factory(this, httpDataSourceFactory))
                    .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
            } else {
                DefaultDataSource.Factory(this, httpDataSourceFactory)
            }

            val mediaItem = MediaItem.fromUri(videoUrl)
            val mediaSource = ProgressiveMediaSource.Factory(cacheDataSourceFactory)
                .createMediaSource(mediaItem)

            player?.apply {
                setMediaSource(mediaSource)
                // КРИТИЧНО: Заглушка зацикливается, контент - нет
                repeatMode = if (isPlaceholder) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
                prepare()
                playWhenReady = true
            }
            
            // Отмечаем тип контента
            isPlayingPlaceholder = isPlaceholder
            
            Log.i(TAG, "✅ Video prepared: isPlaceholder=$isPlaceholder, loop=$isPlaceholder")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error playing video: $fileName", e)
            showStatus("Ошибка загрузки видео")
        }
    }

    private var currentPdfFile: String? = null
    private var currentPdfPage: Int = 1
    private var currentPptxFile: String? = null
    private var currentPptxSlide: Int = 1
    private var currentVideoFile: String? = null
    private var savedPosition: Long = 0

    private fun showImage(fileName: String, isPlaceholder: Boolean = false) {
        try {
            val imageUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(fileName)}"
            Log.i(TAG, "🖼️ Showing image: $imageUrl (isPlaceholder=$isPlaceholder)")

            // Останавливаем видео если играет
            player?.pause()

            playerView.visibility = View.GONE
            imageView.visibility = View.VISIBLE

            // Отмечаем тип контента
            isPlayingPlaceholder = isPlaceholder

            // Загружаем изображение
            loadImageToView(imageUrl)
            
            Log.i(TAG, "✅ Image shown: isPlaceholder=$isPlaceholder")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error showing image: $fileName", e)
            showStatus("Ошибка загрузки изображения")
        }
    }

    private fun showPdfPage(fileName: String?, page: Int) {
        try {
            val file = fileName ?: currentPdfFile
            if (file == null) {
                Log.w(TAG, "⚠️ PDF file name is null")
                return
            }

            currentPdfFile = file
            currentPdfPage = page
            
            // Презентация - НЕ заглушка, при stop вернемся на заглушку
            isPlayingPlaceholder = false

            val pageUrl = "$SERVER_URL/api/devices/$DEVICE_ID/converted/${Uri.encode(file)}/page/$page"
            Log.i(TAG, "📄 Showing PDF page: $pageUrl (page $page)")

            playerView.visibility = View.GONE
            imageView.visibility = View.VISIBLE

            // Загружаем изображение страницы
            loadImageToView(pageUrl)
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error showing PDF page", e)
            showStatus("Ошибка загрузки PDF")
        }
    }

    private fun showPptxSlide(fileName: String?, slide: Int) {
        try {
            val file = fileName ?: currentPptxFile
            if (file == null) {
                Log.w(TAG, "⚠️ PPTX file name is null")
                return
            }

            currentPptxFile = file
            currentPptxSlide = slide
            
            // Презентация - НЕ заглушка, при stop вернемся на заглушку
            isPlayingPlaceholder = false

            val slideUrl = "$SERVER_URL/api/devices/$DEVICE_ID/converted/${Uri.encode(file)}/slide/$slide"
            Log.i(TAG, "📊 Showing PPTX slide: $slideUrl (slide $slide)")

            playerView.visibility = View.GONE
            imageView.visibility = View.VISIBLE

            // Загружаем изображение слайда
            loadImageToView(slideUrl)
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error showing PPTX slide", e)
            showStatus("Ошибка загрузки PPTX")
        }
    }

    private fun loadImageToView(imageUrl: String) {
        try {
            // Glide для плавной загрузки изображений с кэшем и crossfade
            Log.d(TAG, "🖼️ Loading image with Glide: $imageUrl")
            
            Glide.with(this)
                .load(imageUrl)
                .diskCacheStrategy(DiskCacheStrategy.ALL)  // Кэш на диск
                .transition(DrawableTransitionOptions.withCrossFade(300))  // Плавный переход 300ms
                .timeout(30000)  // Таймаут 30 сек
                .error(android.R.drawable.ic_dialog_alert)  // Показываем иконку при ошибке
                .into(imageView)
            
            Log.d(TAG, "✅ Glide started loading image")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error loading image with Glide", e)
            showStatus("Ошибка загрузки изображения")
        }
    }

    private fun loadPlaceholder() {
        Log.i(TAG, "🔍 Loading placeholder...")
        
        // Останавливаем текущее воспроизведение
        player?.stop()
        
        // КРИТИЧНО: Скрываем imageView сразу (для изображений)
        imageView.visibility = View.GONE
        playerView.visibility = View.GONE
        
        // Запрашиваем заглушку с сервера
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = java.net.URL("$SERVER_URL/api/devices/$DEVICE_ID/placeholder")
                val connection = url.openConnection() as java.net.HttpURLConnection
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.requestMethod = "GET"
                
                if (connection.responseCode == 200) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(response)
                    val placeholderFile = json.optString("placeholder", null)
                    
                    if (placeholderFile != null && placeholderFile != "null") {
                        Log.i(TAG, "✅ Placeholder found: $placeholderFile")
                        
                        // Определяем тип заглушки (видео или изображение)
                        val ext = placeholderFile.substringAfterLast('.', "").toLowerCase()
                        
                        withContext(Dispatchers.Main) {
                            when {
                                ext in listOf("mp4", "webm", "ogg", "mkv", "mov", "avi") -> {
                                    // КРИТИЧНО: Заглушка-видео с loop
                                    playVideo(placeholderFile, isPlaceholder = true)
                                }
                                ext in listOf("png", "jpg", "jpeg", "gif", "webp") -> {
                                    // КРИТИЧНО: Заглушка-изображение
                                    showImage(placeholderFile, isPlaceholder = true)
                                }
                                else -> {
                                    Log.w(TAG, "⚠️ Unknown placeholder type: $ext")
                                }
                            }
                        }
                    } else {
                        Log.i(TAG, "ℹ️ No placeholder set for this device")
                        withContext(Dispatchers.Main) {
                            // Показываем черный экран
                            playerView.visibility = View.GONE
                            imageView.visibility = View.GONE
                        }
                    }
                } else {
                    Log.e(TAG, "❌ Failed to load placeholder: HTTP ${connection.responseCode}")
                }
                connection.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error loading placeholder", e)
            }
        }
    }

    private fun showStatus(message: String) {
        if (showStatus) {
            statusText.text = message
            statusText.visibility = View.VISIBLE
        }
        Log.d(TAG, "Status: $message")
    }

    private fun hideStatus() {
        if (showStatus) {
            statusText.visibility = View.GONE
        }
    }

    private val pingRunnable = object : Runnable {
        override fun run() {
            socket?.emit("player/ping")
            Log.d(TAG, "🏓 Ping sent")
            
            // Планируем следующий ping
            val interval = config.pingInterval.toLong()
            pingHandler.postDelayed(this, interval)
        }
    }
    
    private fun startPingTimer() {
        stopPingTimer() // Останавливаем предыдущий таймер если был
        
        val interval = config.pingInterval.toLong()
        pingHandler.postDelayed(pingRunnable, interval) // Первый ping через interval
        
        Log.i(TAG, "✅ Ping timer started (interval: ${interval}ms)")
    }
    
    private fun stopPingTimer() {
        pingHandler.removeCallbacks(pingRunnable)
        Log.d(TAG, "⏹️ Ping timer stopped")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "=== MainActivity onDestroy ===")
        
        stopPingTimer()
        watchdog?.stop()
        player?.release()
        socket?.disconnect()
        wakeLock?.release()
        simpleCache?.release()
        
        Log.i(TAG, "MainActivity destroyed")
    }

    override fun onPause() {
        super.onPause()
        // НЕ паузим плеер для стабильности 24/7
        // Управление pause/play только через команды от сервера!
        Log.d(TAG, "onPause called, player continues running")
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume called")
        
        // Восстанавливаем воспроизведение если остановилось
        if (player?.isPlaying == false) {
            Log.i(TAG, "Player not playing in onResume, restoring...")
            if (isPlayingPlaceholder) {
                // Заглушка должна всегда играть
                player?.play()
            } else {
                // Если контент остановился - возвращаемся на заглушку
                loadPlaceholder()
            }
        }
    }
    
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        
        // Очищаем память Glide при нехватке памяти (для стабильности 24/7)
        if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            Log.w(TAG, "Low memory detected (level $level), clearing Glide cache")
            try {
                Glide.get(this).clearMemory()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear Glide memory: ${e.message}")
            }
        }
    }
}

