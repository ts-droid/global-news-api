const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '../package.json');
const serverPath = path.join(__dirname, '../server.js');

// 1. Update package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
const versionParts = oldVersion.split('.').map(Number);
versionParts[2] += 1; // Bump patch
const newVersion = versionParts.join('.');
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2. Update server.js
let serverContent = fs.readFileSync(serverPath, 'utf8');
serverContent = serverContent.replace(/version: '[0-9.]+'/, `version: '${newVersion}'`);
fs.writeFileSync(serverPath, serverContent);

console.log(`✓ Version bumped: ${oldVersion} -> ${newVersion}`);
