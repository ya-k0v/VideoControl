#!/bin/bash
# Миграция файлов из /content/{device}/ в /content/
# Обновление БД для новой архитектуры single file storage

set -e

CONTENT_DIR="/vid/videocontrol/public/content"
DB_PATH="/vid/videocontrol/config/main.db"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  МИГРАЦИЯ К ЕДИНОМУ ХРАНИЛИЩУ ФАЙЛОВ                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Проверка что скрипт запущен из правильной директории
if [ ! -d "$CONTENT_DIR" ]; then
  echo "❌ Ошибка: Директория $CONTENT_DIR не найдена!"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "❌ Ошибка: База данных $DB_PATH не найдена!"
  exit 1
fi

echo "📊 Анализ текущего состояния..."
DEVICE_FOLDERS=$(find "$CONTENT_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
echo "   Папок устройств: $DEVICE_FOLDERS"

FILES_IN_DEVICES=$(find "$CONTENT_DIR"/*/ -type f 2>/dev/null | wc -l || echo "0")
echo "   Файлов в папках устройств: $FILES_IN_DEVICES"

FILES_IN_ROOT=$(find "$CONTENT_DIR" -maxdepth 1 -type f | wc -l)
echo "   Файлов в корне: $FILES_IN_ROOT"
echo ""

if [ "$FILES_IN_DEVICES" -eq 0 ]; then
  echo "✅ Нет файлов для миграции - все уже в /content/"
  exit 0
fi

echo "🚀 Начинаем миграцию..."
echo ""

MIGRATED=0
SKIPPED=0
ERRORS=0

# Переносим файлы из папок устройств в корень
for device_folder in "$CONTENT_DIR"/*/; do
  if [ ! -d "$device_folder" ]; then
    continue
  fi
  
  device_id=$(basename "$device_folder")
  echo "📂 Обработка устройства: $device_id"
  
  # Переносим каждый файл
  for filepath in "$device_folder"*; do
    if [ ! -f "$filepath" ]; then
      continue  # Пропускаем папки
    fi
    
    filename=$(basename "$filepath")
    target_path="$CONTENT_DIR/$filename"
    
    # Если файл уже существует в корне - добавляем суффикс
    if [ -f "$target_path" ]; then
      # Проверяем MD5 - может это тот же файл?
      source_md5=$(md5sum "$filepath" | awk '{print $1}')
      target_md5=$(md5sum "$target_path" | awk '{print $1}')
      
      if [ "$source_md5" == "$target_md5" ]; then
        echo "  ✅ $filename (дубликат, пропускаем)"
        rm "$filepath"  # Удаляем дубликат
        SKIPPED=$((SKIPPED + 1))
      else
        # Разные файлы - добавляем суффикс
        ext="${filename##*.}"
        name="${filename%.*}"
        suffix="_$(openssl rand -hex 3)"
        new_filename="${name}${suffix}.${ext}"
        target_path="$CONTENT_DIR/$new_filename"
        
        mv "$filepath" "$target_path"
        echo "  ✅ $filename → $new_filename (конфликт имен)"
        MIGRATED=$((MIGRATED + 1))
        
        # Обновляем БД
        sqlite3 "$DB_PATH" "UPDATE files_metadata SET file_path='$target_path', safe_name='$new_filename' WHERE device_id='$device_id' AND safe_name='$filename';"
      fi
    else
      # Просто переносим
      mv "$filepath" "$target_path"
      echo "  ✅ $filename"
      MIGRATED=$((MIGRATED + 1))
      
      # Обновляем file_path в БД
      sqlite3 "$DB_PATH" "UPDATE files_metadata SET file_path='$target_path' WHERE device_id='$device_id' AND safe_name='$filename';"
    fi
  done
  
  # Удаляем пустую папку устройства
  if [ -d "$device_folder" ] && [ -z "$(ls -A "$device_folder")" ]; then
    rmdir "$device_folder"
    echo "  🗑️ Папка $device_id удалена (пустая)"
  fi
  
  echo ""
done

echo "═══════════════════════════════════════════════════════════"
echo "📈 ИТОГИ МИГРАЦИИ:"
echo "   Перенесено: $MIGRATED"
echo "   Пропущено (дубликаты): $SKIPPED"
echo "   Ошибок: $ERRORS"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✅ Миграция завершена!"
echo "💡 Перезапустите сервер: sudo systemctl restart videocontrol"

