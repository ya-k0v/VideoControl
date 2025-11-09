/**
 * Migration script to migrate data from JSON files to database
 * Run with: node src/database/migration/migrate-from-json.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import getPrismaClient from '../prisma-client.js';
import { DEVICES as DEVICES_PATH } from '../../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = getPrismaClient();

/**
 * Load JSON devices file
 */
function loadDevicesJson() {
  try {
    const devicesPath = path.join(process.cwd(), 'config', 'devices.json');
    if (fs.existsSync(devicesPath)) {
      const data = fs.readFileSync(devicesPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading devices.json:', error.message);
  }
  return {};
}

/**
 * Load file-names-map.json
 */
function loadFileNamesMap() {
  try {
    const mapPath = path.join(process.cwd(), 'config', 'file-names-map.json');
    if (fs.existsSync(mapPath)) {
      const data = fs.readFileSync(mapPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading file-names-map.json:', error.message);
  }
  return {};
}

/**
 * Migrate devices from JSON to database
 */
async function migrateDevices(jsonDevices) {
  console.log('\n📱 Migrating devices...');
  let migratedCount = 0;
  let errorCount = 0;

  for (const [deviceId, deviceData] of Object.entries(jsonDevices)) {
    try {
      // Check if device already exists
      const existing = await prisma.device.findUnique({
        where: { id: deviceId }
      });

      if (existing) {
        console.log(`  ⏭️  Device ${deviceId} already exists, skipping...`);
        continue;
      }

      // Create device
      await prisma.device.create({
        data: {
          id: deviceId,
          name: deviceData.name || deviceId,
          type: deviceData.type || 'DISPLAY',
          status: 'OFFLINE',
          placeholder: deviceData.placeholder || null,
          metadata: deviceData.metadata || {}
        }
      });

      migratedCount++;
      console.log(`  ✅ Migrated device: ${deviceId}`);
    } catch (error) {
      errorCount++;
      console.error(`  ❌ Error migrating device ${deviceId}:`, error.message);
    }
  }

  console.log(`\n📊 Devices: ${migratedCount} migrated, ${errorCount} errors`);
  return { migratedCount, errorCount };
}

/**
 * Migrate files from filesystem to database
 */
async function migrateFiles(jsonDevices) {
  console.log('\n📄 Migrating files...');
  let migratedCount = 0;
  let errorCount = 0;

  for (const [deviceId, deviceData] of Object.entries(jsonDevices)) {
    if (!deviceData.files || !Array.isArray(deviceData.files)) {
      continue;
    }

    for (const file of deviceData.files) {
      try {
        // Check if file already exists
        const existing = await prisma.file.findUnique({
          where: {
            deviceId_fileName: {
              deviceId,
              fileName: file.name
            }
          }
        });

        if (existing) {
          continue;
        }

        // Determine file type from extension
        const ext = path.extname(file.name).toLowerCase();
        let fileType = 'unknown';
        if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
          fileType = 'video';
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          fileType = 'image';
        } else if (ext === '.pdf') {
          fileType = 'pdf';
        } else if (['.pptx', '.ppt'].includes(ext)) {
          fileType = 'pptx';
        }

        // Get file size
        const filePath = path.join(DEVICES_PATH, deviceId, file.name);
        let fileSize = 0;
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          fileSize = stats.size;
        }

        // Create file record
        await prisma.file.create({
          data: {
            deviceId,
            fileName: file.name,
            displayName: file.displayName || file.name,
            fileType,
            fileSize,
            duration: file.duration,
            resolution: file.resolution,
            optimized: file.optimized || false
          }
        });

        migratedCount++;
        console.log(`  ✅ Migrated file: ${deviceId}/${file.name}`);
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error migrating file ${deviceId}/${file.name}:`, error.message);
      }
    }
  }

  console.log(`\n📊 Files: ${migratedCount} migrated, ${errorCount} errors`);
  return { migratedCount, errorCount };
}

/**
 * Migrate file names map
 */
async function migrateFileNamesMap(fileNamesMap) {
  console.log('\n🗺️  Migrating file names map...');
  let migratedCount = 0;
  let errorCount = 0;

  for (const [originalName, sanitizedName] of Object.entries(fileNamesMap)) {
    try {
      // Check if already exists
      const existing = await prisma.fileNameMap.findUnique({
        where: { originalName }
      });

      if (existing) {
        continue;
      }

      await prisma.fileNameMap.create({
        data: {
          originalName,
          sanitizedName
        }
      });

      migratedCount++;
    } catch (error) {
      errorCount++;
      console.error(`  ❌ Error migrating mapping ${originalName}:`, error.message);
    }
  }

  console.log(`\n📊 File name mappings: ${migratedCount} migrated, ${errorCount} errors`);
  return { migratedCount, errorCount };
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting migration from JSON to database...\n');

  try {
    // Load JSON data
    console.log('📖 Loading JSON data...');
    const jsonDevices = loadDevicesJson();
    const fileNamesMap = loadFileNamesMap();

    console.log(`  Found ${Object.keys(jsonDevices).length} devices in JSON`);
    console.log(`  Found ${Object.keys(fileNamesMap).length} file name mappings`);

    // Run migrations
    const devicesResult = await migrateDevices(jsonDevices);
    const filesResult = await migrateFiles(jsonDevices);
    const mappingsResult = await migrateFileNamesMap(fileNamesMap);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(50));
    console.log(`Devices:  ${devicesResult.migratedCount} migrated, ${devicesResult.errorCount} errors`);
    console.log(`Files:    ${filesResult.migratedCount} migrated, ${filesResult.errorCount} errors`);
    console.log(`Mappings: ${mappingsResult.migratedCount} migrated, ${mappingsResult.errorCount} errors`);
    console.log('='.repeat(50));

    console.log('\n✅ Migration completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Backup your JSON files: cp config/devices.json config/devices.json.backup');
    console.log('   2. Test the application with database');
    console.log('   3. If everything works, you can remove JSON storage code');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export { runMigration };

