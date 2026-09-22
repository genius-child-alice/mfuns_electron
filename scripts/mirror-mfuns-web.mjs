#!/usr/bin/env node
/**
 * Mirror compiled Mfuns web frontend (Nuxt/Vite _nuxt bundle + key SSR pages).
 * Output: local/www.mfuns.net/
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'local', 'www.mfuns.net');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NUXT_BASE =
  'https://resource.mfuns.net/main-site/2026092103/public/_nuxt';
const ENTRY_JS = `${NUXT_BASE}/daSpQ-Ci.js`;

const WWW_SEEDS = [
  '/',
  '/favicon.ico',
  '/download',
  '/agree/userAgreement.html',
  '/agree/priv.html',
  '/category/1',
  '/category/8',
  '/category/14',
  '/category/21',
  '/category/25',
  '/category/30',
  '/category/33',
  '/category/37',
  '/category/40',
  '/category/45',
  '/category/49',
  '/category/53',
];

const EXTRA_RESOURCE = [
  'https://resource.mfuns.net/css/bak/editor.css',
];

function localPathForUrl(url) {
  const u = new URL(url);
  let pathname = u.pathname;
  if (pathname.endsWith('/')) pathname += 'index.html';
  return path.join(OUT_DIR, u.hostname, pathname);
}

function parseViteMapDeps(entryText) {
  const assets = new Set();
  const head = entryText.slice(0, 20000);
  for (const m of head.matchAll(/"\.\/([^"]+\.(?:js|css|woff2?|ttf|svg|png|webp))"/g)) {
    assets.add(`${NUXT_BASE}/${m[1]}`);
  }
  if (assets.size === 0) throw new Error('Could not parse __vite__mapDeps from entry bundle');
  return assets;
}

function extractResourceLinksFromHtml(html, pageUrl) {
  const assets = new Set();
  for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const raw = m[1];
    if (!raw.startsWith('http') && !raw.startsWith('/')) continue;
    try {
      const abs = new URL(raw, pageUrl).href.split(/[?#]/)[0];
      const parsed = new URL(abs);
      if (parsed.hostname !== 'resource.mfuns.net') continue;
      if (parsed.pathname === '/' || parsed.pathname.length <= 1) continue;
      assets.add(abs);
    } catch {
      /* ignore */
    }
  }
  return assets;
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Referer: 'https://www.mfuns.net/',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function save(url, buf) {
  const filePath = localPathForUrl(url);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

async function downloadUrl(url) {
  const buf = await fetchBuffer(url);
  await save(url, buf);
  return buf;
}

async function downloadMany(urls, concurrency = 10) {
  /** @type {Array<{url: string, error: string}>} */
  const failed = [];
  let ok = 0;
  const list = [...urls];
  for (let i = 0; i < list.length; i += concurrency) {
    const batch = list.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          await downloadUrl(url);
          ok += 1;
          return null;
        } catch (err) {
          return { url, error: err.message };
        }
      }),
    );
    for (const r of results) if (r) failed.push(r);
    process.stdout.write(`\rDownloaded ${ok}/${list.length} (failed ${failed.length})`);
  }
  process.stdout.write('\n');
  return { ok, failed };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output: ${OUT_DIR}`);

  console.log('0/4 Cleanup junk from previous broad crawl');
  const { spawnSync } = await import('node:child_process');
  const cleanup = spawnSync(process.execPath, ['scripts/cleanup-mfuns-web-mirror.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (cleanup.status !== 0) process.exit(cleanup.status ?? 1);

  console.log('1/4 Entry bundle + vite map deps');
  const entryBuf = await fetchBuffer(ENTRY_JS);
  await save(ENTRY_JS, entryBuf);
  const nuxtAssets = parseViteMapDeps(entryBuf.toString('utf8'));
  console.log(`   Nuxt assets: ${nuxtAssets.size}`);

  console.log('2/4 Download _nuxt build files');
  const nuxtResult = await downloadMany(nuxtAssets);

  console.log('3/4 Download www SSR pages + linked resource assets');
  /** @type {Set<string>} */
  const pageUrls = new Set(WWW_SEEDS.map((p) => `https://www.mfuns.net${p}`));
  /** @type {Set<string>} */
  const resourceFromHtml = new Set(EXTRA_RESOURCE);
  for (const pageUrl of pageUrls) {
    try {
      const buf = await fetchBuffer(pageUrl);
      await save(pageUrl, buf);
      for (const asset of extractResourceLinksFromHtml(buf.toString('utf8'), pageUrl)) {
        resourceFromHtml.add(asset);
      }
    } catch (err) {
      nuxtResult.failed.push({ url: pageUrl, error: err.message });
    }
  }
  for (const asset of nuxtAssets) resourceFromHtml.delete(asset);
  const resourceResult = await downloadMany(resourceFromHtml);

  console.log('4/4 Write manifest');
  const allUrls = new Set([
    ENTRY_JS,
    ...nuxtAssets,
    ...pageUrls,
    ...resourceFromHtml,
  ]);

  const failed = [...nuxtResult.failed, ...resourceResult.failed].filter(
    (item) => item.url !== 'https://resource.mfuns.net/',
  );

  const manifest = {
    downloadedAt: new Date().toISOString(),
    purpose: 'Local reference mirror of compiled www.mfuns.net frontend',
    outputDir: OUT_DIR,
    nuxtBase: NUXT_BASE,
    entryJs: ENTRY_JS,
    stats: {
      nuxtAssetsListed: nuxtAssets.size,
      nuxtDownloadOk: nuxtResult.ok,
      nuxtDownloadFailed: nuxtResult.failed.length,
      wwwPages: pageUrls.size,
      extraResourceFiles: resourceFromHtml.size,
      resourceDownloadOk: resourceResult.ok,
      resourceDownloadFailed: resourceResult.failed.length,
    },
    failed,
    urls: [...allUrls].filter((u) => u !== 'https://resource.mfuns.net/').sort(),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('Done.');
  console.log(`Manifest: ${path.join(OUT_DIR, 'mirror-manifest.json')}`);
  console.log(
    `Nuxt ok=${nuxtResult.ok}/${nuxtAssets.size}, pages=${pageUrls.size}, resource extras ok=${resourceResult.ok}/${resourceFromHtml.size}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
