package com.videocontrol.tv

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Watchdog service для мониторинга и автоматического перезапуска плеера
 */
class WatchdogService : Service() {
    
    companion object {
        private const val TAG = "VideoControl.Watchdog"
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "videocontrol_watchdog"
        private const val CHECK_INTERVAL_MS = 30000L // 30 seconds
        
        fun start(context: Context) {
            val intent = Intent(context, WatchdogService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
    
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false
    
    private val watchdogRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            
            checkAndRestartPlayer()
            
            // Schedule next check
            handler.postDelayed(this, CHECK_INTERVAL_MS)
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Watchdog service created")
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "Watchdog service started")
        
        if (!isRunning) {
            isRunning = true
            handler.post(watchdogRunnable)
        }
        
        return START_STICKY // Auto-restart service if killed
    }
    
    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        handler.removeCallbacks(watchdogRunnable)
        Log.i(TAG, "Watchdog service destroyed")
    }
    
    private fun checkAndRestartPlayer() {
        try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            
            @Suppress("DEPRECATION")
            val tasks = activityManager.getRunningTasks(1)
            
            if (tasks.isEmpty()) {
                Log.w(TAG, "No running tasks, restarting player...")
                restartPlayer()
                return
            }
            
            val topActivity = tasks[0].topActivity
            if (topActivity?.className != MainActivity::class.java.name) {
                Log.w(TAG, "MainActivity is not in foreground, restarting...")
                restartPlayer()
            } else {
                Log.d(TAG, "Player is running normally")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error checking player status", e)
        }
    }
    
    private fun restartPlayer() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            
            startActivity(intent)
            Log.i(TAG, "Player restarted")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to restart player", e)
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Video Control Watchdog",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors and restarts video player"
                setShowBadge(false)
            }
            
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created")
        }
    }
    
    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Video Control Player")
            .setContentText("Running in background...")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setShowWhen(false)
            .build()
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
}

