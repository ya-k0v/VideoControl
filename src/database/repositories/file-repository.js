import getPrismaClient from '../prisma-client.js';

/**
 * File Repository - handles all file database operations
 */
export class FileRepository {
  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Create new file record
   */
  async create(data) {
    return await this.prisma.file.create({
      data: {
        deviceId: data.deviceId,
        fileName: data.fileName,
        displayName: data.displayName || data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        duration: data.duration,
        resolution: data.resolution,
        optimized: data.optimized || false,
        conversionStatus: data.conversionStatus
      }
    });
  }

  /**
   * Find file by device and filename
   */
  async findByDeviceAndName(deviceId, fileName) {
    return await this.prisma.file.findUnique({
      where: {
        deviceId_fileName: {
          deviceId,
          fileName
        }
      }
    });
  }

  /**
   * Find all files for a device
   */
  async findByDevice(deviceId) {
    return await this.prisma.file.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Update file
   */
  async update(fileId, data) {
    return await this.prisma.file.update({
      where: { id: fileId },
      data
    });
  }

  /**
   * Update file by device and name
   */
  async updateByDeviceAndName(deviceId, fileName, data) {
    return await this.prisma.file.update({
      where: {
        deviceId_fileName: {
          deviceId,
          fileName
        }
      },
      data
    });
  }

  /**
   * Delete file
   */
  async delete(fileId) {
    return await this.prisma.file.delete({
      where: { id: fileId }
    });
  }

  /**
   * Delete file by device and name
   */
  async deleteByDeviceAndName(deviceId, fileName) {
    return await this.prisma.file.delete({
      where: {
        deviceId_fileName: {
          deviceId,
          fileName
        }
      }
    });
  }

  /**
   * Get files by type
   */
  async findByType(fileType) {
    return await this.prisma.file.findMany({
      where: { fileType },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get files needing optimization
   */
  async findNeedingOptimization() {
    return await this.prisma.file.findMany({
      where: {
        fileType: 'video',
        optimized: false,
        conversionStatus: null
      }
    });
  }
}

export default new FileRepository();

