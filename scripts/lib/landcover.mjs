import fs from 'node:fs/promises';
import path from 'node:path';
import proj4 from 'proj4';
import { fromArrayBuffer } from 'geotiff';
import { localToLatLon } from './geo.mjs';

// USDA NASS Cropland Data Layer, delivered in CONUS Albers (EPSG:5070).
const ALBERS = '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs';
const toAlbers = proj4('EPSG:4326', ALBERS);

// Game land-cover classes (stored in the red channel of landcover.png).
export const LC = {
  OTHER: 0,
  CREOSOTE: 1, // creosote-bursage scrub on the low bajadas
  JOSHUA: 2, // Joshua tree and Mojave yucca woodland (the Searchlight forest)
  BLACKBRUSH: 3, // dark blackbrush scrub above the Joshua belt
  WASH: 4, // sandy washes with catclaw, desert willow and palo verde
  GRASS: 5, // galleta / big galleta grass flats
  WETLAND: 6, // tamarisk, arrowweed and cattail along Lake Mohave
  WATER: 7,
  URBAN_OPEN: 8,
  URBAN_LOW: 9,
  URBAN_MED: 10,
  URBAN_HIGH: 11,
  PINYON: 12, // pinyon pine and Utah juniper on the high ranges
  ROCK: 13, // bare volcanic rock, cliffs and talus
  FARM: 14, // irrigated alfalfa and lawns along the river
};

// The CDL calls ~95% of this country "shrubland"; only these classes say more.
const CDL_TO_LC = new Map([
  [111, LC.WATER],
  [121, LC.URBAN_OPEN],
  [122, LC.URBAN_LOW],
  [123, LC.URBAN_MED],
  [124, LC.URBAN_HIGH],
  ...[141, 142, 143].map((c) => [c, LC.PINYON]),
  [131, LC.ROCK],
  [176, LC.GRASS],
  ...[190, 195].map((c) => [c, LC.WETLAND]),
  ...[36, 37, 58, 59, 61].map((c) => [c, LC.FARM]),
]);

/**
 * Shrubland split into the Mojave's elevation belts: creosote below ~900 m,
 * Joshua trees through Searchlight's 1,080 m, blackbrush and then pinyon above.
 */
function classify(cdl, h, slope) {
  if (CDL_TO_LC.has(cdl)) return CDL_TO_LC.get(cdl);
  if (cdl === 0) return LC.OTHER;
  if (slope > 0.62) return LC.ROCK;
  if (h > 1720) return LC.PINYON;
  if (h > 1480) return LC.BLACKBRUSH;
  if (h > 900) return LC.JOSHUA;
  return LC.CREOSOTE;
}

async function downloadCdl(bbox, cacheDir) {
  for (const year of [2025, 2024, 2023]) {
    const file = path.join(cacheDir, `cdl_${year}.tif`);
    try {
      return await fs.readFile(file);
    } catch {}
    const api = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLFile?year=${year}&bbox=${bbox.join(',')}`;
    const xml = await (await fetch(api)).text();
    const url = xml.match(/<returnURL>(.*?)<\/returnURL>/)?.[1];
    if (!url) continue;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(file, buf);
    console.log(`  CDL ${year}: ${(buf.length / 1e6).toFixed(1)}MB`);
    return buf;
  }
  throw new Error('No CDL year available');
}

/**
 * Returns a Uint8Array (res*res) of game land-cover classes over a square region.
 * `height(x, z)` samples the terrain so shrubland can be split by elevation and slope.
 */
export async function buildLandcover(size, res, cacheDir, height) {
  const h = size / 2;
  const corners = [
    [-h, -h],
    [h, -h],
    [-h, h],
    [h, h],
  ].map(([x, z]) => {
    const ll = localToLatLon(x, z);
    return toAlbers.forward([ll.lon, ll.lat]);
  });
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const bbox = [Math.min(...xs) - 500, Math.min(...ys) - 500, Math.max(...xs) + 500, Math.max(...ys) + 500].map(Math.round);

  const buf = await downloadCdl(bbox, cacheDir);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const image = await tiff.getImage();
  const [raster] = await image.readRasters();
  const W = image.getWidth();
  const H = image.getHeight();
  const [ox, oy] = image.getOrigin();
  const [rx, ry] = image.getResolution();

  const out = new Uint8Array(res * res);
  const step = size / res;
  for (let j = 0; j < res; j++) {
    const z = -h + (j + 0.5) * step;
    for (let i = 0; i < res; i++) {
      const x = -h + (i + 0.5) * step;
      const ll = localToLatLon(x, z);
      const [ax, ay] = toAlbers.forward([ll.lon, ll.lat]);
      const px = Math.floor((ax - ox) / rx);
      const py = Math.floor((ay - oy) / ry);
      const v = px >= 0 && py >= 0 && px < W && py < H ? raster[py * W + px] : 0;
      const e = step;
      const sx = (height(x + e, z) - height(x - e, z)) / (2 * e);
      const sz = (height(x, z + e) - height(x, z - e)) / (2 * e);
      out[j * res + i] = classify(v, height(x, z), Math.hypot(sx, sz));
    }
  }
  return out;
}
