const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pkgDir = path.join(root, 'node_modules', 'stockfish');
const destDir = path.join(root, 'public', 'vendor');

const wanted = [
  {
    from: path.join(pkgDir, 'bin', 'stockfish-18-lite-single.js'),
    to: path.join(destDir, 'stockfish-18-lite-single.js'),
  },
  {
    from: path.join(pkgDir, 'bin', 'stockfish-18-lite-single.wasm'),
    to: path.join(destDir, 'stockfish-18-lite-single.wasm'),
  },
];

fs.mkdirSync(destDir, { recursive: true });

let failed = false;

for (const file of wanted) {
  if (!fs.existsSync(file.from)) {
    console.error(`Missing ${file.from}`);
    failed = true;
    continue;
  }

  fs.copyFileSync(file.from, file.to);
  console.log(`Copied ${path.basename(file.to)}`);
}

if (failed) {
  process.exit(1);
}
