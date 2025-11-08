# Drag-and-Drop - Исправление проблем

## ❌ Проблема

После drag-and-drop файл переносился на backend, но:
- Frontend показывал файл в старом устройстве
- В новом устройстве файл не появлялся
- devices/updated отправлялся, но данные были старые

## 🔍 Причина

Backend не обновлял `devices[].files` после copy-file операции:
```javascript
// Было:
io.emit('devices/updated'); // Отправляем старые данные!
```

Frontend получал devices/updated, но devices[].files были старые!

## ✅ Исправлено

### Backend (files.js):
```javascript
// Пересканируем файлы обоих устройств
devices[sourceId].files = scanDeviceFiles(sourceId);
devices[targetId].files = scanDeviceFiles(targetId);

// Обновляем fileNames
devices[sourceId].fileNames = ...;
devices[targetId].fileNames = ...;

// ТЕПЕРЬ отправляем актуальные данные
io.emit('devices/updated');
```

### Frontend (devices-manager.js):
```javascript
// Убрали Object.assign (не работает)
// Используем Socket.IO onDevicesUpdated который вызовет loadDevices()
```

## 🧪 Результат

✅ Backend пересканирует файлы после copy/move
✅ devices/updated отправляет актуальные данные
✅ Frontend получает правильный список файлов
✅ Drag-and-drop работает корректно

## 📦 Коммиты

- `8750a66` - Frontend: Socket.IO для обновления
- `7b8e4f6` - Backend: rescan files после copy-file

