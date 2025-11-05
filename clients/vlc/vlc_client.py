#!/usr/bin/env python3
"""
VideoControl VLC Client v2.0
Упрощенный и надежный клиент для воспроизведения видео через VLC
Оптимизирован для стабильности и минимализма

Поддержка:
- Видео (mp4, webm, mkv, avi, mov, ogg)
- Изображения (png, jpg, jpeg, gif, webp)
- Автоматический возврат к заглушке после окончания видео
- Надежный watchdog механизм
"""

import vlc
import socketio
import time
import threading
import os
import sys
import argparse
import signal
import requests
from urllib.parse import quote

class VLCClient:
    def __init__(self, server_url, device_id, fullscreen=True):
        self.server_url = server_url.rstrip('/')
        self.device_id = device_id
        self.running = True
        
        print(f"[VLC] 🚀 Запуск VLC клиента v2.0")
        print(f"[VLC] Сервер: {server_url}")
        print(f"[VLC] Устройство: {device_id}")
        
        # Socket.IO клиент
        self.sio = socketio.Client(
            reconnection=True,
            reconnection_attempts=0,
            reconnection_delay=1,
            reconnection_delay_max=5
        )
        
        # VLC instance (минимальная конфигурация для стабильности)
        vlc_args = [
            '--no-video-title-show',  # Не показывать название файла
            '--http-reconnect',        # Автореконнект при обрыве HTTP
            '--network-caching=2000',  # 2 сек кэша для сетевых файлов
            '--quiet',                 # Тихий режим (без лишних логов)
            '--no-one-instance',       # Разрешить множественные VLC окна
            '--no-qt-error-dialogs',   # Не показывать диалоги ошибок
            '--no-interact'            # Без интерактивных элементов
        ]
        
        self.instance = vlc.Instance(' '.join(vlc_args))
        self.player = self.instance.media_player_new()
        
        # КРИТИЧНО: Создаем dummy медиа чтобы VLC открыл окно
        # VLC закрывает окно если нет активного медиа, поэтому создаем "пустое" видео
        try:
            # Создаем черный экран как плейсхолдер окна
            dummy_media = self.instance.media_new("screen://")
            self.player.set_media(dummy_media)
            self.player.play()
            time.sleep(0.3)  # Даем VLC время создать окно
            self.player.stop()
        except Exception as e:
            print(f"[VLC] ⚠️ Не удалось создать dummy окно: {e}")
        
        # КРИТИЧНО: Устанавливаем fullscreen ПОСЛЕ создания окна
        if fullscreen:
            try:
                self.player.set_fullscreen(True)
            except Exception as e:
                print(f"[VLC] ⚠️ Ошибка установки fullscreen: {e}")
        
        # Отключаем управление мышью/клавиатурой
        try:
            self.player.video_set_mouse_input(False)
            self.player.video_set_key_input(False)
        except:
            pass
        
        # State
        self.current_file = None
        self.current_type = None  # 'video' or 'image'
        self.placeholder_url = f"{self.server_url}/content/{self.device_id}/default.mp4"
        
        # Watchdog для отслеживания конца видео
        self.last_position = 0
        self.stuck_counter = 0
        self.error_counter = 0
        self.last_play_time = 0  # Время последнего запуска play()
        
        # Setup
        self._setup_vlc_events()
        self._setup_socket_events()
        self._setup_signal_handlers()
    
    def _setup_vlc_events(self):
        """Настройка VLC событий"""
        event_manager = self.player.event_manager()
        event_manager.event_attach(vlc.EventType.MediaPlayerEndReached, self._on_media_end)
        event_manager.event_attach(vlc.EventType.MediaPlayerEncounteredError, self._on_error)
    
    def _setup_socket_events(self):
        """Настройка Socket.IO событий"""
        
        @self.sio.event
        def connect():
            print('[VLC] ✅ Подключено к серверу')
            self.sio.emit('player/register', {'device_id': self.device_id})
            print('[VLC] 📡 Зарегистрирован как плеер')
        
        @self.sio.event
        def disconnect():
            print('[VLC] ⚠️ Отключено от сервера')
        
        @self.sio.on('player/play')
        def on_play(data):
            file_type = data.get('type')
            file_name = data.get('file')
            
            print(f"[VLC] ▶️ PLAY: type={file_type}, file={file_name}")
            
            if file_type == 'video' and file_name:
                self._play_video(file_name)
            elif file_type == 'image' and file_name:
                print(f"[VLC] 🖼️ Изображения не поддерживаются VLC клиентом")
                print(f"[VLC] 💡 Используйте browser плеер для изображений")
            elif file_type in ('pdf', 'pptx'):
                print(f"[VLC] 📄 PDF/PPTX не поддерживаются VLC клиентом")
                print(f"[VLC] 💡 Используйте browser плеер для презентаций")
        
        @self.sio.on('player/pause')
        def on_pause():
            print('[VLC] ⏸️ PAUSE')
            self.player.pause()
        
        @self.sio.on('player/restart')
        def on_restart():
            print('[VLC] 🔄 RESTART')
            self.player.set_time(0)
            self.player.play()
        
        @self.sio.on('player/stop')
        def on_stop():
            print('[VLC] ⏹️ STOP')
            self._play_placeholder()
        
        @self.sio.on('placeholder/refresh')
        def on_placeholder_refresh():
            print('[VLC] 🔄 PLACEHOLDER REFRESH')
            # Если сейчас играет заглушка - перезагрузить её
            if not self.current_file:
                self._play_placeholder()
        
        @self.sio.on('player/pong')
        def on_pong():
            pass  # Heartbeat ответ
    
    def _setup_signal_handlers(self):
        """Обработка сигналов для graceful shutdown"""
        def signal_handler(sig, frame):
            print('\n[VLC] 🛑 Получен сигнал завершения')
            self.running = False
            self.player.stop()
            self.sio.disconnect()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def _play_video(self, filename):
        """Воспроизведение видео файла"""
        # КРИТИЧНО: URL encoding для файлов с пробелами, скобками и кириллицей
        encoded_filename = quote(filename, safe='')
        url = f"{self.server_url}/content/{self.device_id}/{encoded_filename}"
        print(f"[VLC] 🎬 Загрузка видео: {filename}")
        print(f"[VLC] 🔗 URL: {url}")
        
        # КРИТИЧНО: Проверяем доступность файла ПЕРЕД попыткой воспроизведения
        try:
            print(f"[VLC] 🔍 Проверка доступности файла...")
            check_response = requests.head(url, timeout=5)
            if check_response.status_code != 200:
                print(f"[VLC] ❌ Файл недоступен: HTTP {check_response.status_code}")
                print(f"[VLC] 🔄 Возврат к заглушке")
                self._play_placeholder()
                return
            
            file_size = check_response.headers.get('Content-Length', '?')
            print(f"[VLC] ✅ Файл доступен (размер: {file_size} bytes)")
        except requests.exceptions.RequestException as e:
            print(f"[VLC] ❌ Ошибка проверки доступности: {e}")
            print(f"[VLC] 🔄 Возврат к заглушке")
            self._play_placeholder()
            return
        
        # Остановка предыдущего воспроизведения
        try:
            self.player.stop()
            time.sleep(0.2)
        except Exception as e:
            print(f"[VLC] ⚠️ Ошибка остановки предыдущего видео: {e}")
        
        try:
            # Загрузка нового медиа
            media = self.instance.media_new(url)
            
            if not media:
                print(f"[VLC] ❌ Не удалось создать media объект для {url}")
                self._play_placeholder()
                return
            
            # Добавляем опции для HTTP streaming
            media.add_option(':network-caching=2000')
            media.add_option(':http-reconnect')
            
            self.player.set_media(media)
            
            # Запуск воспроизведения
            ret = self.player.play()
            
            if ret == -1:
                print(f"[VLC] ❌ player.play() вернул ошибку (-1)")
                self._play_placeholder()
                return
            
            # Ждем немного чтобы VLC начал загрузку
            time.sleep(0.5)
            
            # Проверяем состояние
            state = self.player.get_state()
            print(f"[VLC] 📊 Состояние после запуска: {state}")
            
            if state == vlc.State.Error:
                print(f"[VLC] ❌ VLC сразу вернул ошибку для {url}")
                self._play_placeholder()
                return
            
            # Обновление state
            self.current_file = filename
            self.current_type = 'video'
            self.last_position = 0
            self.stuck_counter = 0
            self.error_counter = 0
            self.last_play_time = time.time()
            
            print(f"[VLC] ✅ Видео запущено: {filename}")
            
        except Exception as e:
            print(f"[VLC] ❌ Исключение при загрузке видео: {e}")
            print(f"[VLC] 🔄 Возврат к заглушке")
            self._play_placeholder()
    
    def _play_placeholder(self):
        """Воспроизведение заглушки (loop)"""
        print(f"[VLC] 🔁 Загрузка заглушки: {self.placeholder_url}")
        
        try:
            # Остановка предыдущего воспроизведения
            self.player.stop()
            time.sleep(0.2)
            
            # Загрузка заглушки
            media = self.instance.media_new(self.placeholder_url)
            
            if not media:
                print(f"[VLC] ❌ Не удалось создать media объект для заглушки")
                return
            
            # Добавляем опции для заглушки
            media.add_option(':network-caching=2000')
            media.add_option(':http-reconnect')
            media.add_option('input-repeat=-1')  # Бесконечный loop
            
            self.player.set_media(media)
            
            # Запуск в loop режиме
            ret = self.player.play()
            
            if ret == -1:
                print(f"[VLC] ❌ Ошибка запуска заглушки")
                return
            
            # Обновление state
            self.current_file = None
            self.current_type = None
            self.last_position = 0
            self.stuck_counter = 0
            self.error_counter = 0
            self.last_play_time = time.time()
            
            print(f"[VLC] ✅ Заглушка запущена")
            
        except Exception as e:
            print(f"[VLC] ❌ Исключение при загрузке заглушки: {e}")
    
    def _on_media_end(self, event):
        """Обработка события окончания медиа"""
        print('[VLC] 🏁 Медиа закончилось')
        
        if self.current_file:
            # Контент закончился - возврат к заглушке
            print('[VLC] 🔄 Возврат к заглушке')
            self._play_placeholder()
        else:
            # Заглушка закончилась - перезапуск
            print('[VLC] 🔁 Перезапуск заглушки (loop)')
            self._play_placeholder()
    
    def _on_error(self, event):
        """Обработка ошибок VLC"""
        print(f'[VLC] ❌ Ошибка воспроизведения')
        
        # Получаем детали ошибки если возможно
        try:
            media = self.player.get_media()
            if media:
                url = media.get_mrl()
                print(f'[VLC] 📛 Проблемный URL: {url}')
        except:
            pass
        
        # Получаем текущее состояние
        try:
            state = self.player.get_state()
            print(f'[VLC] 📊 Текущее состояние: {state}')
        except:
            pass
        
        # При ошибке возвращаемся к заглушке (НЕ закрываем окно)
        print(f'[VLC] 🔄 Попытка восстановления - возврат к заглушке')
        self._play_placeholder()
    
    def _watchdog(self):
        """
        Watchdog: проверяет зависание видео на последнем кадре
        Запускается в отдельном потоке, проверка каждые 0.5 сек
        """
        while self.running:
            try:
                time.sleep(0.5)
                
                # Проверяем только если воспроизводится контент (не заглушка)
                if not self.current_file:
                    continue
                
                # Проверяем состояние плеера
                state = self.player.get_state()
                
                # Если плеер закончил - возврат к заглушке
                if state == vlc.State.Ended:
                    print(f'[VLC] ✅ Watchdog: видео закончилось (State.Ended)')
                    self._play_placeholder()
                    continue
                
                # Для State.Error даем время на загрузку (игнорируем первые 3 секунды после play)
                if state == vlc.State.Error:
                    time_since_play = time.time() - self.last_play_time
                    if time_since_play < 3.0:
                        # Игнорируем ошибки в первые 3 секунды (файл загружается)
                        continue
                    
                    self.error_counter += 1
                    if self.error_counter >= 3:
                        print(f'[VLC] ❌ Watchdog: устойчивая ошибка (State.Error, 3+ проверки)')
                        self._play_placeholder()
                        continue
                    else:
                        print(f'[VLC] ⚠️ Watchdog: State.Error (счетчик: {self.error_counter}/3)')
                        continue
                else:
                    # Сбрасываем счетчик ошибок если состояние нормальное
                    self.error_counter = 0
                
                # Если плеер остановлен - возврат к заглушке
                if state == vlc.State.Stopped:
                    print(f'[VLC] ⚠️ Watchdog: плеер остановлен (State.Stopped)')
                    self._play_placeholder()
                    continue
                
                # Проверяем позицию воспроизведения
                position = self.player.get_time()
                
                if position > 0:
                    # Если позиция не изменилась - возможно зависание
                    if position == self.last_position:
                        self.stuck_counter += 1
                        
                        # Если позиция не меняется 3 секунды (6 проверок) - считаем зависанием
                        if self.stuck_counter >= 6:
                            print(f'[VLC] ⚠️ Watchdog: видео зависло на {position}ms')
                            self._play_placeholder()
                            continue
                    else:
                        self.stuck_counter = 0
                        self.last_position = position
            
            except Exception as e:
                print(f'[VLC] ⚠️ Watchdog error: {e}')
                continue
    
    def _heartbeat(self):
        """Heartbeat: отправка ping каждые 15 секунд"""
        while self.running:
            try:
                time.sleep(15)
                if self.sio.connected:
                    self.sio.emit('player/ping', {'device_id': self.device_id})
            except Exception as e:
                print(f'[VLC] ⚠️ Heartbeat error: {e}')
                continue
    
    def run(self):
        """Запуск клиента"""
        # Запуск watchdog в отдельном потоке
        watchdog_thread = threading.Thread(target=self._watchdog, daemon=True)
        watchdog_thread.start()
        
        # Запуск heartbeat в отдельном потоке
        heartbeat_thread = threading.Thread(target=self._heartbeat, daemon=True)
        heartbeat_thread.start()
        
        # Подключение к серверу
        try:
            print(f'[VLC] 🔌 Подключение к {self.server_url}...')
            self.sio.connect(self.server_url)
        except Exception as e:
            print(f'[VLC] ❌ Ошибка подключения: {e}')
            return
        
        # Запуск заглушки
        self._play_placeholder()
        
        print('[VLC] ✅ Клиент запущен. Для выхода нажмите Ctrl+C')
        
        # Основной цикл
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print('\n[VLC] 🛑 Остановка...')
        finally:
            self.player.stop()
            self.sio.disconnect()
            print('[VLC] ✅ Клиент остановлен')

def main():
    parser = argparse.ArgumentParser(description='VideoControl VLC Client v2.0')
    parser.add_argument('--server', required=True, help='Сервер URL (http://192.168.1.100)')
    parser.add_argument('--device', required=True, help='Device ID (vlc-001)')
    parser.add_argument('--no-fullscreen', action='store_true', help='Запуск в оконном режиме')
    
    args = parser.parse_args()
    
    client = VLCClient(
        server_url=args.server,
        device_id=args.device,
        fullscreen=not args.no_fullscreen
    )
    
    client.run()

if __name__ == '__main__':
    main()
