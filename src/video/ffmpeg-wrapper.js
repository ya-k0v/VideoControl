/**
 * Обертка для работы с FFmpeg/FFprobe
 * @module video/ffmpeg-wrapper
 */

import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

/**
 * Проверка параметров видео через ffprobe
 * @param {string} filePath - Путь к видео файлу
 * @returns {Promise<Object|null>} Параметры видео или null при ошибке
 */
export async function checkVideoParameters(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate,profile,level -of json "${filePath}"`
    );
    
    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];
    
    if (!stream) return null;
    
    // Парсим frame rate (например "25/1" -> 25)
    let fps = 0;
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      fps = den ? num / den : num;
    }
    
    return {
      codec: stream.codec_name,
      width: stream.width || 0,
      height: stream.height || 0,
      fps: Math.round(fps),
      bitrate: parseInt(stream.bit_rate) || 0,
      profile: stream.profile || 'unknown',
      level: stream.level || 0
    };
  } catch (error) {
    console.error(`[VideoOpt] ❌ Ошибка ffprobe: ${error.message}`);
    return null;
  }
}

