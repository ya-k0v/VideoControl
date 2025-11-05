package com.videocontrol.tv

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

class SetupActivity : AppCompatActivity() {
    
    private lateinit var editServerUrl: EditText
    private lateinit var editDeviceId: EditText
    private lateinit var btnSave: Button
    private lateinit var tvError: TextView
    private lateinit var configManager: ConfigManager
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        
        configManager = ConfigManager(this)
        
        editServerUrl = findViewById(R.id.editServerUrl)
        editDeviceId = findViewById(R.id.editDeviceId)
        btnSave = findViewById(R.id.btnSave)
        tvError = findViewById(R.id.tvError)
        
        // Load existing values if any
        editServerUrl.setText(configManager.getServerUrl())
        editDeviceId.setText(configManager.getDeviceId())
        
        btnSave.setOnClickListener {
            saveAndContinue()
        }
    }
    
    private fun saveAndContinue() {
        try {
            val serverUrl = editServerUrl.text.toString().trim()
            val deviceId = editDeviceId.text.toString().trim()
            
            // Validate inputs
            if (serverUrl.isEmpty()) {
                showError("Введите адрес сервера")
                return
            }
            
            if (deviceId.isEmpty()) {
                showError("Введите ID устройства")
                return
            }
            
            // Validate URL format
            if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
                showError("Адрес должен начинаться с http:// или https://")
                return
            }
            
            // Save configuration immediately without server check
            configManager.saveServerUrl(serverUrl)
            configManager.saveDeviceId(deviceId)
            
            // Start MainActivity
            val intent = Intent(this@SetupActivity, MainActivity::class.java)
            startActivity(intent)
            finish()
        } catch (e: Exception) {
            showError("Ошибка: ${e.message}")
            e.printStackTrace()
        }
    }
    
    private suspend fun testServerConnection(serverUrl: String, deviceId: String): Boolean {
        return try {
            val testUrl = "$serverUrl/api/devices"
            val url = URL(testUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            
            val responseCode = connection.responseCode
            connection.disconnect()
            
            responseCode == 200
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
    
    private fun showError(message: String) {
        tvError.text = message
        tvError.visibility = View.VISIBLE
    }
}

