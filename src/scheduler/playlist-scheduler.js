import cron from 'node-cron';
import playlistRepository from '../database/repositories/playlist-repository.js';
import logger from '../monitoring/logger.js';

/**
 * Playlist Scheduler
 * Handles scheduled playlist playback based on cron expressions or time ranges
 */
export class PlaylistScheduler {
  constructor(io) {
    this.io = io;
    this.scheduledTasks = new Map();
    this.running = false;
  }

  /**
   * Start the scheduler
   */
  async start() {
    if (this.running) {
      logger.warn('Playlist scheduler is already running');
      return;
    }

    this.running = true;
    logger.info('Starting playlist scheduler...');

    // Load all scheduled playlists
    await this.loadScheduledPlaylists();

    // Check for schedule updates every minute
    this.scheduleChecker = cron.schedule('* * * * *', async () => {
      await this.loadScheduledPlaylists();
    });

    logger.info('Playlist scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    logger.info('Stopping playlist scheduler...');

    // Stop all scheduled tasks
    for (const [playlistId, task] of this.scheduledTasks.entries()) {
      task.stop();
      logger.debug(`Stopped scheduled task for playlist: ${playlistId}`);
    }

    this.scheduledTasks.clear();

    // Stop the schedule checker
    if (this.scheduleChecker) {
      this.scheduleChecker.stop();
    }

    logger.info('Playlist scheduler stopped');
  }

  /**
   * Load and schedule all playlists with schedules
   */
  async loadScheduledPlaylists() {
    try {
      const playlists = await playlistRepository.getScheduledPlaylists();

      for (const playlist of playlists) {
        if (!playlist.schedule) continue;

        const scheduleId = playlist.id;

        // If already scheduled, check if schedule has changed
        if (this.scheduledTasks.has(scheduleId)) {
          const existing = this.scheduledTasks.get(scheduleId);
          if (JSON.stringify(existing.schedule) === JSON.stringify(playlist.schedule)) {
            continue; // Schedule hasn't changed
          } else {
            // Schedule changed, remove old task
            existing.task.stop();
            this.scheduledTasks.delete(scheduleId);
          }
        }

        // Schedule the playlist
        this.schedulePlaylist(playlist);
      }

      // Remove tasks for playlists that no longer have schedules
      const currentPlaylistIds = new Set(playlists.map(p => p.id));
      for (const [playlistId, _] of this.scheduledTasks.entries()) {
        if (!currentPlaylistIds.has(playlistId)) {
          const task = this.scheduledTasks.get(playlistId);
          task.task.stop();
          this.scheduledTasks.delete(playlistId);
          logger.info(`Removed schedule for playlist: ${playlistId}`);
        }
      }

    } catch (error) {
      logger.error('Error loading scheduled playlists:', error);
    }
  }

  /**
   * Schedule a single playlist
   */
  schedulePlaylist(playlist) {
    const schedule = playlist.schedule;

    // Support different schedule types
    if (schedule.type === 'cron' && schedule.expression) {
      this.scheduleCronPlaylist(playlist);
    } else if (schedule.type === 'timerange' && schedule.start && schedule.end) {
      this.scheduleTimeRangePlaylist(playlist);
    } else if (schedule.type === 'daily' && schedule.time) {
      this.scheduleDailyPlaylist(playlist);
    } else {
      logger.warn(`Unknown schedule type for playlist ${playlist.id}:`, schedule);
    }
  }

  /**
   * Schedule playlist with cron expression
   */
  scheduleCronPlaylist(playlist) {
    const { expression } = playlist.schedule;

    if (!cron.validate(expression)) {
      logger.error(`Invalid cron expression for playlist ${playlist.id}: ${expression}`);
      return;
    }

    const task = cron.schedule(expression, () => {
      this.executePlaylist(playlist);
    });

    this.scheduledTasks.set(playlist.id, {
      task,
      schedule: playlist.schedule,
      type: 'cron'
    });

    logger.info(`Scheduled cron playlist: ${playlist.name} (${expression})`);
  }

  /**
   * Schedule playlist for specific time range
   */
  scheduleTimeRangePlaylist(playlist) {
    const { start, end, days } = playlist.schedule;

    // Create cron expression from time range
    // Check every minute if current time is within range
    const task = cron.schedule('* * * * *', () => {
      const now = new Date();
      const currentTime = now.toTimeString().substring(0, 5); // HH:MM
      const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

      // Check if current day is in allowed days
      if (days && Array.isArray(days) && !days.includes(currentDay)) {
        return;
      }

      // Check if current time is within range
      if (currentTime >= start && currentTime <= end) {
        this.executePlaylist(playlist);
      }
    });

    this.scheduledTasks.set(playlist.id, {
      task,
      schedule: playlist.schedule,
      type: 'timerange'
    });

    logger.info(`Scheduled time range playlist: ${playlist.name} (${start} - ${end})`);
  }

  /**
   * Schedule playlist daily at specific time
   */
  scheduleDailyPlaylist(playlist) {
    const { time } = playlist.schedule; // Format: "HH:MM"
    const [hour, minute] = time.split(':');

    // Cron expression: minute hour * * *
    const expression = `${minute} ${hour} * * *`;

    const task = cron.schedule(expression, () => {
      this.executePlaylist(playlist);
    });

    this.scheduledTasks.set(playlist.id, {
      task,
      schedule: playlist.schedule,
      type: 'daily'
    });

    logger.info(`Scheduled daily playlist: ${playlist.name} at ${time}`);
  }

  /**
   * Execute playlist on assigned devices
   */
  async executePlaylist(playlist) {
    try {
      logger.info(`Executing scheduled playlist: ${playlist.name} (${playlist.id})`);

      // Get devices assigned to this playlist
      const assignments = playlist.devices || [];

      if (assignments.length === 0) {
        logger.warn(`Playlist ${playlist.id} has no assigned devices`);
        return;
      }

      // Play first item of playlist on each device
      for (const assignment of assignments) {
        if (!assignment.active) continue;

        const device = assignment.device;
        const items = playlist.items || [];

        if (items.length === 0) {
          logger.warn(`Playlist ${playlist.id} has no items`);
          continue;
        }

        // Get first item or random if shuffle
        let itemIndex = 0;
        if (playlist.shuffle) {
          itemIndex = Math.floor(Math.random() * items.length);
        }

        const item = items[itemIndex];
        const file = item.file;

        // Emit player command via Socket.IO
        this.io.to(device.id).emit('player/play', {
          type: file.fileType,
          file: file.fileName,
          playlistId: playlist.id,
          playlistIndex: itemIndex,
          loop: playlist.loop
        });

        logger.info(`Playing ${file.fileName} on device ${device.id} from playlist ${playlist.name}`);
      }

    } catch (error) {
      logger.error(`Error executing playlist ${playlist.id}:`, error);
    }
  }

  /**
   * Get status of all scheduled tasks
   */
  getStatus() {
    const tasks = [];

    for (const [playlistId, taskInfo] of this.scheduledTasks.entries()) {
      tasks.push({
        playlistId,
        type: taskInfo.type,
        schedule: taskInfo.schedule,
        running: this.running
      });
    }

    return {
      running: this.running,
      tasksCount: this.scheduledTasks.size,
      tasks
    };
  }
}

export default PlaylistScheduler;

