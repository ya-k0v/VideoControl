package com.videocontrol.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Boot receiver для автозапуска плеера при включении устройства
 */
class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "VideoControl.Boot"
        private const val BOOT_DELAY_MS = 10000L // 10 seconds delay after boot
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                Log.i(TAG, "Boot completed, scheduling player start...")
                
                // Wait for system to stabilize before starting
                Handler(Looper.getMainLooper()).postDelayed({
                    startPlayer(context)
                }, BOOT_DELAY_MS)
            }
        }
    }
    
    private fun startPlayer(context: Context) {
        try {
            val intent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            
            context.startActivity(intent)
            Log.i(TAG, "Player started successfully")
            
            // Start watchdog service
            WatchdogService.start(context)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start player", e)
        }
    }
}

