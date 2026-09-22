#!/usr/bin/env node
/** Remove junk from an earlier broad crawl; keep Nuxt bundle + seed SSR pages. */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'local', 'www.mfuns.net');
const WWW_DIR = path.join(OUT_DIR, 'www.mfuns.net');
const RESOURCE_DIR = path.join(OUT_DIR, 'resource.mfuns.net');

const KEEP_WWW_DIRS = new Set(['agree', 'category']);
const KEEP_WWW_FILES = new Set(['index.html', 'favicon.ico', 'download']);
const KEEP_CATEGORY_IDS = new Set(['1', '8', '14', '21', '25', '30', '33', '37', '40', '45', '49', '53']);

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    const empty = path.join(ROOT, '.tmp-empty-dir');
    fs.mkdirSync(empty, { recursive: true });
    spawnSync('robocopy', [empty, target, '/MIR', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function cleanupWww() {
  if (!fs.existsSync(WWW_DIR)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(WWW_DIR)) {
    const full = path.join(WWW_DIR, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'category') {
        for (const entry of fs.readdirSync(full)) {
          const entryPath = path.join(full, entry);
          if (fs.statSync(entryPath).isDirectory() || !KEEP_CATEGORY_IDS.has(entry)) {
            rmrf(entryPath);
            removed += 1;
          }
        }
        continue;
      }
      if (!KEEP_WWW_DIRS.has(name)) {
        rmrf(full);
        removed += 1;
      }
      continue;
    }
    if (!KEEP_WWW_FILES.has(name)) {
      fs.unlinkSync(full);
      removed += 1;
    }
  }
  return removed;
}

function cleanupResource() {
  if (!fs.existsSync(RESOURCE_DIR)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(RESOURCE_DIR)) {
    if (name === 'main-site' || name === 'css' || name === 'imgs') continue;
    rmrf(path.join(RESOURCE_DIR, name));
    removed += 1;
  }
  return removed;
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else n += 1;
    }
  };
  walk(dir);
  return n;
}

const removedWww = cleanupWww();
const removedResource = cleanupResource();
const wwwFiles = countFiles(WWW_DIR);
const resourceFiles = countFiles(RESOURCE_DIR);
const totalBytes = (() => {
  let sum = 0;
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else sum += stat.size;
    }
  };
  walk(OUT_DIR);
  return sum;
})();

console.log(`Removed www junk entries: ${removedWww}`);
console.log(`Removed resource top-level junk: ${removedResource}`);
console.log(`Files remaining: www=${wwwFiles}, resource=${resourceFiles}, total=${wwwFiles + resourceFiles}`);
console.log(`Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
