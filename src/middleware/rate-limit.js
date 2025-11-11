/**
 * Rate Limiting - защита от DDoS и brute-force
 * @module middleware/rate-limit
 */

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

/**
 * Глобальный rate limiter для всех API запросов
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // 1000 запросов с одного IP
  message: { error: 'Too many requests from this IP, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

/**
 * Строгий limiter для upload
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 upload за 15 минут
  message: { error: 'Too many uploads, please try again later' },
  skipSuccessfulRequests: true
});

/**
 * Auth limiter - защита от brute force
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 попыток входа за 15 минут
  message: { error: 'Too many login attempts, please try again later' },
  skipSuccessfulRequests: true, // Успешные логины не считаем
  skipFailedRequests: false
});

/**
 * Speed limiter для API (замедляет после N запросов)
 */
export const apiSpeedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 100, // После 100 запросов начинаем замедлять
  delayMs: () => 500, // Фиксированная задержка 500ms
  maxDelayMs: 20000, // Максимум 20 секунд задержки
  validate: { delayMs: false } // Отключаем warning
});

/**
 * Limiter для операций удаления
 */
export const deleteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 минут
  max: 20, // Максимум 20 удалений за 5 минут
  message: { error: 'Too many delete operations' }
});

/**
 * Limiter для создания ресурсов
 */
export const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 созданий за 15 минут
  message: { error: 'Too many create operations' }
});

