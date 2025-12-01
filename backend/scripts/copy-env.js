const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const destPath = path.join(root, '.env');

if (!fs.existsSync(examplePath)) {
  console.error('.env.example not found');
  process.exit(1);
}

try {
  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(examplePath, destPath);
    console.log('✅ .env file created from .env.example');
  } else {
    console.log('ℹ️ .env already exists — not overwriting.');
  }
} catch (err) {
  console.error('Error creating .env:', err);
  process.exit(1);
}
