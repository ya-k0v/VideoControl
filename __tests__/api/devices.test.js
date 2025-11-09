import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createDevicesRouter } from '../../src/routes/devices.js';

describe('Devices API', () => {
  let app;
  let mockDevices;
  let mockIo;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock dependencies
    mockDevices = {
      device1: {
        id: 'device1',
        name: 'Test Device 1',
        files: []
      }
    };

    mockIo = {
      emit: jest.fn()
    };

    const saveDevicesJson = jest.fn();
    const fileNamesMap = {};
    const saveFileNamesMap = jest.fn();

    const devicesRouter = createDevicesRouter({
      devices: mockDevices,
      io: mockIo,
      saveDevicesJson,
      fileNamesMap,
      saveFileNamesMap
    });

    app.use('/api/devices', devicesRouter);
  });

  describe('GET /api/devices', () => {
    test('should return all devices', async () => {
      const response = await request(app)
        .get('/api/devices')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('device1');
      expect(response.body.device1.name).toBe('Test Device 1');
    });
  });

  describe('GET /api/devices/:device_id', () => {
    test('should return single device', async () => {
      const response = await request(app)
        .get('/api/devices/device1')
        .expect(200);

      expect(response.body.id).toBe('device1');
      expect(response.body.name).toBe('Test Device 1');
    });

    test('should return 404 for non-existent device', async () => {
      await request(app)
        .get('/api/devices/nonexistent')
        .expect(404);
    });
  });

  describe('POST /api/devices', () => {
    test('should create new device', async () => {
      const newDevice = {
        id: 'device2',
        name: 'New Device'
      };

      const response = await request(app)
        .post('/api/devices')
        .send(newDevice)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(mockIo.emit).toHaveBeenCalled();
    });

    test('should reject device without ID', async () => {
      await request(app)
        .post('/api/devices')
        .send({ name: 'No ID Device' })
        .expect(400);
    });
  });
});

