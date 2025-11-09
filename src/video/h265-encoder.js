import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../monitoring/logger.js';
import path from 'path';

const execAsync = promisify(exec);

/**
 * H.265/HEVC Video Encoder for 4K content
 * Provides better compression than H.264 for high-resolution videos
 */
export class H265Encoder {
  constructor(options = {}) {
    this.ffmpegPath = options.ffmpegPath || 'ffmpeg';
    this.preset = options.preset || 'medium'; // ultrafast, fast, medium, slow, veryslow
    this.crf = options.crf || 23; // 0-51, lower = better quality
  }

  /**
   * Encode video to H.265/HEVC
   */
  async encode4K(inputPath, outputPath, options = {}) {
    const {
      resolution = '3840x2160', // 4K UHD
      fps = 30,
      bitrate = '20M',
      audioCodec = 'aac',
      audioBitrate = '256k',
      hwaccel = 'auto' // 'auto', 'nvenc', 'qsv', 'videotoolbox', 'none'
    } = options;

    logger.info(`Encoding video to H.265 4K:`, {
      input: inputPath,
      output: outputPath,
      resolution,
      fps,
      bitrate
    });

    try {
      let encoderParams = [];

      // Hardware acceleration selection
      if (hwaccel === 'auto' || hwaccel === 'nvenc') {
        // NVIDIA GPU acceleration
        encoderParams = [
          '-c:v', 'hevc_nvenc',
          '-preset', 'p4', // p1-p7, higher = slower but better quality
          '-rc', 'vbr',
          '-cq', this.crf.toString(),
          '-b:v', bitrate,
          '-maxrate', bitrate,
          '-bufsize', `${parseInt(bitrate) * 2}M`
        ];
      } else if (hwaccel === 'qsv') {
        // Intel Quick Sync
        encoderParams = [
          '-c:v', 'hevc_qsv',
          '-preset', this.preset,
          '-global_quality', this.crf.toString(),
          '-b:v', bitrate
        ];
      } else if (hwaccel === 'videotoolbox') {
        // Apple VideoToolbox (Mac)
        encoderParams = [
          '-c:v', 'hevc_videotoolbox',
          '-b:v', bitrate,
          '-q:v', '65' // 0-100, higher = better quality
        ];
      } else {
        // Software encoding (CPU)
        encoderParams = [
          '-c:v', 'libx265',
          '-preset', this.preset,
          '-crf', this.crf.toString(),
          '-x265-params', `log-level=error:bframes=4:psy-rd=1:aq-mode=3`
        ];
      }

      const command = [
        this.ffmpegPath,
        '-i', inputPath,
        '-vf', `scale=${resolution}:flags=lanczos,fps=${fps}`,
        ...encoderParams,
        '-c:a', audioCodec,
        '-b:a', audioBitrate,
        '-movflags', '+faststart', // Enable progressive streaming
        '-threads', '0', // Use all available threads
        '-y', // Overwrite output
        outputPath
      ].join(' ');

      logger.debug(`FFmpeg command: ${command}`);

      const startTime = Date.now();
      await execAsync(command);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      logger.info(`✅ H.265 encoding completed in ${duration}s:`, {
        output: outputPath
      });

      return { success: true, outputPath, duration };

    } catch (error) {
      logger.error('H.265 encoding failed:', error);
      throw error;
    }
  }

  /**
   * Encode to multiple 4K HDR formats
   */
  async encodeHDR(inputPath, outputPath, options = {}) {
    const {
      colorSpace = 'bt2020',
      colorTransfer = 'smpte2084', // HDR10
      colorPrimaries = 'bt2020',
      maxCLL = '1000,300' // max content light level, max frame average
    } = options;

    logger.info(`Encoding HDR video:`, {
      input: inputPath,
      output: outputPath
    });

    try {
      const command = [
        this.ffmpegPath,
        '-i', inputPath,
        '-c:v', 'libx265',
        '-preset', this.preset,
        '-crf', this.crf.toString(),
        '-pix_fmt', 'yuv420p10le', // 10-bit color
        `-x265-params`,
        `"colorprim=${colorPrimaries}:transfer=${colorTransfer}:colormatrix=${colorSpace}:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,50):max-cll=${maxCLL}"`,
        '-c:a', 'copy',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ].join(' ');

      await execAsync(command);

      logger.info(`✅ HDR encoding completed:`, { output: outputPath });

      return { success: true, outputPath };

    } catch (error) {
      logger.error('HDR encoding failed:', error);
      throw error;
    }
  }

  /**
   * Check if hardware acceleration is available
   */
  async checkHardwareAccel() {
    const accelerators = {
      nvenc: false,
      qsv: false,
      videotoolbox: false
    };

    try {
      const { stdout } = await execAsync(`${this.ffmpegPath} -encoders`);

      accelerators.nvenc = stdout.includes('hevc_nvenc');
      accelerators.qsv = stdout.includes('hevc_qsv');
      accelerators.videotoolbox = stdout.includes('hevc_videotoolbox');

      logger.info('Hardware acceleration check:', accelerators);

      return accelerators;

    } catch (error) {
      logger.error('Error checking hardware acceleration:', error);
      return accelerators;
    }
  }

  /**
   * Get optimal encoder for system
   */
  async getOptimalEncoder() {
    const accel = await this.checkHardwareAccel();

    if (accel.nvenc) return 'nvenc';
    if (accel.qsv) return 'qsv';
    if (accel.videotoolbox) return 'videotoolbox';

    return 'none'; // Software encoding
  }
}

export default H265Encoder;

