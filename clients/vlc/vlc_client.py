#!/usr/bin/env python3
"""
VideoControl VLC Client
Универсальный клиент для воспроизведения контента через VLC плеер
Поддержка: Windows, Linux, macOS
"""

import vlc
import socketio
import time
import threading
import os
import sys
import argparse
import signal
from pathlib import Path

class VLCVideoControlClient:
    def __init__(self, server_url, device_id, fullscreen=True, debug=False):
        """
        Инициализация VLC клиента
        
        Args:
            server_url: URL сервера (http://192.168.1.100:3000)
            device_id: ID устройства (vlc-001, tv-hall, etc)
            fullscreen: Запускать в fullscreen режиме
            debug: Включить отладочные сообщения
        """
        self.server_url = server_url
        self.device_id = device_id
        self.debug = debug
        
        # Socket.IO клиент с автореконнектом
        self.sio = socketio.Client(
            reconnection=True,
            reconnection_attempts=0,  # Бесконечно
            reconnection_delay=1,
            reconnection_delay_max=5
        )
        
        # VLC instance
        vlc_args = ['--no-video-title-show']  # Скрыть название файла
        if not debug:
            vlc_args.extend(['--quiet', '--no-osd'])  # Тихий режим
        
        self.instance = vlc.Instance(' '.join(vlc_args))
        self.player = self.instance.media_player_new()
        
        if fullscreen:
            self.player.set_fullscreen(True)
        
        # State
        self.current_media = None
        self.is_playing_content = False
        self.default_url = f"{server_url}/content/{device_id}/default.mp4"
        self.running = True
        
        # Event handlers
        self._setup_vlc_events()
        self._setup_socket_events()
        
        # Signal handlers для graceful shutdown
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
    
    def _setup_vlc_events(self):
        """Обработчики событий VLC"""
        event_manager = self.player.event_manager()
        
        # Когда видео закончилось
        event_manager.event_attach(
            vlc.EventType.MediaPlayerEndReached,
            self._on_media_end
        )
        
        # Ошибки воспроизведения
        event_manager.event_attach(
            vlc.EventType.MediaPlayerEncounteredError,
            self._on_media_error
        )
    
    def _on_media_end(self, event):
        """Обработчик окончания видео"""
        self._log("📺 Видео закончилось")
        
        if self.is_playing_content:
            # Контент закончился - возвращаемся к заглушке
            self._log("🔄 Возврат к заглушке...")
            self.is_playing_content = False
            self._play_placeholder()
        else:
            # Заглушка закончилась - повторяем заглушку
            self._debug("🔁 Повтор заглушки...")
            self._play_placeholder()
    
    def _on_media_error(self, event):
        """Обработчик ошибок воспроизведения"""
        self._log(f"❌ Ошибка воспроизведения")
        # Пытаемся вернуться к заглушке
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
                'device_type': 'vlc',
                'capabilities': {
                    'video': True,
                    'audio': True,
                    'images': False,  # VLC фокусируется на видео
                    'pdf': False,
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
            
            if file:
                # Играем контент
                content_url = f"{self.server_url}/content/{self.device_id}/{file}"
                self._log(f"🎬 Загрузка контента: {content_url}")
                self._play_content(content_url)
            else:
                # Resume текущего контента
                if self.player.get_state() == vlc.State.Paused:
                    self.player.pause()
                    self._log("⏯️  Resume")
        
        @self.sio.on('player/pause')
        def on_pause():
            """Команда паузы"""
            self._log("⏸️  Команда PAUSE")
            if self.is_playing_content:
                self.player.pause()
        
        @self.sio.on('player/restart')
        def on_restart():
            """Команда перезапуска контента"""
            self._log("🔄 Команда RESTART")
            if self.is_playing_content and self.current_media:
                self.player.stop()
                self.player.set_media(self.current_media)
                self.player.play()
        
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
    
    def _play_placeholder(self):
        """Воспроизведение заглушки в loop"""
        self._debug(f"🔁 Запуск заглушки: {self.default_url}")
        
        try:
            media = self.instance.media_new(self.default_url)
            # Опции для зацикливания
            media.add_option('input-repeat=65535')  # Большое число повторов
            
            self.player.set_media(media)
            self.current_media = media
            self.is_playing_content = False
            self.player.play()
        except Exception as e:
            self._log(f"⚠️  Ошибка загрузки заглушки: {e}")
    
    def _play_content(self, url):
        """Воспроизведение контента (один раз, затем возврат к заглушке)"""
        self._log(f"🎬 Запуск контента: {url}")
        
        try:
            media = self.instance.media_new(url)
            # Контент БЕЗ loop - после окончания вернемся к заглушке
            
            self.player.set_media(media)
            self.current_media = media
            self.is_playing_content = True
            self.player.play()
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
        self._log(f"🚀 Запуск VLC клиента")
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
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            self._log("\n👋 Остановка клиента...")
        finally:
            self.stop()
    
    def stop(self):
        """Остановка клиента"""
        self.running = False
        try:
            self.player.stop()
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
        description='VideoControl VLC Client',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Базовое использование (через Nginx на порту 80)
  python vlc_client.py --server http://192.168.1.100 --device vlc-001
  
  # С отладкой
  python vlc_client.py --server http://localhost --device test-vlc --debug
  
  # Без fullscreen (для тестирования)
  python vlc_client.py --server http://localhost --device vlc-test --no-fullscreen
  
  # Напрямую к Node.js (только для разработки БЕЗ Nginx)
  python vlc_client.py --server http://localhost:3000 --device test --debug

Environment variables:
  VIDEOCONTROL_SERVER    - URL сервера (по умолчанию: http://localhost)
  VIDEOCONTROL_DEVICE_ID - ID устройства (по умолчанию: vlc-001)
        '''
    )
    
    parser.add_argument(
        '--server', '-s',
        default=os.getenv('VIDEOCONTROL_SERVER', 'http://localhost'),
        help='URL сервера VideoControl (через Nginx на порту 80, или :3000 для прямого подключения)'
    )
    
    parser.add_argument(
        '--device', '-d',
        default=os.getenv('VIDEOCONTROL_DEVICE_ID', 'vlc-001'),
        help='ID устройства'
    )
    
    parser.add_argument(
        '--no-fullscreen',
        action='store_true',
        help='Не запускать в fullscreen режиме'
    )
    
    parser.add_argument(
        '--debug',
        action='store_true',
        help='Включить отладочные сообщения'
    )
    
    args = parser.parse_args()
    
    # Создаем и запускаем клиент
    client = VLCVideoControlClient(
        server_url=args.server,
        device_id=args.device,
        fullscreen=not args.no_fullscreen,
        debug=args.debug
    )
    
    client.start()


if __name__ == '__main__':
    main()

