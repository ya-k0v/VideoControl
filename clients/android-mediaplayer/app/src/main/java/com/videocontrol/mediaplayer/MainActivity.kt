package com.videocontrol.mediaplayer

import android.content.Intent
import android.net.Uri
import android.os.Bundle
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
import java.net.URISyntaxException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var playerView: StyledPlayerView
    private lateinit var imageView: ImageView
    private lateinit var statusText: TextView
    private lateinit var settingsButton: android.widget.Button

    private var player: ExoPlayer? = null
    private var socket: Socket? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var simpleCache: SimpleCache? = null

    private val TAG = "VCMediaPlayer"
    private var SERVER_URL = ""
    private var DEVICE_ID = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Проверяем настройки при запуске
        if (!SettingsActivity.isConfigured(this)) {
            // Перенаправляем на настройки
            startActivity(Intent(this, SettingsActivity::class.java))
            finish()
            return
        }

        // Загружаем настройки
        SERVER_URL = SettingsActivity.getServerUrl(this) ?: ""
        DEVICE_ID = SettingsActivity.getDeviceId(this) ?: ""

        Log.d(TAG, "Loaded settings: SERVER_URL=$SERVER_URL, DEVICE_ID=$DEVICE_ID")
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
        settingsButton = findViewById(R.id.settingsButton)

        // Кнопка настроек - открывает SettingsActivity
        settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // Длинное нажатие на экран - тоже открывает настройки
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

        Log.d(TAG, "MainActivity onCreate")

        initializePlayer()
        connectSocket()
    }

    private fun initializePlayer() {
        // Инициализация кэша для больших видео (500 MB)
        val cacheDir = File(cacheDir, "video_cache")
        simpleCache = SimpleCache(
            cacheDir,
            LeastRecentlyUsedCacheEvictor(500 * 1024 * 1024), // 500 MB кэш
            StandaloneDatabaseProvider(this)
        )

        // Настройки буферизации для тяжелых видео
        val loadControl = DefaultLoadControl.Builder()
            .setAllocator(DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE))
            .setBufferDurationsMs(
                50000,  // minBufferMs: минимум 50 секунд буфера
                120000, // maxBufferMs: максимум 2 минуты буфера
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
                                hideStatus()
                            }

                            Player.STATE_ENDED -> {
                                Log.d(TAG, "Player STATE_ENDED")
                                // КРИТИЧНО: Проверяем repeatMode перед показом placeholder
                                if (exoPlayer.repeatMode != Player.REPEAT_MODE_ONE && 
                                    exoPlayer.repeatMode != Player.REPEAT_MODE_ALL) {
                                    Log.d(TAG, "Видео закончилось, показываем заглушку")
                                    loadPlaceholder()
                                } else {
                                    Log.d(TAG, "Loop режим, видео начнется сначала автоматически")
                                }
                            }
                        }
                    }

                    override fun onPlayerError(error: com.google.android.exoplayer2.PlaybackException) {
                        Log.e(TAG, "Player error: ${error.message}", error)
                        showStatus("Ошибка воспроизведения")
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        Log.d(TAG, "Player isPlaying: $isPlaying")
                    }
                })
            }

        Log.d(TAG, "ExoPlayer initialized")
    }

    private fun connectSocket() {
        try {
            val opts = IO.Options().apply {
                reconnection = true
                reconnectionAttempts = Integer.MAX_VALUE
                reconnectionDelay = 2000
                timeout = 20000
            }

            socket = IO.socket(SERVER_URL, opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "✅ Socket connected")
                runOnUiThread {
                    showStatus("Подключено")
                    registerDevice()
                }
            }

            socket?.on(Socket.EVENT_DISCONNECT) { args ->
                val reason = if (args.isNotEmpty()) args[0].toString() else "unknown"
                Log.w(TAG, "⚠️ Socket disconnected: $reason")
                runOnUiThread { showStatus("Отключено") }
            }

            socket?.on("player/play") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as JSONObject
                    runOnUiThread { handlePlay(data) }
                }
            }

            socket?.on("player/pause") {
                runOnUiThread {
                    // КРИТИЧНО: Сохраняем позицию перед паузой
                    savedPosition = player?.currentPosition ?: 0
                    player?.pause()
                    Log.d(TAG, "⏸️ Пауза на позиции: $savedPosition ms")
                }
            }

            socket?.on("player/stop") {
                runOnUiThread {
                    player?.stop()
                    loadPlaceholder()
                }
            }

            socket?.on("player/restart") {
                runOnUiThread {
                    player?.seekTo(0)
                    player?.play()
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
        val data = JSONObject().apply {
            put("device_id", DEVICE_ID)
            put("device_type", "NATIVE_MEDIAPLAYER")
            put("platform", "Android ${android.os.Build.VERSION.RELEASE}")
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
        Log.d(TAG, "📡 Device registration sent: $DEVICE_ID")
    }

    private fun handlePlay(data: JSONObject) {
        val type = data.optString("type")
        val file = data.optString("file")
        val page = data.optInt("page", 1)

        Log.d(TAG, "📡 player/play: type=$type, file=$file, page=$page")

        when (type) {
            "video" -> playVideo(file)
            "image" -> showImage(file)
            "pdf" -> showPdfPage(file, page)
            "pptx" -> showPptxSlide(file, page)
            else -> Log.w(TAG, "Unknown type: $type")
        }
    }

    private fun playVideo(fileName: String) {
        val videoUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(fileName)}"
        Log.d(TAG, "🎬 Playing video: $videoUrl")

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
        Log.d(TAG, "🎬 Загрузка НОВОГО видео: $fileName")
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
            // КРИТИЧНО: Зацикливание для обычных видео (не placeholder)
            repeatMode = Player.REPEAT_MODE_ONE
            prepare()
            playWhenReady = true
        }
        
        Log.d(TAG, "✅ Video prepared with loop mode and buffering")
    }

    private var currentPdfFile: String? = null
    private var currentPdfPage: Int = 1
    private var currentPptxFile: String? = null
    private var currentPptxSlide: Int = 1
    private var currentVideoFile: String? = null
    private var savedPosition: Long = 0

    private fun showImage(fileName: String) {
        val imageUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(fileName)}"
        Log.d(TAG, "🖼️ Showing image: $imageUrl")

        // Останавливаем видео если играет
        player?.pause()

        playerView.visibility = View.GONE
        imageView.visibility = View.VISIBLE

        // Загружаем изображение
        loadImageToView(imageUrl)
    }

    private fun showPdfPage(fileName: String?, page: Int) {
        val file = fileName ?: currentPdfFile
        if (file == null) {
            Log.w(TAG, "⚠️ PDF file name is null")
            return
        }

        currentPdfFile = file
        currentPdfPage = page

        val pageUrl = "$SERVER_URL/api/devices/$DEVICE_ID/converted/${Uri.encode(file)}/page/$page"
        Log.d(TAG, "📄 Showing PDF page: $pageUrl (page $page)")

        playerView.visibility = View.GONE
        imageView.visibility = View.VISIBLE

        // Загружаем изображение страницы
        loadImageToView(pageUrl)
    }

    private fun showPptxSlide(fileName: String?, slide: Int) {
        val file = fileName ?: currentPptxFile
        if (file == null) {
            Log.w(TAG, "⚠️ PPTX file name is null")
            return
        }

        currentPptxFile = file
        currentPptxSlide = slide

        val slideUrl = "$SERVER_URL/api/devices/$DEVICE_ID/converted/${Uri.encode(file)}/slide/$slide"
        Log.d(TAG, "📊 Showing PPTX slide: $slideUrl (slide $slide)")

        playerView.visibility = View.GONE
        imageView.visibility = View.VISIBLE

        // Загружаем изображение слайда
        loadImageToView(slideUrl)
    }

    private fun loadImageToView(imageUrl: String) {
        // Простая загрузка через корутины
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val connection = java.net.URL(imageUrl).openConnection() as java.net.HttpURLConnection
                connection.connectTimeout = 30000
                connection.readTimeout = 30000
                connection.connect()

                if (connection.responseCode == 200) {
                    val bitmap = android.graphics.BitmapFactory.decodeStream(connection.inputStream)
                    withContext(Dispatchers.Main) {
                        imageView.setImageBitmap(bitmap)
                        Log.d(TAG, "✅ Image loaded successfully")
                    }
                } else {
                    Log.e(TAG, "❌ Failed to load image: HTTP ${connection.responseCode}")
                }
                connection.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error loading image: ${e.message}", e)
            }
        }
    }

    private fun loadPlaceholder() {
        Log.d(TAG, "🔍 Loading placeholder...")
        
        // Останавливаем текущее воспроизведение
        player?.stop()
        
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
                        Log.d(TAG, "✅ Placeholder found: $placeholderFile")
                        
                        // Определяем тип заглушки (видео или изображение)
                        val ext = placeholderFile.substringAfterLast('.', "").toLowerCase()
                        
                        withContext(Dispatchers.Main) {
                            when {
                                ext in listOf("mp4", "webm", "ogg", "mkv", "mov", "avi") -> {
                                    playVideo(placeholderFile)
                                }
                                ext in listOf("png", "jpg", "jpeg", "gif", "webp") -> {
                                    val imageUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(placeholderFile)}"
                                    loadImageToView(imageUrl)
                                }
                                else -> {
                                    Log.w(TAG, "⚠️ Unknown placeholder type: $ext")
                                }
                            }
                        }
                    } else {
                        Log.d(TAG, "ℹ️ No placeholder set for this device")
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
                Log.e(TAG, "❌ Error loading placeholder: ${e.message}", e)
            }
        }
    }

    private fun showStatus(message: String) {
        statusText.text = message
        statusText.visibility = View.VISIBLE
    }

    private fun hideStatus() {
        statusText.visibility = View.GONE
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        socket?.disconnect()
        wakeLock?.release()
        simpleCache?.release()
        Log.d(TAG, "MainActivity onDestroy")
    }

    override fun onPause() {
        super.onPause()
        player?.pause()
    }

    override fun onResume() {
        super.onResume()
        // Не auto-play при resume
    }
}

