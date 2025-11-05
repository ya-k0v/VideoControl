#!/usr/bin/env python3
"""
VideoControl VLC Client v2.1 - Subprocess Version
Максимально простой клиент - запускает VLC как subprocess
Без python-vlc библиотеки - прямой запуск VLC через командную строку

Для систем где python-vlc не работает корректно
"""

import socketio
import time
import threading
import subprocess
import os
import sys
import argparse
import signal
import requests
from urllib.parse import quote

class VLCClientSimple:
    def __init__(self, server_url, device_id, fullscreen=True):
        self.server_url = server_url.rstrip('/')
        self.device_id = device_id
        self.fullscreen = fullscreen
        self.running = True
        
        print(f"[VLC-Simple] 🚀 Запуск VLC клиента v2.1 (subprocess)")
        print(f"[VLC-Simple] Сервер: {server_url}")
        print(f"[VLC-Simple] Устройство: {device_id}")
        
        # Socket.IO клиент
        self.sio = socketio.Client(
            reconnection=True,
            reconnection_attempts=0,
            reconnection_delay=1,
            reconnection_delay_max=5
        )
        
        # VLC process
        self.vlc_process = None
        self.current_url = None
        self.current_file = None
        
        # Setup
        self._setup_socket_events()
        self._setup_signal_handlers()
    
    def _find_vlc_binary(self):
        """Поиск VLC исполняемого файла"""
        vlc_paths = [
            'vlc',                                      # Linux (в PATH)
            '/usr/bin/vlc',                            # Linux (стандарт)
            '/snap/bin/vlc',                           # Linux (snap)
            'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', # Windows
            '/Applications/VLC.app/Contents/MacOS/VLC'  # macOS
        ]
        
        for vlc_path in vlc_paths:
            if os.path.exists(vlc_path) or subprocess.run(['which', vlc_path], capture_output=True).returncode == 0:
                print(f"[VLC-Simple] ✅ VLC найден: {vlc_path}")
                return vlc_path
        
        print(f"[VLC-Simple] ❌ VLC не найден, используем 'vlc' по умолчанию")
        return 'vlc'
    
    def _kill_vlc_process(self):
        """Остановка VLC процесса"""
        if self.vlc_process and self.vlc_process.poll() is None:
            try:
                self.vlc_process.terminate()
                self.vlc_process.wait(timeout=2)
            except:
                try:
                    self.vlc_process.kill()
                except:
                    pass
            self.vlc_process = None
    
    def _play_url(self, url, loop=False, is_placeholder=False):
        """Воспроизведение URL через VLC subprocess"""
        print(f"[VLC-Simple] 🎬 Запуск VLC для: {url}")
        
        # Остановка предыдущего VLC
        self._kill_vlc_process()
        time.sleep(0.2)
        
        # Формируем команду VLC
        vlc_binary = self._find_vlc_binary()
        vlc_cmd = [
            vlc_binary,
            '--no-video-title-show',
            '--http-reconnect',
            '--network-caching=2000',
            '--no-qt-error-dialogs',
            '--no-interact',
            '--no-one-instance',
            '--quiet'
        ]
        
        if self.fullscreen:
            vlc_cmd.append('--fullscreen')
        
        if loop:
            vlc_cmd.extend(['--loop', '--repeat'])
        
        vlc_cmd.append(url)
        
        print(f"[VLC-Simple] 📋 Команда: {' '.join(vlc_cmd[:5])}... {url}")
        
        try:
            # Запуск VLC как subprocess
            self.vlc_process = subprocess.Popen(
                vlc_cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL
            )
            
            print(f"[VLC-Simple] ✅ VLC процесс запущен (PID: {self.vlc_process.pid})")
            
            # Даем VLC время на запуск
            time.sleep(1.0)
            
            # Проверяем что процесс не упал сразу
            if self.vlc_process.poll() is not None:
                print(f"[VLC-Simple] ❌ VLC процесс завершился сразу (код: {self.vlc_process.returncode})")
                if not is_placeholder:
                    self._play_placeholder()
                return False
            
            print(f"[VLC-Simple] ✅ VLC работает")
            return True
            
        except Exception as e:
            print(f"[VLC-Simple] ❌ Ошибка запуска VLC: {e}")
            if not is_placeholder:
                self._play_placeholder()
            return False
    
    def _play_video(self, filename):
        """Воспроизведение видео файла"""
        # URL encoding для файлов с пробелами и спецсимволами
        encoded_filename = quote(filename, safe='')
        url = f"{self.server_url}/content/{self.device_id}/{encoded_filename}"
        
        print(f"[VLC-Simple] ▶️ Воспроизведение: {filename}")
        
        # Проверка доступности файла
        try:
            print(f"[VLC-Simple] 🔍 Проверка доступности...")
            check_response = requests.head(url, timeout=5)
            if check_response.status_code != 200:
                print(f"[VLC-Simple] ❌ Файл недоступен: HTTP {check_response.status_code}")
                self._play_placeholder()
                return
            
            file_size = int(check_response.headers.get('Content-Length', 0))
            size_mb = file_size / (1024 * 1024)
            print(f"[VLC-Simple] ✅ Файл доступен ({size_mb:.1f} MB)")
        except requests.exceptions.RequestException as e:
            print(f"[VLC-Simple] ❌ Ошибка проверки: {e}")
            self._play_placeholder()
            return
        
        # Запуск видео
        if self._play_url(url, loop=False):
            self.current_url = url
            self.current_file = filename
    
    def _play_placeholder(self):
        """Воспроизведение заглушки"""
        url = f"{self.server_url}/content/{self.device_id}/default.mp4"
        print(f"[VLC-Simple] 🔁 Загрузка заглушки")
        
        if self._play_url(url, loop=True, is_placeholder=True):
            self.current_url = url
            self.current_file = None
    
    def _setup_socket_events(self):
        """Настройка Socket.IO событий"""
        
        @self.sio.event
        def connect():
            print('[VLC-Simple] ✅ Подключено к серверу')
            self.sio.emit('player/register', {'device_id': self.device_id})
            print('[VLC-Simple] 📡 Зарегистрирован как плеер')
        
        @self.sio.event
        def disconnect():
            print('[VLC-Simple] ⚠️ Отключено от сервера')
        
        @self.sio.on('player/play')
        def on_play(data):
            file_type = data.get('type')
            file_name = data.get('file')
            
            print(f"[VLC-Simple] ▶️ PLAY: type={file_type}, file={file_name}")
            
            if file_type == 'video' and file_name:
                self._play_video(file_name)
            else:
                print(f"[VLC-Simple] ℹ️ Тип {file_type} не поддерживается")
        
        @self.sio.on('player/stop')
        def on_stop():
            print('[VLC-Simple] ⏹️ STOP')
            self._play_placeholder()
        
        @self.sio.on('placeholder/refresh')
        def on_placeholder_refresh():
            print('[VLC-Simple] 🔄 PLACEHOLDER REFRESH')
            if not self.current_file:
                self._play_placeholder()
        
        @self.sio.on('player/pong')
        def on_pong():
            pass
    
    def _setup_signal_handlers(self):
        """Обработка сигналов"""
        def signal_handler(sig, frame):
            print('\n[VLC-Simple] 🛑 Получен сигнал завершения')
            self.running = False
            self._kill_vlc_process()
            self.sio.disconnect()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def _heartbeat(self):
        """Heartbeat: отправка ping каждые 15 секунд"""
        while self.running:
            try:
                time.sleep(15)
                if self.sio.connected:
                    self.sio.emit('player/ping', {'device_id': self.device_id})
            except:
                continue
    
    def _watchdog(self):
        """Watchdog: проверка что VLC процесс жив"""
        while self.running:
            try:
                time.sleep(2)
                
                # Проверяем что VLC процесс еще работает
                if self.vlc_process and self.vlc_process.poll() is not None:
                    print(f"[VLC-Simple] ⚠️ VLC процесс завершился (код: {self.vlc_process.returncode})")
                    
                    # Если воспроизводилось видео - возврат к заглушке
                    if self.current_file:
                        print(f"[VLC-Simple] 🔄 Видео закончилось, возврат к заглушке")
                        self._play_placeholder()
                    else:
                        # Если заглушка упала - перезапуск
                        print(f"[VLC-Simple] 🔁 Перезапуск заглушки")
                        self._play_placeholder()
            except:
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
            print(f'[VLC-Simple] 🔌 Подключение к {self.server_url}...')
            self.sio.connect(self.server_url)
        except Exception as e:
            print(f'[VLC-Simple] ❌ Ошибка подключения: {e}')
            return
        
        # Запуск заглушки
        self._play_placeholder()
        
        print('[VLC-Simple] ✅ Клиент запущен. Для выхода нажмите Ctrl+C')
        
        # Основной цикл
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print('\n[VLC-Simple] 🛑 Остановка...')
        finally:
            self._kill_vlc_process()
            self.sio.disconnect()
            print('[VLC-Simple] ✅ Клиент остановлен')

def main():
    parser = argparse.ArgumentParser(description='VideoControl VLC Client v2.1 (subprocess)')
    parser.add_argument('--server', required=True, help='Сервер URL (http://192.168.1.100)')
    parser.add_argument('--device', required=True, help='Device ID (vlc-001)')
    parser.add_argument('--no-fullscreen', action='store_true', help='Запуск в оконном режиме')
    
    args = parser.parse_args()
    
    client = VLCClientSimple(
        server_url=args.server,
        device_id=args.device,
        fullscreen=not args.no_fullscreen
    )
    
    client.run()

if __name__ == '__main__':
    main()

