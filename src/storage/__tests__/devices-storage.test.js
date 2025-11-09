import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { loadDevicesJson, saveDevicesJson } from '../devices-storage.js';
import fs from 'fs';

// Mock fs module
jest.mock('fs');

describe('devices-storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadDevicesJson', () => {
    test('should load devices from JSON file', () => {
      const mockDevices = {
        device1: { name: 'Test Device 1', files: [] },
        device2: { name: 'Test Device 2', files: [] }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockDevices));

      const devices = loadDevicesJson();
      expect(devices).toEqual(mockDevices);
    });

    test('should return empty object if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const devices = loadDevicesJson();
      expect(devices).toEqual({});
    });

    test('should handle corrupted JSON gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json {');

      const devices = loadDevicesJson();
      expect(devices).toEqual({});
    });
  });

  describe('saveDevicesJson', () => {
    test('should save devices to JSON file', () => {
      const devices = {
        device1: { name: 'Test Device 1', files: [] }
      };

      saveDevicesJson(devices);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(devices, null, 2),
        'utf-8'
      );
    });

    test('should handle write errors gracefully', () => {
      const devices = { device1: {} };
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });

      // Should not throw
      expect(() => saveDevicesJson(devices)).not.toThrow();
    });
  });
});

