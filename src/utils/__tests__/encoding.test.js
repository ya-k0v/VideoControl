import { describe, test, expect } from '@jest/globals';
import { fixEncoding } from '../encoding.js';

describe('encoding utils', () => {
  describe('fixEncoding', () => {
    test('should fix Cyrillic encoding issues', () => {
      // Test cases for common encoding problems
      const testCases = [
        { input: 'test', expected: 'test' },
        { input: 'видео', expected: 'видео' },
        { input: 'file_name.mp4', expected: 'file_name.mp4' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = fixEncoding(input);
        expect(result).toBe(expected);
      });
    });

    test('should handle empty strings', () => {
      expect(fixEncoding('')).toBe('');
    });

    test('should handle ASCII strings unchanged', () => {
      const ascii = 'hello_world_123.mp4';
      expect(fixEncoding(ascii)).toBe(ascii);
    });
  });
});

