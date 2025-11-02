#!/usr/bin/env python3
"""
VideoControl MPV Client
Легковесный клиент для воспроизведения контента через MPV плеер
Оптимизирован для Raspberry Pi и слабого железа
"""

import mpv
import socketio
import time
import threading
import os
import sys
import argparse
import signal

class MPVVideoControlClient:
    def __init__(self, server_url, device_id, fullscreen=True, hwdec=True, debug=False):
        """
        Инициализация MPV клиента
        
        Args:
            server_url: URL сервера (http://192.168.1.100:3000)
            device_id: ID устройства (mpv-001, rpi-tv, etc)
            fullscreen: Запускать в fullscreen режиме
            hwdec: Включить hardware декодирование
            debug: Включить отладочные сообщения
        """
        self.server_url = server_url
        self.device_id = device_id
        self.debug = debug
        
        # Socket.IO клиент с автореконнектом
        self.sio = socketio.Client(
            reconnection=True,
            reconnection_attempts=0,
            reconnection_delay=1,
            reconnection_delay_max=5
        )
        
        # MPV player
        mpv_kwargs = {
            'input_default_bindings': True,
            'input_vo_keyboard': True,
            'osc': False,  # Отключить on-screen controller
        }
        
        if fullscreen:
            mpv_kwargs['fullscreen'] = True
        
        if hwdec:
            mpv_kwargs['hwdec'] = 'auto'  # Автоматический hardware decoding
        
        if not debug:
            mpv_kwargs['really_quiet'] = True
        
        self.player = mpv.MPV(**mpv_kwargs)
        
        # State
        self.is_playing_content = False
        self.default_url = f"{server_url}/content/{device_id}/default.mp4"
        self.running = True
        
        # State для PDF/PPTX навигации
        self.current_file = None
        self.current_type = None  # 'video', 'image', 'pdf', 'pptx'
        self.current_page = 1
        
        # Event handlers
        self._setup_mpv_events()
        self._setup_socket_events()
        
        # Signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _log(self, message):
        """Логирование с timestamp"""
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] {message}", flush=True)
    
    def _debug(self, message):
        """Отладочное логирование"""
        if self.debug:
            self._log(f"[DEBUG] {message}")
    
    def _signal_handler(self, sig, frame):
        """Обработка сигналов для graceful shutdown"""
        self._log("Получен сигнал остановки, завершение работы...")
        self.running = False
        self.stop()
    
    def _setup_mpv_events(self):
        """Обработчики событий MPV"""
        
        @self.player.event_callback('end-file')
        def on_end_file(event):
            """Обработчик окончания файла"""
            reason = event.get('event', {}).get('reason')
            
            if reason == 'eof':  # End of file
                self._log("📺 Медиа закончилось")
                
                if self.is_playing_content:
                    # Для статичного контента (image/pdf/pptx) НЕ возвращаемся к заглушке
                    if self.current_type in ['image', 'pdf', 'pptx']:
                        self._debug("🖼️  Статичный контент продолжает отображаться")
                        # Не делаем ничего - изображение остается на экране (loop_file='inf')
                    else:
                        # Видео контент закончился - возвращаемся к заглушке
                        self._log("🔄 Возврат к заглушке...")
                        self.is_playing_content = False
                        self.current_type = None
                        self.current_file = None
                        self._play_placeholder()
                else:
                    # Заглушка закончилась - повторяем (хотя MPV loop должен работать)
                    self._debug("🔁 Повтор заглушки...")
                    self._play_placeholder()
            elif reason == 'error':
                self._log(f"❌ Ошибка воспроизведения")
                if self.is_playing_content:
                    self.is_playing_content = False
                    self._play_placeholder()
    
    def _setup_socket_events(self):
        """Настройка WebSocket событий"""
        
        @self.sio.on('connect')
        def on_connect():
            self._log(f"✅ Подключено к серверу {self.server_url}")
            # Регистрируем устройство
            self.sio.emit('player/register', {
                'device_id': self.device_id,
                'device_type': 'mpv',
                'capabilities': {
                    'video': True,
                    'audio': True,
                    'images': True,   # MPV может показывать изображения
                    'pdf': True,      # PDF конвертируется в PNG
                    'pptx': True,     # PPTX конвертируется в PNG
                    'streaming': True
                }
            })
            
        @self.sio.on('player/state')
        def on_state(data):
            self._debug(f"📊 Получено состояние: {data}")
            
        @self.sio.on('player/play')
        def on_play(data):
            """Команда на воспроизведение контента"""
            self._log(f"▶️  Команда PLAY: {data}")
            file = data.get('file')
            content_type = data.get('type', 'video')
            page = data.get('page', 1)
            
            if file:
                # Сохраняем текущее состояние
                self.current_file = file
                self.current_type = content_type
                self.current_page = page
                
                # Определяем URL в зависимости от типа
                if content_type == 'pdf':
                    # PDF конвертирован в PNG - загружаем как изображение
                    content_url = f"{self.server_url}/api/devices/{self.device_id}/converted/{file}/page/{page}"
                    self._log(f"📄 Загрузка PDF страницы {page}")
                    self._play_content(content_url, is_static=True)
                elif content_type == 'pptx':
                    # PPTX конвертирован в PNG - загружаем как изображение
                    content_url = f"{self.server_url}/api/devices/{self.device_id}/converted/{file}/slide/{page}"
                    self._log(f"📊 Загрузка PPTX слайда {page}")
                    self._play_content(content_url, is_static=True)
                elif content_type == 'image':
                    # Обычное изображение
                    content_url = f"{self.server_url}/content/{self.device_id}/{file}"
                    self._log(f"🖼️  Загрузка изображения")
                    self._play_content(content_url, is_static=True)
                else:
                    # Видео
                    content_url = f"{self.server_url}/content/{self.device_id}/{file}"
                    self._log(f"🎬 Загрузка видео")
                    self._play_content(content_url, is_static=False)
            else:
                # Resume
                if self.player.pause:
                    self.player.pause = False
                    self._log("⏯️  Resume")
        
        @self.sio.on('player/pause')
        def on_pause():
            """Команда паузы"""
            self._log("⏸️  Команда PAUSE")
            if self.is_playing_content:
                self.player.pause = True
        
        @self.sio.on('player/restart')
        def on_restart():
            """Команда перезапуска контента"""
            self._log("🔄 Команда RESTART")
            if self.is_playing_content:
                try:
                    self.player.seek(0, reference='absolute')
                except:
                    pass
        
        @self.sio.on('player/stop')
        def on_stop():
            """Команда остановки - возврат к заглушке"""
            self._log("⏹️  Команда STOP")
            self.is_playing_content = False
            self._play_placeholder()
        
        @self.sio.on('disconnect')
        def on_disconnect():
            self._log("❌ Отключено от сервера")
            # Продолжаем крутить заглушку даже при отключении
            if not self.is_playing_content:
                self._play_placeholder()
        
        @self.sio.on('player/pong')
        def on_pong():
            """Ответ на heartbeat"""
            self._debug("💓 Heartbeat OK")
        
        @self.sio.on('player/pdfPage')
        def on_pdf_page(page):
            """Навигация по страницам PDF"""
            if self.current_type == 'pdf' and self.current_file:
                self.current_page = page
                content_url = f"{self.server_url}/api/devices/{self.device_id}/converted/{self.current_file}/page/{page}"
                self._log(f"📄 PDF страница {page}")
                self._play_content(content_url, is_static=True)
        
        @self.sio.on('player/pptxPage')
        def on_pptx_page(slide):
            """Навигация по слайдам PPTX"""
            if self.current_type == 'pptx' and self.current_file:
                self.current_page = slide
                content_url = f"{self.server_url}/api/devices/{self.device_id}/converted/{self.current_file}/slide/{slide}"
                self._log(f"📊 PPTX слайд {slide}")
                self._play_content(content_url, is_static=True)
    
    def _play_placeholder(self):
        """Воспроизведение заглушки в loop"""
        self._debug(f"🔁 Запуск заглушки: {self.default_url}")
        
        try:
            self.player.loop_file = 'inf'  # Бесконечный loop
            self.player.play(self.default_url)
            self.is_playing_content = False
        except Exception as e:
            self._log(f"⚠️  Ошибка загрузки заглушки: {e}")
    
    def _play_content(self, url, is_static=False):
        """
        Воспроизведение контента
        
        Args:
            url: URL контента
            is_static: True для изображений/PDF/PPTX (не возвращаться к заглушке)
        """
        self._log(f"🎬 Запуск контента: {url}")
        
        try:
            if is_static:
                # Для статичного контента (изображения, PDF, PPTX)
                self.player.loop_file = 'inf'  # Loop для изображений (иначе моргают)
            else:
                # Для видео - без loop
                self.player.loop_file = 'no'
            
            self.player.play(url)
            self.is_playing_content = True
        except Exception as e:
            self._log(f"❌ Ошибка загрузки контента: {e}")
            self.is_playing_content = False
            self._play_placeholder()
    
    def _heartbeat(self):
        """Heartbeat для поддержания соединения"""
        while self.running:
            try:
                if self.sio.connected:
                    self.sio.emit('player/ping')
                    self._debug("💓 Отправлен ping")
            except Exception as e:
                self._debug(f"⚠️  Heartbeat error: {e}")
            time.sleep(15)  # Каждые 15 секунд
    
    def start(self):
        """Запуск клиента"""
        self._log(f"🚀 Запуск MPV клиента")
        self._log(f"   Сервер: {self.server_url}")
        self._log(f"   Устройство: {self.device_id}")
        self._log(f"   Заглушка: {self.default_url}")
        
        # Сразу запускаем заглушку
        self._play_placeholder()
        
        # Подключаемся к серверу
        try:
            self._log(f"🔌 Подключение к серверу...")
            self.sio.connect(self.server_url)
        except Exception as e:
            self._log(f"⚠️  Не удалось подключиться к серверу: {e}")
            self._log("📺 Продолжаем крутить заглушку в автономном режиме")
        
        # Запускаем heartbeat в отдельном потоке
        heartbeat_thread = threading.Thread(target=self._heartbeat, daemon=True)
        heartbeat_thread.start()
        
        self._log("✅ Клиент запущен. Для выхода нажмите Ctrl+C")
        
        # Основной loop
        try:
            self.player.wait_for_playback()
        except KeyboardInterrupt:
            self._log("\n👋 Остановка клиента...")
        finally:
            self.stop()
    
    def stop(self):
        """Остановка клиента"""
        self.running = False
        try:
            self.player.terminate()
        except:
            pass
        try:
            if self.sio.connected:
                self.sio.disconnect()
        except:
            pass
        self._log("✅ Клиент остановлен")
        sys.exit(0)


