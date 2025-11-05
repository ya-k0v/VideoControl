#!/usr/bin/env node

/**
 * Generate PNG favicons from SVG icon
 * 
 * This script converts icon.svg to various PNG sizes for web favicons
 */

const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const sizes = [
  { size: 16, name: 'favicon-16.png' },
  { size: 32, name: 'favicon-32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' }
];

const svgPath = path.join(__dirname, '..', 'icon.svg');
const outputDir = path.join(__dirname, '..', 'public');

console.log('🎨 Generating favicons from icon.svg...\n');

// Check if SVG exists
if (!fs.existsSync(svgPath)) {
  console.error('❌ Error: icon.svg not found!');
  process.exit(1);
}

// Check for available conversion tools
function checkTool(command) {
  return new Promise((resolve) => {
    const proc = spawn('which', [command]);
    proc.on('close', (code) => resolve(code === 0));
  });
}

async function convertWithConvert(size, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-background', 'none',
      svgPath,
      '-resize', `${size}x${size}`,
      outputPath
    ];
    
    const proc = spawn('convert', args);
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`convert failed with code ${code}`));
      }
    });
  });
}

async function convertWithInkscape(size, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      svgPath,
      '-w', size.toString(),
      '-h', size.toString(),
      '-o', outputPath
    ];
    
    const proc = spawn('inkscape', args);
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`inkscape failed with code ${code}`));
      }
    });
  });
}

async function main() {
  const hasConvert = await checkTool('convert');
  const hasInkscape = await checkTool('inkscape');
  
  if (!hasConvert && !hasInkscape) {
    console.error('❌ Error: Neither ImageMagick (convert) nor Inkscape found!');
    console.error('\nPlease install one of them:');
    console.error('  - ImageMagick: sudo apt-get install imagemagick');
    console.error('  - Inkscape: sudo apt-get install inkscape');
    console.error('\nOr use online converter: https://convertio.co/svg-png/');
    process.exit(1);
  }
  
  const converter = hasConvert ? 'convert' : 'inkscape';
  console.log(`✅ Using ${converter} for conversion\n`);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Convert each size
  for (const { size, name } of sizes) {
    const outputPath = path.join(outputDir, name);
    
    try {
      if (hasConvert) {
        await convertWithConvert(size, outputPath);
      } else {
        await convertWithInkscape(size, outputPath);
      }
      console.log(`✅ Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`❌ Failed to generate ${name}:`, error.message);
    }
  }
  
  console.log('\n🎉 Done! Favicons generated in public/ directory');
}

main().catch(console.error);

