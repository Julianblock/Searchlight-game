// Builds the real-world datasets the game streams at runtime.
//   node scripts/fetch-data.mjs [step...]
// Steps: height, imagery, landcover, osm (default: all)

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CENTER } from './lib/geo.mjs';
import { buildMosaic } from './lib/tiles.mjs';
import { buildLandcover, LC } from './lib/landcover.mjs';
import { readHeight } from './lib/derived.mjs';
import { buildOsm } from './lib/osm.mjs';
import { flowAccumulation } from './lib/washes.mjs';

const OUT = path.resolve('public/data');
export const REGIONS = {
  inner: { size: 22000, heightRes: 2048, heightZoom: 14, imageRes: 4096, imageZoom: 15 },
  mid: { size: 50000, heightRes: 1024, heightZoom: 12, imageRes: 2048, imageZoom: 13 },
  far: { size: 400000, heightRes: 1024, heightZoom: 9, imageRes: 2048, imageZoom: 10 },
};

// Heights are packed into 16 bits across the R and G channels of an 8-bit PNG.
// Searchlight sits at ~1,080 m; Lake Mohave is ~195 m and Death Valley dips to -86 m.
export const HEIGHT_ENCODING = {
  inner: { offset: 0, scale: 24 },
  mid: { offset: 0, scale: 24 },
  far: { offset: 100, scale: 16 },
};

function forEachPixel(res, size, fn) {
  const step = size / res;
  for (let j = 0; j < res; j++) {
    const z = -size / 2 + (j + 0.5) * step;
    for (let i = 0; i < res; i++) {
      const x = -size / 2 + (i + 0.5) * step;
      fn(i, j, x, z);
    }
  }
}

async function buildHeight(name) {
  const r = REGIONS[name];
  const enc = HEIGHT_ENCODING[name];
  console.log(`height/${name}`);
  const sample = await buildMosaic('terrarium', r.heightZoom, r.size * 1.02);
  const raw = Buffer.alloc(r.heightRes * r.heightRes * 3);
  const tmp = [0];
  let min = Infinity;
  let max = -Infinity;
  forEachPixel(r.heightRes, r.size, (i, j, x, z) => {
    let h = sample(x, z, tmp)[0];
    h = Math.max(h, -95);
    min = Math.min(min, h);
    max = Math.max(max, h);
    const v = Math.max(0, Math.min(65535, Math.round((h + enc.offset) * enc.scale)));
    const o = (j * r.heightRes + i) * 3;
    raw[o] = v >> 8;
    raw[o + 1] = v & 255;
  });
  console.log(`  range ${min.toFixed(1)}m .. ${max.toFixed(1)}m`);
  await sharp(raw, { raw: { width: r.heightRes, height: r.heightRes, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `height_${name}.png`));
  return { min, max };
}

async function buildImagery(name) {
  const r = REGIONS[name];
  console.log(`imagery/${name}`);
  const sample = await buildMosaic('usgsImagery', r.imageZoom, r.size * 1.02);
  const raw = Buffer.alloc(r.imageRes * r.imageRes * 3);
  const rgb = [0, 0, 0];
  forEachPixel(r.imageRes, r.size, (i, j, x, z) => {
    sample(x, z, rgb);
    const o = (j * r.imageRes + i) * 3;
    raw[o] = rgb[0];
    raw[o + 1] = rgb[1];
    raw[o + 2] = rgb[2];
  });
  await sharp(raw, { raw: { width: r.imageRes, height: r.imageRes, channels: 3 } })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(OUT, `imagery_${name}.jpg`));
}

async function writeMeta(extra = {}) {
  const file = path.join(OUT, 'meta.json');
  let meta = {};
  try {
    meta = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}
  meta = { ...meta, center: CENTER, regions: REGIONS, heightEncoding: HEIGHT_ENCODING, ...extra };
  await fs.writeFile(file, JSON.stringify(meta, null, 2));
}

