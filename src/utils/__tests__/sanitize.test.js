import { describe, test, expect } from '@jest/globals';
import { sanitizeDeviceId, isSystemFile } from '../sanitize.js';

describe('sanitize utils', () => {
  describe('sanitizeDeviceId', () => {
    test('should allow valid device IDs', () => {
      expect(sanitizeDeviceId('device1')).toBe('device1');
      expect(sanitizeDeviceId('Device_123')).toBe('Device_123');
      expect(sanitizeDeviceId('test-device')).toBe('test-device');
    });

    test('should remove invalid characters', () => {
      expect(sanitizeDeviceId('../device')).toBe('device');
      expect(sanitizeDeviceId('device/test')).toBe('devicetest');
      expect(sanitizeDeviceId('device\\test')).toBe('devicetest');
    });

    test('should handle special characters', () => {
      expect(sanitizeDeviceId('device@#$')).toBe('device');
      expect(sanitizeDeviceId('test device')).toBe('testdevice');
    });
  });

  describe('isSystemFile', () => {
    test('should identify system files', () => {
      expect(isSystemFile('.DS_Store')).toBe(true);
      expect(isSystemFile('Thumbs.db')).toBe(true);
      expect(isSystemFile('.gitkeep')).toBe(true);
    });

    test('should allow normal files', () => {
      expect(isSystemFile('video.mp4')).toBe(false);
      expect(isSystemFile('image.jpg')).toBe(false);
      expect(isSystemFile('document.pdf')).toBe(false);
    });
  });
});

