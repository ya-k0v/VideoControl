import getPrismaClient from '../prisma-client.js';

/**
 * Playlist Repository
 */
export class PlaylistRepository {
  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Create new playlist
   */
  async create(data) {
    return await this.prisma.playlist.create({
      data: {
        name: data.name,
        description: data.description,
        loop: data.loop !== undefined ? data.loop : true,
        shuffle: data.shuffle !== undefined ? data.shuffle : false,
        schedule: data.schedule || null
      },
      include: {
        items: {
          include: { file: true },
          orderBy: { order: 'asc' }
        }
      }
    });
  }

  /**
   * Find all playlists
   */
  async findAll() {
    return await this.prisma.playlist.findMany({
      include: {
        items: {
          include: { file: true },
          orderBy: { order: 'asc' }
        },
        devices: {
          include: { device: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Find playlist by ID
   */
  async findById(playlistId) {
    return await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        items: {
          include: { file: true },
          orderBy: { order: 'asc' }
        },
        devices: {
          include: { device: true }
        }
      }
    });
  }

  /**
   * Update playlist
   */
  async update(playlistId, data) {
    return await this.prisma.playlist.update({
      where: { id: playlistId },
      data,
      include: {
        items: {
          include: { file: true },
          orderBy: { order: 'asc' }
        }
      }
    });
  }

  /**
   * Delete playlist
   */
  async delete(playlistId) {
    return await this.prisma.playlist.delete({
      where: { id: playlistId }
    });
  }

  /**
   * Add item to playlist
   */
  async addItem(playlistId, fileId, order, duration = null) {
    return await this.prisma.playlistItem.create({
      data: {
        playlistId,
        fileId,
        order,
        duration
      },
      include: { file: true }
    });
  }

  /**
   * Remove item from playlist
   */
  async removeItem(playlistItemId) {
    return await this.prisma.playlistItem.delete({
      where: { id: playlistItemId }
    });
  }

  /**
   * Reorder playlist items
   */
  async reorderItems(playlistId, itemOrders) {
    const updates = itemOrders.map(({ itemId, order }) =>
      this.prisma.playlistItem.update({
        where: { id: itemId },
        data: { order }
      })
    );
    return await this.prisma.$transaction(updates);
  }

  /**
   * Assign playlist to device
   */
  async assignToDevice(playlistId, deviceId, priority = 0) {
    return await this.prisma.playlistDevice.create({
      data: {
        playlistId,
        deviceId,
        priority,
        active: true
      }
    });
  }

  /**
   * Unassign playlist from device
   */
  async unassignFromDevice(playlistId, deviceId) {
    return await this.prisma.playlistDevice.delete({
      where: {
        playlistId_deviceId: {
          playlistId,
          deviceId
        }
      }
    });
  }

  /**
   * Get active playlists for device
   */
  async getDevicePlaylists(deviceId) {
    return await this.prisma.playlistDevice.findMany({
      where: {
        deviceId,
        active: true
      },
      include: {
        playlist: {
          include: {
            items: {
              include: { file: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      },
      orderBy: { priority: 'desc' }
    });
  }

  /**
   * Get playlists with schedule
   */
  async getScheduledPlaylists() {
    return await this.prisma.playlist.findMany({
      where: {
        schedule: {
          not: null
        }
      },
      include: {
        items: {
          include: { file: true },
          orderBy: { order: 'asc' }
        },
        devices: {
          where: { active: true },
          include: { device: true }
        }
      }
    });
  }
}

export default new PlaylistRepository();

