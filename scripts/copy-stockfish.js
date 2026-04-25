const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pkgDir = path.join(root, 'node_modules', 'stockfish');
const destDir = path.join(root, 'public', 'vendor');

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

const files = [
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm',
];

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const from = findFile(pkgDir, file);
  const to = path.join(destDir, file);

  if (!from) {
    console.error(`Missing ${file} somewhere inside ${pkgDir}`);
    process.exit(1);
  }

  fs.copyFileSync(from, to);
  console.log(`Copied ${file}`);
}
