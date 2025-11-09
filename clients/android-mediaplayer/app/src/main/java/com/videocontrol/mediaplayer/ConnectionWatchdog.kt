package com.videocontrol.mediaplayer

import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.*

/**
 * Watchdog для автоперезапуска при потере связи
 */
class ConnectionWatchdog(
    private val context: Context,
    private val maxDisconnectTime: Long = 180000 // 3 минуты
) {
    
    private val TAG = "Watchdog"
    private var timer: Timer? = null
    private var lastConnectedTime: Long = System.currentTimeMillis()
    private var isConnected: Boolean = false
    private var checkInterval: Long = 60000 // Проверка каждую минуту
    
    // Callback для проверки идет ли воспроизведение контента
    private var isPlayingContentCallback: (() -> Boolean)? = null
    
    /**
     * Запустить watchdog
     */
    fun start() {
        stop() // Останавливаем предыдущий таймер если был
        
        lastConnectedTime = System.currentTimeMillis()
        isConnected = false
        
        timer = Timer().apply {
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    checkConnection()
                }
            }, checkInterval, checkInterval)
        }
        
        Log.i(TAG, "Watchdog started (max disconnect time: ${maxDisconnectTime}ms)")
    }
    
    /**
     * Остановить watchdog
     */
    fun stop() {
        timer?.cancel()
        timer = null
        Log.i(TAG, "Watchdog stopped")
    }
    
    /**
     * Обновить статус подключения
     */
    fun updateConnectionStatus(connected: Boolean) {
        val wasConnected = isConnected
        isConnected = connected
        
        if (connected) {
            lastConnectedTime = System.currentTimeMillis()
            
            if (!wasConnected) {
                Log.i(TAG, "Connection restored")
            }
        } else {
            if (wasConnected) {
                Log.w(TAG, "Connection lost")
            }
        }
    }
    
    /**
     * Установить callback для проверки воспроизведения контента
     */
    fun setContentPlayingCallback(callback: () -> Boolean) {
        isPlayingContentCallback = callback
    }
    
    /**
     * Проверить подключение
     */
    private fun checkConnection() {
        if (!isConnected) {
            val disconnectDuration = System.currentTimeMillis() - lastConnectedTime
            
            Log.w(TAG, "Disconnected for ${disconnectDuration}ms (max: ${maxDisconnectTime}ms)")
            
            if (disconnectDuration > maxDisconnectTime) {
                // КРИТИЧНО: Не перезапускаем если играет контент (не заглушка)!
                val isPlayingContent = isPlayingContentCallback?.invoke() ?: false
                
                if (isPlayingContent) {
                    Log.w(TAG, "Connection lost but content is playing - NOT restarting, waiting for connection...")
                    // Не перезапускаем, ждем восстановления связи
                } else {
                    Log.e(TAG, "Connection lost for too long, restarting app...")
                    restartApp()
                }
            }
        }
    }
    
    /**
     * Перезапустить приложение
     */
    private fun restartApp() {
        try {
            Log.e(TAG, "🔄 Restarting MainActivity due to connection timeout")
            
            // Перезапускаем MainActivity
            val intent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)
            }
            
            context.startActivity(intent)
            
            // Завершаем текущий процесс
            android.os.Process.killProcess(android.os.Process.myPid())
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to restart app", e)
        }
    }
    
    /**
     * Установить интервал проверки
     */
    fun setCheckInterval(interval: Long) {
        checkInterval = interval
        
        // Перезапускаем если уже запущен
        if (timer != null) {
            start()
        }
    }
}

