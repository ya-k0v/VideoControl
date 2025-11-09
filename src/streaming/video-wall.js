import logger from '../monitoring/logger.js';

/**
 * Video Wall Manager
 * Synchronizes playback across multiple devices for video wall displays
 */
export class VideoWallManager {
  constructor(io) {
    this.io = io;
    this.videoWalls = new Map();
  }

  /**
   * Create a video wall
   */
  createVideoWall(config) {
    const {
      id,
      name,
      layout, // e.g., { rows: 2, cols: 3 }
      devices, // Array of device IDs with positions
      syncMode = 'tight' // 'tight' or 'loose'
    } = config;

    this.videoWalls.set(id, {
      id,
      name,
      layout,
      devices,
      syncMode,
      currentFile: null,
      playbackState: 'stopped',
      syncOffset: syncMode === 'tight' ? 50 : 200, // ms
      createdAt: new Date()
    });

    logger.info(`Video wall created: ${name} (${id})`, {
      layout,
      deviceCount: devices.length
    });

    return this.videoWalls.get(id);
  }

  /**
   * Play content on video wall
   */
  async play(videoWallId, file) {
    const videoWall = this.videoWalls.get(videoWallId);
    
    if (!videoWall) {
      throw new Error('Video wall not found');
    }

    videoWall.currentFile = file;
    videoWall.playbackState = 'playing';

    // Calculate sync timestamp for all devices
    const syncTimestamp = Date.now() + videoWall.syncOffset;

    logger.info(`Playing on video wall: ${videoWall.name}`, {
      file: file.fileName,
      devices: videoWall.devices.length,
      syncTimestamp
    });

    // Send play command to all devices with sync timestamp
    const promises = videoWall.devices.map(device => {
      return new Promise((resolve) => {
        this.io.to(device.deviceId).emit('videowall/play', {
          videoWallId,
          file,
          position: device.position,
          layout: videoWall.layout,
          syncTimestamp,
          cropRegion: this.calculateCropRegion(device.position, videoWall.layout)
        });

        // Log individual device command
        logger.debug(`Sent play command to device ${device.deviceId}`, {
          position: device.position
        });

        resolve();
      });
    });

    await Promise.all(promises);

    // Monitor playback sync
    this.monitorSync(videoWallId);

    return videoWall;
  }

  /**
   * Calculate crop region for device based on position in wall
   */
  calculateCropRegion(position, layout) {
    const { row, col } = position;
    const { rows, cols } = layout;

    // Calculate what portion of the video this device should show
    return {
      x: (col / cols),
      y: (row / rows),
      width: (1 / cols),
      height: (1 / rows)
    };
  }

  /**
   * Pause video wall playback
   */
  async pause(videoWallId) {
    const videoWall = this.videoWalls.get(videoWallId);
    
    if (!videoWall) {
      throw new Error('Video wall not found');
    }

    videoWall.playbackState = 'paused';

    videoWall.devices.forEach(device => {
      this.io.to(device.deviceId).emit('videowall/pause', {
        videoWallId
      });
    });

    logger.info(`Video wall paused: ${videoWall.name}`);
  }

  /**
   * Stop video wall playback
   */
  async stop(videoWallId) {
    const videoWall = this.videoWalls.get(videoWallId);
    
    if (!videoWall) {
      throw new Error('Video wall not found');
    }

    videoWall.playbackState = 'stopped';
    videoWall.currentFile = null;

    videoWall.devices.forEach(device => {
      this.io.to(device.deviceId).emit('videowall/stop', {
        videoWallId
      });
    });

    logger.info(`Video wall stopped: ${videoWall.name}`);
  }

  /**
   * Seek to position on video wall
   */
  async seek(videoWallId, position) {
    const videoWall = this.videoWalls.get(videoWallId);
    
    if (!videoWall) {
      throw new Error('Video wall not found');
    }

    const syncTimestamp = Date.now() + videoWall.syncOffset;

    videoWall.devices.forEach(device => {
      this.io.to(device.deviceId).emit('videowall/seek', {
        videoWallId,
        position,
        syncTimestamp
      });
    });

    logger.info(`Video wall seek: ${videoWall.name} to ${position}s`);
  }

  /**
   * Monitor playback synchronization
   */
  monitorSync(videoWallId) {
    const videoWall = this.videoWalls.get(videoWallId);
    
    if (!videoWall) return;

    const checkInterval = videoWall.syncMode === 'tight' ? 1000 : 5000;

    const syncCheck = setInterval(() => {
      if (videoWall.playbackState !== 'playing') {
        clearInterval(syncCheck);
        return;
      }

      // Request playback position from all devices
      videoWall.devices.forEach(device => {
        this.io.to(device.deviceId).emit('videowall/sync-check', {
          videoWallId
        });
      });

    }, checkInterval);

    // Store interval for cleanup
    videoWall.syncCheckInterval = syncCheck;
  }

  /**
   * Handle sync response from device
   */
  handleSyncResponse(deviceId, data) {
    const { videoWallId, position, timestamp } = data;
    const videoWall = this.videoWalls.get(videoWallId);

    if (!videoWall) return;

    // Calculate drift and adjust if necessary
    // This is a simplified version - in production, use more sophisticated algorithm
    const expectedPosition = (Date.now() - timestamp) / 1000;
    const drift = Math.abs(position - expectedPosition);

    if (drift > 0.5) { // More than 500ms drift
      logger.warn(`Video wall sync drift detected: ${drift}s`, {
        deviceId,
        videoWallId
      });

      // Trigger resync
      this.io.to(deviceId).emit('videowall/resync', {
        videoWallId,
        targetPosition: expectedPosition
      });
    }
  }

  /**
   * Get video wall info
   */
  getVideoWall(videoWallId) {
    return this.videoWalls.get(videoWallId);
  }

  /**
   * List all video walls
   */
  listVideoWalls() {
    return Array.from(this.videoWalls.values());
  }

  /**
   * Delete video wall
   */
  deleteVideoWall(videoWallId) {
    const videoWall = this.videoWalls.get(videoWallId);
    
    if (videoWall) {
      // Stop playback first
      if (videoWall.playbackState === 'playing') {
        this.stop(videoWallId);
      }

      // Clear sync check interval
      if (videoWall.syncCheckInterval) {
        clearInterval(videoWall.syncCheckInterval);
      }

      this.videoWalls.delete(videoWallId);
      logger.info(`Video wall deleted: ${videoWall.name}`);
    }
  }
}

export default VideoWallManager;

