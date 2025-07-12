#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Run the TypeScript file using tsx
const mainPath = path.join(__dirname, 'main.ts');
try {
  execSync(`npx tsx "${mainPath}" ${process.argv.slice(2).join(' ')}`, { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
} catch (error) {
  process.exit(error.status || 1);
}