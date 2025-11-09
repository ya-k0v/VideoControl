/**
 * System Information API
 * Предоставляет информацию о состоянии сервера
 */
import express from 'express';
import os from 'os';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export function createSystemInfoRouter() {
  const router = express.Router();

  /**
   * GET /api/system/info - Получить информацию о системе
   */
  router.get('/info', async (req, res) => {
    try {
      const systemInfo = await getSystemInfo();
      res.json(systemInfo);
    } catch (error) {
      console.error('Error getting system info:', error);
      res.status(500).json({ error: 'Failed to get system info' });
    }
  });

  return router;
}

/**
 * Получить информацию о CPU
 */
function getCPUInfo() {
  const cpus = os.cpus();
  const cpuCount = cpus.length;
  
  // Вычисляем загрузку CPU
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpuCount;
  const total = totalTick / cpuCount;
  const usage = 100 - ~~(100 * idle / total);

  return {
    count: cpuCount,
    model: cpus[0].model,
    speed: cpus[0].speed,
    usage: usage,
    loadAverage: os.loadavg()
  };
}

/**
 * Получить информацию о памяти
 */
function getMemoryInfo() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercent = (usedMemory / totalMemory) * 100;

  // Информация о процессе Node.js
  const processMemory = process.memoryUsage();

  return {
    total: totalMemory,
    free: freeMemory,
    used: usedMemory,
    usagePercent: usagePercent.toFixed(2),
    totalFormatted: formatBytes(totalMemory),
    freeFormatted: formatBytes(freeMemory),
    usedFormatted: formatBytes(usedMemory),
    process: {
      rss: processMemory.rss,
      heapTotal: processMemory.heapTotal,
      heapUsed: processMemory.heapUsed,
      external: processMemory.external,
      rssFormatted: formatBytes(processMemory.rss),
      heapUsedFormatted: formatBytes(processMemory.heapUsed)
    }
  };
}

/**
 * Получить информацию о диске
 */
async function getDiskInfo() {
  try {
    // Для Linux/Mac
    if (process.platform !== 'win32') {
      const { stdout } = await execAsync('df -k / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      
      const total = parseInt(parts[1]) * 1024; // KB to bytes
      const used = parseInt(parts[2]) * 1024;
      const available = parseInt(parts[3]) * 1024;
      const usagePercent = parseInt(parts[4]);

      return {
        total,
        used,
        available,
        usagePercent,
        totalFormatted: formatBytes(total),
        usedFormatted: formatBytes(used),
        availableFormatted: formatBytes(available),
        filesystem: parts[0],
        mountPoint: parts[5] || '/'
      };
    } else {
      // Для Windows
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
      const lines = stdout.trim().split('\n');
      const data = lines[1].trim().split(/\s+/);
      
      const available = parseInt(data[1]);
      const total = parseInt(data[2]);
      const used = total - available;
      const usagePercent = ((used / total) * 100).toFixed(2);

      return {
        total,
        used,
        available,
        usagePercent,
        totalFormatted: formatBytes(total),
        usedFormatted: formatBytes(used),
        availableFormatted: formatBytes(available),
        drive: data[0]
      };
    }
  } catch (error) {
    console.error('Error getting disk info:', error);
    return {
      total: 0,
      used: 0,
      available: 0,
      usagePercent: 0,
      error: 'Failed to get disk info'
    };
  }
}

/**
 * Получить информацию о системе
 */
async function getSystemInfo() {
  const cpu = getCPUInfo();
  const memory = getMemoryInfo();
  const disk = await getDiskInfo();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    uptimeFormatted: formatUptime(os.uptime()),
    nodeVersion: process.version,
    processUptime: process.uptime(),
    processUptimeFormatted: formatUptime(process.uptime()),
    cpu,
    memory,
    disk,
    timestamp: new Date().toISOString()
  };
}

/**
 * Форматировать байты в читаемый вид
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Форматировать uptime
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}с`);

  return parts.join(' ');
}

export default createSystemInfoRouter;

