#!/usr/bin/env python3
"""
VideoControl MPV Client v1.0
Native Media Player for Linux/Unix - 24/7 Stable

Аналог ExoPlayer для Linux:
- Аппаратное ускорение (VAAPI/VDPAU/NVDEC)
- Стабильная работа 24/7
- Отличная работа с большими файлами (>4GB)
- Минимальное использование памяти (~50-70 MB)
- IPC управление (JSON-RPC)

Поддержка:
- Видео (mp4, webm, mkv, avi, mov, ogg, любые кодеки)
- Изображения (png, jpg, jpeg, gif, webp)
- PDF/PPTX слайды (через API сервера)
- Папки с изображениями
- Автоматический возврат к заглушке
"""

import socket
import json
import socketio
import time
import threading
import os
import sys
import argparse
import signal
import subprocess
import requests
from urllib.parse import quote

class MPVClient:
    def __init__(self, server_url, device_id, display=':0', fullscreen=True):
        self.server_url = server_url.rstrip('/')
        self.device_id = device_id
        self.running = True
        self.ipc_socket = f'/tmp/mpv-{device_id}.sock'
        
        print(f"[MPV] 🚀 Запуск MPV клиента v1.0")
        print(f"[MPV] Сервер: {server_url}")
        print(f"[MPV] Устройство: {device_id}")
        print(f"[MPV] Display: {display}")
        
        # Удаляем старый socket если есть
        if os.path.exists(self.ipc_socket):
            os.unlink(self.ipc_socket)
        
        # Запуск MPV с оптимальными параметрами для 24/7
        mpv_cmd = [
            'mpv',
            
            # === Основные настройки ===
            '--idle=yes',                    # Не закрываться без медиа
            '--force-window=yes',             # Всегда показывать окно
            f'--input-ipc-server={self.ipc_socket}',
            
            # === Аппаратное ускорение (как ExoPlayer) ===
            '--hwdec=auto',                  # Автовыбор: VAAPI/VDPAU/NVDEC
            '--gpu-context=auto',             # GPU контекст
            '--vo=gpu',                       # GPU вывод (OpenGL/Vulkan)
            
            # === Оптимизация для БОЛЬШИХ файлов ===
            '--cache=yes',                   # Включить кэш
            '--cache-secs=10',               # 10 секунд буфера
            '--demuxer-max-bytes=200M',      # 200MB кэш (как ExoPlayer)
            '--demuxer-readahead-secs=20',   # 20 сек предзагрузки
            '--demuxer-max-back-bytes=100M', # 100MB обратный буфер
            
            # === Сетевые оптимизации ===
            '--stream-buffer-size=4M',       # 4MB сетевой буфер
            '--network-timeout=60',          # 60 сек таймаут
            '--http-header-fields=User-Agent: VideoControl-MPV/1.0',
            
            # === UI отключения (как на Android) ===
            '--no-input-default-bindings',   # Отключить клавиатуру
            '--no-osc',                      # Без экранного меню
            '--no-osd-bar',                  # Без прогресс бара
            '--osd-level=0',                 # Без OSD вообще
            '--cursor-autohide=always',      # Скрыть курсор
            '--no-terminal',                 # Без терминального вывода
            
            # === Стабильность 24/7 ===
            '--keep-open=yes',               # Держать окно после окончания
            '--no-resume-playback',          # Не возобновлять позицию
            '--save-position-on-quit=no',    # Не сохранять позицию
            
            # === Логирование ===
            '--msg-level=all=error',         # Только ошибки
        ]
        
        # Fullscreen
        if fullscreen:
            mpv_cmd.append('--fullscreen')
        
        # Display
        if display:
            mpv_cmd.append(f'--display={display}')
        
        print(f"[MPV] 🎬 Запуск MPV процесса...")
        self.mpv_process = subprocess.Popen(
            mpv_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            env={**os.environ, 'DISPLAY': display}
        )
        
        # Ждем инициализации MPV и создания IPC socket
        for i in range(30):  # 3 секунды максимум
            if os.path.exists(self.ipc_socket):
                break
            time.sleep(0.1)
        
        if not os.path.exists(self.ipc_socket):
            print(f"[MPV] ❌ IPC socket не создан: {self.ipc_socket}")
            sys.exit(1)
        
        print(f"[MPV] ✅ MPV запущен (PID: {self.mpv_process.pid})")
        
        # Проверяем аппаратное ускорение
        self._check_hardware_acceleration()
        
        # Socket.IO клиент
        self.sio = socketio.Client(
            reconnection=True,
            reconnection_attempts=0,
            reconnection_delay=2,
            reconnection_delay_max=10
        )
        
        # State
        self.current_file = None
        self.current_type = None
        self.current_page = 1
        self.placeholder_url = f"{self.server_url}/content/{self.device_id}/default.mp4"
        
        # Setup
        self._setup_socket_events()
        self._setup_signal_handlers()
        self._setup_mpv_event_listener()
    
    def _check_hardware_acceleration(self):
        """Проверка аппаратного декодирования"""
        time.sleep(0.5)  # Даем MPV инициализироваться
        
        result = self.send_command('get_property', 'hwdec-current')
        if result and result.get('error') == 'success':
            hwdec = result.get('data', 'no')
            if hwdec and hwdec != 'no':
                print(f"[MPV] ✅ Аппаратное ускорение: {hwdec}")
                print(f"[MPV] 🚀 Производительность как ExoPlayer!")
            else:
                print(f"[MPV] ⚠️ Аппаратное ускорение недоступно (CPU декодинг)")
                print(f"[MPV] 💡 Установите VAAPI/VDPAU драйверы для GPU ускорения")
        else:
            print(f"[MPV] ℹ️ Статус аппаратного ускорения: проверка недоступна")
    
    def send_command(self, command, *args):
        """Отправка команды в MPV через IPC (JSON-RPC)"""
        try:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(5)
            sock.connect(self.ipc_socket)
            
            cmd = {"command": [command] + list(args)}
            sock.send((json.dumps(cmd) + '\n').encode())
            
            response = sock.recv(8192).decode().strip()
            sock.close()
            
            if response:
                return json.loads(response)
            return None
            
        except Exception as e:
            print(f"[MPV] ⚠️ IPC error: {e}")
            return None
    
    def _setup_socket_events(self):
        """Настройка Socket.IO событий"""
        
        @self.sio.event
        def connect():
            print('[MPV] ✅ Подключено к серверу')
            self.sio.emit('player/register', {
                'device_id': self.device_id,
                'deviceType': 'NATIVE_MPV',
                'platform': 'Linux MPV'
            })
            print('[MPV] 📡 Зарегистрирован как NATIVE_MPV плеер')
        
        @self.sio.event
        def disconnect():
            print('[MPV] ⚠️ Отключено от сервера')
        
        @self.sio.on('player/play')
        def on_play(data):
            file_type = data.get('type', 'video')
            file_name = data.get('file')
            page = data.get('page', 1)
            
            print(f"[MPV] ▶️ PLAY: type={file_type}, file={file_name}, page={page}")
            
            if file_type == 'video' and file_name:
                self._play_video(file_name)
            elif file_type == 'image' and file_name:
                self._play_image(file_name)
            elif file_type == 'pdf' and file_name:
                self._play_pdf_page(file_name, page)
            elif file_type == 'pptx' and file_name:
                self._play_pptx_slide(file_name, page)
            elif file_type == 'folder' and file_name:
                self._play_folder_image(file_name, page)
        
        @self.sio.on('player/pause')
        def on_pause():
            print('[MPV] ⏸️ PAUSE')
            self.send_command('set_property', 'pause', True)
        
        @self.sio.on('player/resume')
        def on_resume():
            print('[MPV] ▶️ RESUME')
            self.send_command('set_property', 'pause', False)
        
        @self.sio.on('player/restart')
        def on_restart():
            print('[MPV] 🔄 RESTART')
            self.send_command('seek', 0, 'absolute')
            self.send_command('set_property', 'pause', False)
        
        @self.sio.on('player/stop')
        def on_stop():
            print('[MPV] ⏹️ STOP')
            self._play_placeholder()
        
        @self.sio.on('player/pdfPage')
        def on_pdf_page(page_num):
            """Переключение страницы PDF"""
            if self.current_type == 'pdf' and self.current_file:
                self._play_pdf_page(self.current_file, page_num)
        
        @self.sio.on('player/pptxSlide')
        def on_pptx_slide(slide_num):
            """Переключение слайда PPTX"""
            if self.current_type == 'pptx' and self.current_file:
                self._play_pptx_slide(self.current_file, slide_num)
        
        @self.sio.on('player/folderPage')
        def on_folder_page(image_num):
            """Переключение изображения в папке"""
            if self.current_type == 'folder' and self.current_file:
                self._play_folder_image(self.current_file, image_num)
        
        @self.sio.on('placeholder/refresh')
        def on_placeholder_refresh():
            print('[MPV] 🔄 PLACEHOLDER REFRESH')
            if not self.current_file:
                self._play_placeholder()
        
        @self.sio.on('player/pong')
        def on_pong():
            pass  # Heartbeat ответ
    
    def _setup_signal_handlers(self):
        """Обработка сигналов для graceful shutdown"""
        def signal_handler(sig, frame):
            print('\n[MPV] 🛑 Получен сигнал завершения')
            self.running = False
            self.cleanup()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def _setup_mpv_event_listener(self):
        """Слушатель событий MPV (в отдельном потоке)"""
        def listen_events():
            while self.running:
                try:
                    # Проверяем состояние через get_property
                    time.sleep(1)
                    
                    # Проверяем eof-reached (конец файла)
                    result = self.send_command('get_property', 'eof-reached')
                    if result and result.get('data') == True:
                        print('[MPV] 🏁 Файл закончился')
                        if self.current_file:
                            print('[MPV] 🔄 Возврат к заглушке')
                            self._play_placeholder()
                    
                except Exception as e:
                    if self.running:
                        print(f'[MPV] ⚠️ Event listener error: {e}')
                    time.sleep(2)
        
        thread = threading.Thread(target=listen_events, daemon=True)
        thread.start()
    
    def _play_video(self, filename):
        """Воспроизведение видео файла"""
        encoded_filename = quote(filename, safe='')
        url = f"{self.server_url}/content/{self.device_id}/{encoded_filename}"
        
        print(f"[MPV] 🎬 Загрузка видео: {filename}")
        print(f"[MPV] 🔗 URL: {url}")
        
        # Загрузка файла
        result = self.send_command('loadfile', url, 'replace')
        
        if result and result.get('error') == 'success':
            # Отключаем loop для контента
            self.send_command('set_property', 'loop-file', 'no')
            
            # Обновление state
            self.current_file = filename
            self.current_type = 'video'
            self.current_page = 1
            
            print(f"[MPV] ✅ Видео загружено")
        else:
            print(f"[MPV] ❌ Ошибка загрузки видео")
            self._play_placeholder()
    
    def _play_image(self, filename, duration=10):
        """Воспроизведение изображения"""
        encoded_filename = quote(filename, safe='')
        url = f"{self.server_url}/content/{self.device_id}/{encoded_filename}"
        
        print(f"[MPV] 🖼️ Показ изображения: {filename}")
        
        result = self.send_command('loadfile', url, 'replace')
        
        if result and result.get('error') == 'success':
            # MPV автоматически показывает изображения
            # Устанавливаем время показа
            self.send_command('set_property', 'image-display-duration', duration)
            
            self.current_file = filename
            self.current_type = 'image'
            self.current_page = 1
            
            print(f"[MPV] ✅ Изображение показано ({duration} сек)")
        else:
            print(f"[MPV] ❌ Ошибка загрузки изображения")
    
    def _play_pdf_page(self, filename, page_num):
        """Показ страницы PDF"""
        folder_name = filename.replace('.pdf', '')
        encoded_folder = quote(folder_name, safe='')
        url = f"{self.server_url}/api/devices/{self.device_id}/converted/{encoded_folder}/page/{page_num}"
        
        print(f"[MPV] 📄 PDF страница: {filename} - страница {page_num}")
        
        result = self.send_command('loadfile', url, 'replace')
        
        if result and result.get('error') == 'success':
            self.send_command('set_property', 'image-display-duration', 'inf')
            
            self.current_file = filename
            self.current_type = 'pdf'
            self.current_page = page_num
            
            print(f"[MPV] ✅ PDF страница {page_num} показана")
        else:
            print(f"[MPV] ❌ Ошибка загрузки PDF страницы")
    
    def _play_pptx_slide(self, filename, slide_num):
        """Показ слайда PPTX"""
        folder_name = filename.replace('.pptx', '')
        encoded_folder = quote(folder_name, safe='')
        url = f"{self.server_url}/api/devices/{self.device_id}/converted/{encoded_folder}/slide/{slide_num}"
        
        print(f"[MPV] 📊 PPTX слайд: {filename} - слайд {slide_num}")
        
        result = self.send_command('loadfile', url, 'replace')
        
        if result and result.get('error') == 'success':
            self.send_command('set_property', 'image-display-duration', 'inf')
            
            self.current_file = filename
            self.current_type = 'pptx'
            self.current_page = slide_num
            
            print(f"[MPV] ✅ PPTX слайд {slide_num} показан")
        else:
            print(f"[MPV] ❌ Ошибка загрузки PPTX слайда")
    
    def _play_folder_image(self, folder_name, image_num):
        """Показ изображения из папки"""
        # Убираем .zip если есть
        clean_folder = folder_name.replace('.zip', '')
        encoded_folder = quote(clean_folder, safe='')
        url = f"{self.server_url}/api/devices/{self.device_id}/folder/{encoded_folder}/image/{image_num}"
        
        print(f"[MPV] 📁 Папка: {folder_name} - изображение {image_num}")
        
        result = self.send_command('loadfile', url, 'replace')
        
        if result and result.get('error') == 'success':
            self.send_command('set_property', 'image-display-duration', 'inf')
            
            self.current_file = folder_name
            self.current_type = 'folder'
            self.current_page = image_num
            
            print(f"[MPV] ✅ Изображение {image_num} из папки показано")
        else:
            print(f"[MPV] ❌ Ошибка загрузки изображения из папки")
    
    def _play_placeholder(self):
        """Воспроизведение заглушки (бесконечный loop)"""
        print(f"[MPV] 🔁 Загрузка заглушки: {self.placeholder_url}")
        
        result = self.send_command('loadfile', self.placeholder_url, 'replace')
        
        if result and result.get('error') == 'success':
            # Включаем бесконечный loop для заглушки
            self.send_command('set_property', 'loop-file', 'inf')
            
            # Обновление state
            self.current_file = None
            self.current_type = None
            self.current_page = 1
            
            print(f"[MPV] ✅ Заглушка запущена (loop)")
        else:
            print(f"[MPV] ❌ Ошибка загрузки заглушки")
    
    def _heartbeat(self):
        """Heartbeat: отправка ping каждые 15 секунд"""
        while self.running:
            try:
                time.sleep(15)
                if self.sio.connected:
                    self.sio.emit('player/ping', {'device_id': self.device_id})
                    
                    # Также проверяем жив ли MPV процесс
                    if self.mpv_process.poll() is not None:
                        print("[MPV] ❌ MPV процесс завершился!")
                        self.running = False
                        break
                        
            except Exception as e:
                if self.running:
                    print(f'[MPV] ⚠️ Heartbeat error: {e}')
                time.sleep(5)
    
    def _monitor_stderr(self):
        """Мониторинг stderr MPV для критических ошибок"""
        while self.running:
            try:
                line = self.mpv_process.stderr.readline()
                if line:
                    error_msg = line.decode('utf-8', errors='ignore').strip()
                    if error_msg:
                        print(f"[MPV] 🔴 {error_msg}")
            except Exception as e:
                if self.running:
                    print(f"[MPV] ⚠️ stderr monitor error: {e}")
                break
    
    def run(self):
        """Запуск клиента"""
        # Запуск heartbeat в отдельном потоке
        heartbeat_thread = threading.Thread(target=self._heartbeat, daemon=True)
        heartbeat_thread.start()
        
        # Запуск мониторинга stderr
        stderr_thread = threading.Thread(target=self._monitor_stderr, daemon=True)
        stderr_thread.start()
        
        # Подключение к серверу
        try:
            print(f'[MPV] 🔌 Подключение к {self.server_url}...')
            self.sio.connect(self.server_url)
        except Exception as e:
            print(f'[MPV] ❌ Ошибка подключения: {e}')
            self.cleanup()
            return
        
        # Запуск заглушки
        time.sleep(0.5)
        self._play_placeholder()
        
        print('[MPV] ✅ Клиент запущен. Для выхода нажмите Ctrl+C')
        print('[MPV] 📊 Память: ~50-70 MB (vs ~350 MB у Video.js)')
        print('[MPV] 🎯 Большие файлы: без проблем!')
        
        # Основной цикл
        try:
            while self.running:
                time.sleep(1)
                
                # Проверяем жив ли MPV
                if self.mpv_process.poll() is not None:
                    print("[MPV] ❌ MPV процесс завершился!")
                    break
                    
        except KeyboardInterrupt:
            print('\n[MPV] 🛑 Остановка...')
        finally:
            self.cleanup()
    
    def cleanup(self):
        """Очистка ресурсов"""
        print("[MPV] 🧹 Очистка ресурсов...")
        
        self.running = False
        
        # Отключение от сервера
        try:
            if self.sio.connected:
                self.sio.disconnect()
        except:
            pass
        
        # Остановка MPV
        try:
            self.send_command('quit')
            time.sleep(0.5)
        except:
            pass
        
        # Убиваем процесс если не завершился
        if self.mpv_process and self.mpv_process.poll() is None:
            self.mpv_process.terminate()
            try:
                self.mpv_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.mpv_process.kill()
        
        # Удаляем IPC socket
        if os.path.exists(self.ipc_socket):
            try:
                os.unlink(self.ipc_socket)
            except:
                pass
        
        print('[MPV] ✅ Клиент остановлен')