/** Bilinear terrain height from the baked inner and mid heightmaps. */
async function terrainSampler() {
  const grids = [];
  for (const name of ['inner', 'mid']) {
    const { h, N } = await readHeight(path.join(OUT, `height_${name}.png`), HEIGHT_ENCODING[name]);
    grids.push({ h, N, size: REGIONS[name].size });
  }
  return (x, z) => {
    for (const g of grids) {
      const fx = (x / g.size + 0.5) * g.N - 0.5;
      const fz = (z / g.size + 0.5) * g.N - 0.5;
      if (fx < 0 || fz < 0 || fx > g.N - 2 || fz > g.N - 2) continue;
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const tx = fx - x0;
      const tz = fz - z0;
      const i = z0 * g.N + x0;
      const a = g.h[i] + (g.h[i + 1] - g.h[i]) * tx;
      const b = g.h[i + g.N] + (g.h[i + g.N + 1] - g.h[i + g.N]) * tx;
      return a + (b - a) * tz;
    }
    const g = grids[grids.length - 1];
    const i = Math.min(g.N - 1, Math.max(0, Math.round((x / g.size + 0.5) * g.N)));
    const j = Math.min(g.N - 1, Math.max(0, Math.round((z / g.size + 0.5) * g.N)));
    return g.h[j * g.N + i];
  };
}

// Washes drain at least this much country (m²); the big ones widen out.
const WASH_AREA = 0.6e6;
const WIDE_WASH_AREA = 6e6;
const BIG_WASH_AREA = 25e6;

/** Paints sandy washes over the scrub classes wherever enough desert drains through. */
function markWashes(classes, res, size, height) {
  const cell = size / res;
  const h = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      // Sub-metre jitter breaks the smooth DEM's flats so flow meanders like real braids.
      const n = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      h[j * res + i] = height(-size / 2 + (i + 0.5) * cell, -size / 2 + (j + 0.5) * cell) + (n - Math.floor(n)) * 0.6;
    }
  }
  const acc = flowAccumulation(h, res, cell);
  // Real washes are cut into the fans: keep channels that sit below their surroundings.
  const R = 3;
  const sunk = new Float32Array(res * res);
  for (let j = R; j < res - R; j++) {
    for (let i = R; i < res - R; i++) {
      let sum = 0;
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) sum += h[(j + dz) * res + i + dx];
      sunk[j * res + i] = sum / (2 * R + 1) ** 2 - h[j * res + i];
    }
  }
  const scrub = new Set([LC.CREOSOTE, LC.JOSHUA, LC.BLACKBRUSH, LC.GRASS, LC.OTHER]);
  const wash = new Uint8Array(res * res);
  for (let p = 0; p < res * res; p++) {
    if (acc[p] < WASH_AREA || (acc[p] < BIG_WASH_AREA && sunk[p] < 0.4)) continue;
    wash[p] = 1;
    if (acc[p] < WIDE_WASH_AREA) continue;
    const r = acc[p] > WIDE_WASH_AREA * 8 ? 2 : 1;
    const x = p % res;
    const z = (p / res) | 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const q = (z + dz) * res + x + dx;
        if (q >= 0 && q < res * res) wash[q] = 1;
      }
    }
  }
  for (let p = 0; p < res * res; p++) if (wash[p] && scrub.has(classes[p])) classes[p] = LC.WASH;
}

const steps = {
  async height() {
    const ranges = {};
    for (const name of Object.keys(REGIONS)) ranges[name] = await buildHeight(name);
    await writeMeta({ heightRanges: ranges });
  },
  async imagery() {
    for (const name of Object.keys(REGIONS)) await buildImagery(name);
  },
  async landcover() {
    const { size } = REGIONS.mid;
    const res = 2048;
    console.log('landcover/mid');
    const height = await terrainSampler();
    const classes = await buildLandcover(size, res, path.resolve('.cache/cdl'), height);
    markWashes(classes, res, size, height);
    const counts = {};
    for (const v of classes) counts[v] = (counts[v] || 0) + 1;
    const names = Object.fromEntries(Object.entries(LC).map(([k, v]) => [v, k]));
    for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${names[k].padEnd(12)} ${((100 * n) / classes.length).toFixed(1)}%`);
    }
    await sharp(Buffer.from(classes), { raw: { width: res, height: res, channels: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, 'landcover.png'));
    await writeMeta({ landcover: { size, res, classes: LC } });
  },
  async osm() {
    console.log('osm/mid');
    const osm = await buildOsm(REGIONS.mid.size, path.resolve('.cache/osm'));
    for (const [k, v] of Object.entries(osm)) console.log(`  ${k.padEnd(10)} ${v.length}`);
    await fs.writeFile(path.join(OUT, 'osm.json'), JSON.stringify(osm));
  },
};

const wanted = process.argv.slice(2);
await fs.mkdir(OUT, { recursive: true });
for (const [name, fn] of Object.entries(steps)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const t = Date.now();
  await fn();
  console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
await writeMeta();
