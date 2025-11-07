package com.videocontrol.mediaplayer

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
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URISyntaxException

class MainActivity : AppCompatActivity() {
    
    private lateinit var playerView: StyledPlayerView
    private lateinit var imageView: ImageView
    private lateinit var statusText: TextView
    private lateinit var settingsButton: android.widget.Button
    
    private var player: ExoPlayer? = null
    private var socket: Socket? = null
    private var wakeLock: PowerManager.WakeLock? = null
    
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
        player = ExoPlayer.Builder(this)
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
                                // Показываем заглушку
                                loadPlaceholder()
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
                runOnUiThread { player?.pause() }
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
                put("pdf", false)
                put("pptx", false)
                put("streaming", true)
            })
        }
        
        socket?.emit("player/register", data)
        Log.d(TAG, "📡 Device registration sent: $DEVICE_ID")
    }
    
    private fun handlePlay(data: JSONObject) {
        val type = data.optString("type")
        val file = data.optString("file")
        
        Log.d(TAG, "📡 player/play: type=$type, file=$file")
        
        when (type) {
            "video" -> playVideo(file)
            "image" -> showImage(file)
            else -> Log.w(TAG, "Unknown type: $type")
        }
    }
    
    private fun playVideo(fileName: String) {
        val videoUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(fileName)}"
        Log.d(TAG, "🎬 Playing video: $videoUrl")
        
        imageView.visibility = View.GONE
        playerView.visibility = View.VISIBLE
        
        // КРИТИЧНО: DefaultHttpDataSource для лучшей буферизации
        val dataSourceFactory = DefaultDataSource.Factory(this,
            DefaultHttpDataSource.Factory().apply {
                setAllowCrossProtocolRedirects(true)
                setConnectTimeoutMs(30000)
                setReadTimeoutMs(30000)
            }
        )
        
        val mediaItem = MediaItem.fromUri(videoUrl)
        val mediaSource = ProgressiveMediaSource.Factory(dataSourceFactory)
            .createMediaSource(mediaItem)
        
        player?.apply {
            setMediaSource(mediaSource)
            prepare()
            playWhenReady = true
        }
    }
    
    private fun showImage(fileName: String) {
        val imageUrl = "$SERVER_URL/content/$DEVICE_ID/${Uri.encode(fileName)}"
        Log.d(TAG, "🖼️ Showing image: $imageUrl")
        
        playerView.visibility = View.GONE
        imageView.visibility = View.VISIBLE
        
        // TODO: Загрузка изображения через Glide/Picasso
        // Сейчас просто показываем placeholder
    }
    
    private fun loadPlaceholder() {
        Log.d(TAG, "🔍 Loading placeholder...")
        // TODO: Запрос к API для получения заглушки
        // Пока просто останавливаем видео
        player?.stop()
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

