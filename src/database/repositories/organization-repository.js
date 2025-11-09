import getPrismaClient from '../prisma-client.js';

/**
 * Organization Repository
 */
export class OrganizationRepository {
  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Create new organization
   */
  async create(data) {
    return await this.prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        plan: data.plan || 'FREE',
        maxDevices: data.maxDevices || 5,
        maxUsers: data.maxUsers || 3,
        settings: data.settings || {}
      }
    });
  }

  /**
   * Find all organizations
   */
  async findAll() {
    return await this.prisma.organization.findMany({
      include: {
        _count: {
          select: {
            users: true,
            devices: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Find organization by ID
   */
  async findById(organizationId) {
    return await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isActive: true
          }
        },
        devices: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true
          }
        },
        _count: {
          select: {
            users: true,
            devices: true
          }
        }
      }
    });
  }

  /**
   * Find organization by slug
   */
  async findBySlug(slug) {
    return await this.prisma.organization.findUnique({
      where: { slug }
    });
  }

  /**
   * Update organization
   */
  async update(organizationId, data) {
    return await this.prisma.organization.update({
      where: { id: organizationId },
      data
    });
  }

  /**
   * Delete organization
   */
  async delete(organizationId) {
    return await this.prisma.organization.delete({
      where: { id: organizationId }
    });
  }

  /**
   * Check if organization can add more devices
   */
  async canAddDevice(organizationId) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { devices: true }
        }
      }
    });

    return org && org._count.devices < org.maxDevices;
  }

  /**
   * Check if organization can add more users
   */
  async canAddUser(organizationId) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    return org && org._count.users < org.maxUsers;
  }

  /**
   * Get organization usage stats
   */
  async getUsageStats(organizationId) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            users: true,
            devices: true,
            apiKeys: true
          }
        }
      }
    });

    if (!org) return null;

    // Get total file size
    const files = await this.prisma.file.findMany({
      where: {
        device: {
          organizationId
        }
      },
      select: {
        fileSize: true
      }
    });

    const totalStorage = files.reduce((sum, file) => sum + file.fileSize, 0);

    return {
      users: {
        count: org._count.users,
        max: org.maxUsers,
        percentage: (org._count.users / org.maxUsers) * 100
      },
      devices: {
        count: org._count.devices,
        max: org.maxDevices,
        percentage: (org._count.devices / org.maxDevices) * 100
      },
      apiKeys: {
        count: org._count.apiKeys
      },
      storage: {
        used: totalStorage,
        usedFormatted: this.formatBytes(totalStorage)
      }
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export default new OrganizationRepository();

