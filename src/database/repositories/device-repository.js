import getPrismaClient from '../prisma-client.js';

/**
 * Device Repository - handles all device database operations
 */
export class DeviceRepository {
  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Get all devices
   */
  async findAll() {
    return await this.prisma.device.findMany({
      include: {
        files: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  /**
   * Get device by ID
   */
  async findById(deviceId) {
    return await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        files: {
          orderBy: { createdAt: 'desc' }
        },
        playlists: {
          include: {
            playlist: {
              include: {
                items: {
                  include: {
                    file: true
                  },
                  orderBy: { order: 'asc' }
                }
              }
            }
          }
        }
      }
    });
  }

  /**
   * Create new device
   */
  async create(data) {
    return await this.prisma.device.create({
      data: {
        id: data.id,
        name: data.name,
        type: data.type || 'DISPLAY',
        status: 'OFFLINE',
        metadata: data.metadata || {}
      }
    });
  }

  /**
   * Update device
   */
  async update(deviceId, data) {
    return await this.prisma.device.update({
      where: { id: deviceId },
      data
    });
  }

  /**
   * Delete device
   */
  async delete(deviceId) {
    return await this.prisma.device.delete({
      where: { id: deviceId }
    });
  }

  /**
   * Update device status and lastSeen
   */
  async updateStatus(deviceId, status) {
    return await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status,
        lastSeen: new Date()
      }
    });
  }

  /**
   * Set device placeholder
   */
  async setPlaceholder(deviceId, placeholder) {
    return await this.prisma.device.update({
      where: { id: deviceId },
      data: { placeholder }
    });
  }

  /**
   * Get device files
   */
  async getFiles(deviceId) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        files: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    return device?.files || [];
  }
}

export default new DeviceRepository();