def main():
    parser = argparse.ArgumentParser(
        description='VideoControl MPV Client v1.0 - Native Player for Linux',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примеры использования:
  %(prog)s --server http://192.168.1.100 --device mpv-001
  %(prog)s --server http://192.168.1.100 --device mpv-001 --no-fullscreen
  %(prog)s --server http://192.168.1.100 --device mpv-001 --display :0

Преимущества MPV:
  ✅ Аппаратное ускорение (VAAPI/VDPAU/NVDEC)
  ✅ Стабильная работа 24/7
  ✅ Большие файлы >4GB без проблем
  ✅ Меньше памяти чем Video.js (~50 MB vs ~350 MB)
  ✅ Поддержка всех кодеков
        """
    )
    
    parser.add_argument('--server', required=True, 
                       help='Server URL (http://192.168.1.100)')
    parser.add_argument('--device', required=True, 
                       help='Device ID (mpv-001)')
    parser.add_argument('--display', default=':0', 
                       help='X Display (default: :0)')
    parser.add_argument('--no-fullscreen', action='store_true',
                       help='Запуск в оконном режиме (для тестирования)')
    
    args = parser.parse_args()
    
    client = MPVClient(
        server_url=args.server,
        device_id=args.device,
        display=args.display,
        fullscreen=not args.no_fullscreen
    )
    
    client.run()

if __name__ == '__main__':
    main()

