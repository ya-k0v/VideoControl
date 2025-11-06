package com.videocontrol.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import android.util.Log

class MainActivity : AppCompatActivity() {
    
    private var webView: WebView? = null
    private var config: ConfigManager? = null
    
    companion object {
        private const val TAG = "VideoControl"
    }
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        Log.i(TAG, "MainActivity onCreate")
        
        try {
            // Initialize config
            config = ConfigManager(this)
            
            // Check if configuration exists
            if (config?.isConfigured() != true) {
                Log.i(TAG, "Configuration not found, redirecting to setup")
                val intent = Intent(this, SetupActivity::class.java)
                startActivity(intent)
                finish()
                return
            }
            
            // Setup fullscreen
            setupFullscreen()
            
            // Keep screen on
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            // Redirect to setup on any error
            val intent = Intent(this, SetupActivity::class.java)
            startActivity(intent)
            finish()
            return
        }
        
        // Create and configure WebView
        webView = WebView(this).apply {
            // КРИТИЧНО: Черный фон WebView для избежания белых вспышек
            setBackgroundColor(android.graphics.Color.BLACK)
            
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                
                // CRITICAL: Allow autoplay without user gesture
                mediaPlaybackRequiresUserGesture = false
                
                // Enable modern web features
                @Suppress("DEPRECATION")
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
                
                // Performance
                @Suppress("DEPRECATION")
                setRenderPriority(WebSettings.RenderPriority.HIGH)
                
                // Enable hardware acceleration
                setLayerType(View.LAYER_TYPE_HARDWARE, null)
                
                // КРИТИЧНО: Отключаем встроенные медиа контролы полностью
                useWideViewPort = true
                loadWithOverviewMode = true
                builtInZoomControls = false
                displayZoomControls = false
                
                // User agent (optional)
                userAgentString = "${userAgentString} VideoControlTV/1.0 Android"
            }
            
            // КРИТИЧНО: Отключаем долгое нажатие и контекстное меню
            setOnLongClickListener { true }
            isLongClickable = false
            isHapticFeedbackEnabled = false
            
            // Handle permissions
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    // Auto-grant all media permissions
                    runOnUiThread {
                        Log.d(TAG, "Permission request: ${request.resources.joinToString()}")
                        request.grant(request.resources)
                    }
                }
                
                override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                    Log.d(TAG, "[WebView] ${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})")
                    return true
                }
                
                // КРИТИЧНО: Скрываем встроенные медиа контролы Android
                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    // Отключаем fullscreen overlay контролы
                    super.onShowCustomView(view, callback)
                }
                
                override fun onHideCustomView() {
                    // Отключаем fullscreen overlay контролы
                    super.onHideCustomView()
                }
            }
            
            // Handle navigation
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    // Allow all navigation within the app
                    return false
                }
                
                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    Log.d(TAG, "Page loading: $url")
                    
                    // КРИТИЧНО: Гарантируем черный фон во время загрузки
                    view?.setBackgroundColor(android.graphics.Color.BLACK)
                }
                
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    Log.i(TAG, "Page loaded: $url")
                    
                    // КРИТИЧНО: Убеждаемся что фон черный после загрузки
                    view?.setBackgroundColor(android.graphics.Color.BLACK)
                    
                    // КРИТИЧНО: Минимальная инъекция для включения звука и скрытия unmute кнопки
                    view?.evaluateJavascript("""
                        (function() {
                            console.log('[Android] Initializing VCPlayer...');
                            
                            // Принудительно включаем звук в localStorage
                            try { 
                                localStorage.setItem('vc_sound', '1'); 
                                console.log('[Android] ✅ Sound enabled in localStorage');
                            } catch(e) {
                                console.warn('[Android] ⚠️ Cannot set localStorage:', e);
                            }
                            
                            // Скрываем unmute кнопку (если есть)
                            const unmuteBtn = document.getElementById('unmute');
                            if (unmuteBtn) {
                                unmuteBtn.style.display = 'none';
                                console.log('[Android] ✅ Unmute button hidden');
                            }
                            
                            // Инъекция CSS ТОЛЬКО для скрытия Android WebView контролов
                            const style = document.createElement('style');
                            style.id = 'android-media-controls-fix';
                            style.textContent = `
                                /* Убираем встроенные Android WebView контролы */
                                video::-webkit-media-controls { display: none !important; }
                                video::-webkit-media-controls-enclosure { display: none !important; }
                                video::-webkit-media-controls-panel { display: none !important; }
                                video::-webkit-media-controls-play-button { display: none !important; }
                                video::-webkit-media-controls-overlay-play-button { display: none !important; }
                                
                                /* Скрываем все остальные оверлеи */
                                .vjs-big-play-button { opacity: 0 !important; visibility: hidden !important; display: none !important; }
                                .vjs-control-bar { opacity: 0 !important; visibility: hidden !important; display: none !important; }
                            `;
                            
                            // Проверяем что стиль еще не добавлен
                            if (!document.getElementById('android-media-controls-fix')) {
                                document.head.appendChild(style);
                                console.log('[Android] ✅ Media controls CSS injected');
                            }
                            
                            console.log('[Android] ✅ Initialization complete');
                        })();
                    """.trimIndent(), null)
                }
                
                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    super.onReceivedError(view, request, error)
                    Log.e(TAG, "WebView error: ${error.description}")
                    
                    // Retry after 5 seconds
                    view.postDelayed({
                        Log.i(TAG, "Retrying page load...")
                        view.reload()
                    }, 5000)
                }
                
                override fun onReceivedHttpError(
                    view: WebView,
                    request: WebResourceRequest,
                    errorResponse: WebResourceResponse
                ) {
                    super.onReceivedHttpError(view, request, errorResponse)
                    Log.e(TAG, "HTTP error: ${errorResponse.statusCode} for ${request.url}")
                }
            }
            
            // Load player URL
            val playerUrl = buildPlayerUrl()
            Log.i(TAG, "Loading player: $playerUrl")
            loadUrl(playerUrl)
        }
        
        webView?.let { setContentView(it) }
        
        // Start watchdog service (disabled for now to prevent crashes)
        // WatchdogService.start(this)
    }
    
    private fun setupFullscreen() {
        // Hide status bar and navigation
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
        
        actionBar?.hide()
        supportActionBar?.hide()
    }
    
    private fun buildPlayerUrl(): String {
        val serverUrl = config?.getServerUrl() ?: "http://192.168.1.100"
        val deviceId = config?.getDeviceId() ?: "unknown"
        // player-videojs.html - стабильная версия с Video.js
        // autoplay=1 - автовключение звука, sound=1 - явное включение звука
        return "$serverUrl/player-videojs.html?device_id=$deviceId&autoplay=1&sound=1"
    }
    
    override fun onResume() {
        super.onResume()
        webView?.onResume()
        webView?.resumeTimers()
        Log.d(TAG, "MainActivity onResume")
    }
    
    override fun onPause() {
        super.onPause()
        webView?.onPause()
        webView?.pauseTimers()
        Log.d(TAG, "MainActivity onPause")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        webView?.destroy()
        Log.d(TAG, "MainActivity onDestroy")
    }
    
    override fun onBackPressed() {
        // Disable back button in kiosk mode
        Log.d(TAG, "Back button pressed (ignored in kiosk mode)")
        // Do nothing - prevent exiting
    }
    
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            setupFullscreen()
        }
    }
}

