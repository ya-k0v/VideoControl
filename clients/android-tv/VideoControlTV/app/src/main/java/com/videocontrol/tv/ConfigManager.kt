package com.videocontrol.tv

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Менеджер конфигурации приложения
 */
class ConfigManager(private val context: Context) {
    
    companion object {
        private const val TAG = "VideoControl.Config"
        private const val PREFS_NAME = "videocontrol"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_DEVICE_ID = "device_id"
        
        // Default server URL - change in build.gradle
        private const val DEFAULT_SERVER = "http://192.168.1.100"
    }
    
    private val prefs: SharedPreferences = 
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    /**
     * Получить URL сервера
     */
    fun getServerUrl(): String {
        val serverUrl = prefs.getString(KEY_SERVER_URL, null) ?: getDefaultServerUrl()
        Log.d(TAG, "Server URL: $serverUrl")
        return serverUrl
    }
    
    /**
     * Сохранить URL сервера
     */
    fun saveServerUrl(url: String) {
        prefs.edit().putString(KEY_SERVER_URL, url).apply()
        Log.i(TAG, "Server URL saved: $url")
    }
    
    /**
     * Установить URL сервера (alias для saveServerUrl)
     */
    fun setServerUrl(url: String) {
        saveServerUrl(url)
    }
    
    /**
     * Получить ID устройства
     */
    fun getDeviceId(): String {
        val deviceId = prefs.getString(KEY_DEVICE_ID, null) ?: ""
        Log.d(TAG, "Device ID: $deviceId")
        return deviceId
    }
    
    /**
     * Сохранить ID устройства
     */
    fun saveDeviceId(deviceId: String) {
        prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        Log.i(TAG, "Device ID saved: $deviceId")
    }
    
    /**
     * Установить ID устройства (alias для saveDeviceId)
     */
    fun setDeviceId(deviceId: String) {
        saveDeviceId(deviceId)
    }
    
    /**
     * Проверить, настроено ли приложение
     */
    fun isConfigured(): Boolean {
        val serverUrl = prefs.getString(KEY_SERVER_URL, null)
        val deviceId = prefs.getString(KEY_DEVICE_ID, null)
        val configured = !serverUrl.isNullOrEmpty() && !deviceId.isNullOrEmpty()
        Log.d(TAG, "Is configured: $configured")
        return configured
    }
    
    /**
     * Сбросить настройки к defaults
     */
    fun reset() {
        prefs.edit().clear().apply()
        Log.i(TAG, "Configuration reset")
    }
    
    /**
     * Получить default server URL из BuildConfig или константы
     */
    private fun getDefaultServerUrl(): String {
        return try {
            // Try to get from BuildConfig (set in build.gradle)
            val buildConfigClass = Class.forName("${context.packageName}.BuildConfig")
            val field = buildConfigClass.getField("DEFAULT_SERVER_URL")
            field.get(null) as? String ?: DEFAULT_SERVER
        } catch (e: Exception) {
            Log.w(TAG, "Could not get DEFAULT_SERVER_URL from BuildConfig, using hardcoded default")
            DEFAULT_SERVER
        }
    }
    
    /**
     * Генерация уникального ID устройства
     */
    private fun generateDeviceId(): String {
        val androidId = try {
            Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: "unknown"
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get Android ID", e)
            "unknown"
        }
        
        // Use Android model + Android ID
        val model = Build.MODEL.replace("[^A-Za-z0-9]".toRegex(), "").take(10)
        val id = androidId.take(8)
        
        return "tv_${model}_${id}".lowercase()
    }
}

