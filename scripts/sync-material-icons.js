const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgDir = path.join(root, 'node_modules', 'material-symbols');
const outDir = path.join(root, 'src', 'assets', 'material-symbols');

const files = [
  ['material-symbols-outlined.woff2', 'material-symbols-outlined.woff2'],
  ['outlined.css', 'material-icons.css'],
];

if (!fs.existsSync(pkgDir)) {
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

for (const [from, to] of files) {
  const src = path.join(pkgDir, from);
  const dest = path.join(outDir, to);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, dest);
}
