import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Enable default metrics collection (CPU, memory, etc.)
collectDefaultMetrics({
  prefix: 'videocontrol_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// HTTP request metrics
export const httpRequestDuration = new Histogram({
  name: 'videocontrol_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const httpRequestTotal = new Counter({
  name: 'videocontrol_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Device metrics
export const devicesOnline = new Gauge({
  name: 'videocontrol_devices_online',
  help: 'Number of devices currently online',
});

export const devicesTotal = new Gauge({
  name: 'videocontrol_devices_total',
  help: 'Total number of registered devices',
});

export const deviceStatusChanges = new Counter({
  name: 'videocontrol_device_status_changes_total',
  help: 'Total number of device status changes',
  labelNames: ['device_id', 'old_status', 'new_status'],
});

// File metrics
export const fileUploads = new Counter({
  name: 'videocontrol_file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['device_id', 'file_type'],
});

export const fileUploadSize = new Histogram({
  name: 'videocontrol_file_upload_size_bytes',
  help: 'Size of uploaded files in bytes',
  labelNames: ['file_type'],
  buckets: [1024, 10240, 102400, 1024000, 10240000, 102400000, 1024000000],
});

export const fileDeletes = new Counter({
  name: 'videocontrol_file_deletes_total',
  help: 'Total number of file deletions',
  labelNames: ['device_id'],
});

// Video optimization metrics
export const videoOptimizations = new Counter({
  name: 'videocontrol_video_optimizations_total',
  help: 'Total number of video optimizations',
  labelNames: ['device_id', 'status'],
});

export const videoOptimizationDuration = new Histogram({
  name: 'videocontrol_video_optimization_duration_seconds',
  help: 'Duration of video optimization in seconds',
  labelNames: ['device_id'],
  buckets: [10, 30, 60, 120, 300, 600, 1800],
});

// Socket.IO metrics
export const socketConnections = new Gauge({
  name: 'videocontrol_socket_connections',
  help: 'Number of active Socket.IO connections',
});

export const socketEvents = new Counter({
  name: 'videocontrol_socket_events_total',
  help: 'Total number of Socket.IO events',
  labelNames: ['event_type', 'device_id'],
});

// Player control metrics
export const playerCommands = new Counter({
  name: 'videocontrol_player_commands_total',
  help: 'Total number of player commands sent',
  labelNames: ['command', 'device_id'],
});

// Authentication metrics
export const authAttempts = new Counter({
  name: 'videocontrol_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'result'],
});

export const activeSessions = new Gauge({
  name: 'videocontrol_active_sessions',
  help: 'Number of active user sessions',
});

// Database metrics
export const databaseQueries = new Counter({
  name: 'videocontrol_database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'model'],
});

export const databaseQueryDuration = new Histogram({
  name: 'videocontrol_database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

// Error metrics
export const errors = new Counter({
  name: 'videocontrol_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'severity'],
});

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics() {
  return await register.metrics();
}

/**
 * Get metrics in JSON format
 */
export async function getMetricsJSON() {
  return await register.getMetricsAsJSON();
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics() {
  register.resetMetrics();
}

export { register };
export default {
  httpRequestDuration,
  httpRequestTotal,
  devicesOnline,
  devicesTotal,
  fileUploads,
  socketConnections,
  getMetrics,
  getMetricsJSON,
  resetMetrics,
};

