package com.videocontrol.mediaplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver для автозапуска приложения при включении устройства
 */
class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || 
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            Log.d(TAG, "📱 Boot completed detected: ${intent.action}")
            
            // Проверяем что настройки заполнены
            if (SettingsActivity.isConfigured(context)) {
                Log.d(TAG, "✅ Configuration found, launching MainActivity")
                
                // Запускаем MainActivity
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
                
                context.startActivity(launchIntent)
                Log.d(TAG, "🚀 MainActivity launched successfully")
            } else {
                Log.d(TAG, "⚠️ Configuration not found, skipping auto-start")
                Log.d(TAG, "ℹ️ User needs to configure app first")
            }
        }
    }
}

