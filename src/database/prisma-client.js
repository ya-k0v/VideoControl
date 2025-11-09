import { PrismaClient } from '@prisma/client';

// Singleton instance of Prisma Client
let prisma;

/**
 * Get Prisma Client instance (singleton)
 */
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    });
  }
  return prisma;
}

/**
 * Disconnect Prisma Client
 */
export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseConnection() {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return { status: 'ok', message: 'Database connection successful' };
  } catch (error) {
    return { 
      status: 'error', 
      message: 'Database connection failed',
      error: error.message 
    };
  }
}

export default getPrismaClient;

