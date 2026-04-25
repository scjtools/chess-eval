const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'node_modules', 'stockfish', 'src');
const destDir = path.join(root, 'public', 'vendor');
const files = ['stockfish-nnue-16-single.js', 'stockfish-nnue-16-single.wasm'];

fs.mkdirSync(destDir, { recursive: true });
for (const file of files) {
  const from = path.join(srcDir, file);
  const to = path.join(destDir, file);
  if (!fs.existsSync(from)) {
    console.warn(`Missing ${from}. Stockfish package layout may have changed.`);
    process.exitCode = 1;
  } else {
    fs.copyFileSync(from, to);
    console.log(`Copied ${file}`);
  }
}
