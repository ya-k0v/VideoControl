import { httpRequestDuration, httpRequestTotal } from '../monitoring/metrics.js';
import logger from '../monitoring/logger.js';

/**
 * Middleware to collect HTTP metrics
 */
export function metricsMiddleware(req, res, next) {
  const start = Date.now();

  // Capture response finish event
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Record metrics
    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );

    httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });

    // Log request
    logger.http(`${method} ${req.originalUrl} ${statusCode} - ${duration.toFixed(3)}s`);
  });

  next();
}

/**
 * Error handler middleware with metrics
 */
export function errorMetricsMiddleware(err, req, res, next) {
  // Log error
  logger.error(`Error in ${req.method} ${req.originalUrl}:`, {
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Record error metric
  const { errors } = await import('../monitoring/metrics.js');
  errors.inc({
    type: err.name || 'UnknownError',
    severity: err.severity || 'error',
  });

  // Send error response
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
}

export default {
  metricsMiddleware,
  errorMetricsMiddleware,
};