def main():
    """Точка входа"""
    parser = argparse.ArgumentParser(
        description='VideoControl MPV Client (optimized for Raspberry Pi)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Базовое использование (через Nginx на порту 80)
  python mpv_client.py --server http://192.168.1.100 --device mpv-001
  
  # С отладкой
  python mpv_client.py --server http://localhost --device rpi-test --debug
  
  # Без hardware декодирования
  python mpv_client.py --server http://localhost --device test --no-hwdec
  
  # Напрямую к Node.js (только для разработки БЕЗ Nginx)
  python mpv_client.py --server http://localhost:3000 --device test --debug

Environment variables:
  VIDEOCONTROL_SERVER    - URL сервера (по умолчанию: http://localhost)
  VIDEOCONTROL_DEVICE_ID - ID устройства (по умолчанию: mpv-001)
        '''
    )
    
    parser.add_argument(
        '--server', '-s',
        default=os.getenv('VIDEOCONTROL_SERVER', 'http://localhost'),
        help='URL сервера VideoControl (через Nginx на порту 80, или :3000 для прямого подключения)'
    )
    
    parser.add_argument(
        '--device', '-d',
        default=os.getenv('VIDEOCONTROL_DEVICE_ID', 'mpv-001'),
        help='ID устройства'
    )
    
    parser.add_argument(
        '--no-fullscreen',
        action='store_true',
        help='Не запускать в fullscreen режиме'
    )
    
    parser.add_argument(
        '--no-hwdec',
        action='store_true',
        help='Отключить hardware декодирование'
    )
    
    parser.add_argument(
        '--debug',
        action='store_true',
        help='Включить отладочные сообщения'
    )
    
    args = parser.parse_args()
    
    # Создаем и запускаем клиент
    client = MPVVideoControlClient(
        server_url=args.server,
        device_id=args.device,
        fullscreen=not args.no_fullscreen,
        hwdec=not args.no_hwdec,
        debug=args.debug
    )
    
    client.start()


if __name__ == '__main__':
    main()

