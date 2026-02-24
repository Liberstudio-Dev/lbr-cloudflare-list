import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PackageJson {
  version: string;
}

const pkgPath = resolve(__dirname, '../../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;

let [major, minor, patch] = pkg.version.split('.').map(Number);

// Incremento patch
patch += 1;

// Gestione rollover
if (patch >= 10) {
  minor += Math.floor(patch / 10);
  patch = patch % 10;
}

if (minor >= 10) {
  major += Math.floor(minor / 10);
  minor = minor % 10;
}

// Ricostruzione versione
pkg.version = `${major}.${minor}.${patch}`;

// Scrittura package.json
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Version updated to ${pkg.version}`);
