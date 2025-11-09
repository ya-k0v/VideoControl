import NodeMediaServer from 'node-media-server';
import logger from '../monitoring/logger.js';
import path from 'path';
import fs from 'fs';

/**
 * RTMP Streaming Server
 * Handles live video streams via RTMP and serves as HLS
 */
export class RTMPServer {
  constructor(options = {}) {
    this.config = {
      rtmp: {
        port: options.rtmpPort || 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
      },
      http: {
        port: options.httpPort || 8000,
        allow_origin: '*',
        mediaroot: options.mediaroot || './media',
      },
      trans: {
        ffmpeg: options.ffmpegPath || '/usr/bin/ffmpeg',
        tasks: [
          {
            app: 'live',
            hls: true,
            hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
            dash: true,
            dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
          },
          {
            app: 'live',
            mp4: true,
            mp4Flags: '[movflags=frag_keyframe+empty_moov]',
          }
        ]
      },
      auth: {
        play: false, // Enable if you want to protect playback
        publish: true, // Require authentication for publishing
        secret: options.secret || 'videocontrol-stream-secret'
      }
    };

    this.server = null;
    this.activeStreams = new Map();
  }

  /**
   * Start RTMP server
   */
  start() {
    try {
      // Create media directory if it doesn't exist
      if (!fs.existsSync(this.config.http.mediaroot)) {
        fs.mkdirSync(this.config.http.mediaroot, { recursive: true });
      }

      this.server = new NodeMediaServer(this.config);

      // Setup event listeners
      this.setupEventListeners();

      this.server.run();

      logger.info(`✅ RTMP Server started`);
      logger.info(`   RTMP: rtmp://localhost:${this.config.rtmp.port}/live`);
      logger.info(`   HLS:  http://localhost:${this.config.http.port}/live/STREAM_KEY/index.m3u8`);

    } catch (error) {
      logger.error('Failed to start RTMP server:', error);
    }
  }

  /**
   * Stop RTMP server
   */
  stop() {
    if (this.server) {
      this.server.stop();
      logger.info('RTMP Server stopped');
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Stream published event
    this.server.on('prePublish', (id, StreamPath, args) => {
      logger.info(`Stream published: ${StreamPath}`, { id, args });
      
      // Verify stream key/authentication
      const streamKey = this.getStreamKey(StreamPath);
      const isAuthorized = this.verifyStreamKey(streamKey, args.sign);

      if (!isAuthorized) {
        logger.warn(`Unauthorized stream attempt: ${streamKey}`);
        const session = this.server.getSession(id);
        session.reject();
        return;
      }

      this.activeStreams.set(id, {
        streamKey,
        path: StreamPath,
        startTime: new Date(),
        viewers: 0
      });

      logger.info(`✅ Stream authorized: ${streamKey}`);
    });

    // Stream stopped event
    this.server.on('donePublish', (id, StreamPath, args) => {
      logger.info(`Stream ended: ${StreamPath}`, { id });
      this.activeStreams.delete(id);
    });

    // Player connected event
    this.server.on('prePlay', (id, StreamPath, args) => {
      logger.debug(`Player connected: ${StreamPath}`, { id });
      
      const streamInfo = Array.from(this.activeStreams.values())
        .find(s => s.path === StreamPath);
      
      if (streamInfo) {
        streamInfo.viewers++;
      }
    });

    // Player disconnected event
    this.server.on('donePlay', (id, StreamPath, args) => {
      logger.debug(`Player disconnected: ${StreamPath}`, { id });
      
      const streamInfo = Array.from(this.activeStreams.values())
        .find(s => s.path === StreamPath);
      
      if (streamInfo && streamInfo.viewers > 0) {
        streamInfo.viewers--;
      }
    });
  }

  /**
   * Extract stream key from path
   */
  getStreamKey(streamPath) {
    const parts = streamPath.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Verify stream key authentication
   */
  verifyStreamKey(streamKey, signature) {
    // Implement your authentication logic here
    // For now, allowing all streams
    // In production, verify against database or API
    return true;
  }

  /**
   * Get active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.entries()).map(([id, info]) => ({
      id,
      ...info,
      duration: Date.now() - info.startTime.getTime()
    }));
  }

  /**
   * Get stream statistics
   */
  getStreamStats(streamKey) {
    const stream = Array.from(this.activeStreams.values())
      .find(s => s.streamKey === streamKey);
    
    if (!stream) {
      return null;
    }

    return {
      streamKey: stream.streamKey,
      startTime: stream.startTime,
      viewers: stream.viewers,
      duration: Date.now() - stream.startTime.getTime(),
      hlsUrl: `http://localhost:${this.config.http.port}/live/${streamKey}/index.m3u8`,
      rtmpUrl: `rtmp://localhost:${this.config.rtmp.port}/live/${streamKey}`
    };
  }
}

export default RTMPServer;

