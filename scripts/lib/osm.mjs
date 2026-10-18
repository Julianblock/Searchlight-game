import fs from 'node:fs/promises';
import path from 'node:path';
import { latLonToLocal, regionBounds } from './geo.mjs';

const UA = 'searchlight-game/0.1 (github.com/Julianblock/Searchlight-game)';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpass(query, cacheFile) {
  try {
    return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {}
  for (let round = 0; round < 4; round++) for (const url of ENDPOINTS) {
    if (round) await new Promise((r) => setTimeout(r, 5000 * round));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, JSON.stringify(json));
      return json;
    } catch (err) {
      console.warn(`  ${url} failed: ${err.message}`);
    }
  }
  throw new Error('All Overpass endpoints failed');
}

const r1 = (v) => Math.round(v * 10) / 10;

function toLine(geometry) {
  const pts = [];
  for (const g of geometry) {
    const p = latLonToLocal(g.lat, g.lon);
    pts.push(r1(p.x), r1(p.z));
  }
  return pts;
}

function building(geometry) {
  const pts = geometry.map((g) => latLonToLocal(g.lat, g.lon));
  if (pts.length < 3) return null;
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.z;
  }
  cx /= pts.length;
  cz /= pts.length;
  // Orientation from the longest edge, extents measured in that frame.
  let best = 0;
  let ang = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dz = pts[i + 1].z - pts[i].z;
    const l = dx * dx + dz * dz;
    if (l > best) {
      best = l;
      ang = Math.atan2(dz, dx);
    }
  }
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of pts) {
    const u = (p.x - cx) * c - (p.z - cz) * s;
    const v = (p.x - cx) * s + (p.z - cz) * c;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const w = maxU - minU;
  const d = maxV - minV;
  if (w < 2 || d < 2 || w > 400 || d > 400) return null;
  return [r1(cx), r1(cz), r1(w), r1(d), Math.round(ang * 1000) / 1000];
}

/** The one-word kind of a point of interest, or '' for ordinary features. */
function poiKind(t) {
  if (t.amenity === 'grave_yard') return '';
  if (t.amenity && /^(fuel|fast_food|restaurant|casino|cafe|bar|post_office|fire_station|school|community_centre|courthouse|place_of_worship|social_facility|shelter)$/.test(t.amenity)) return t.amenity;
  if (t.shop) return 'shop';
  if (t.tourism && /^(motel|hotel|museum|viewpoint|camp_site|caravan_site|attraction|information)$/.test(t.tourism)) return t.tourism;
  if (t.historic) return t.historic === 'archaeological_site' ? 'petroglyph' : 'historic';
  if (t.man_made && /^(mineshaft|adit|water_tower|storage_tank|headframe)$/.test(t.man_made)) return t.man_made === 'adit' ? 'mineshaft' : t.man_made;
  if (t.leisure && /^(park|marina|slipway)$/.test(t.leisure)) return t.leisure;
  if (t.natural && /^(spring|saddle|cave_entrance)$/.test(t.natural)) return t.natural;
  if (t.mountain_pass === 'yes') return 'saddle';
  return '';
}

/** Joins a multipolygon's outer member ways end to end into closed rings. */
function rings(members) {
  const key = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
  const open = members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry?.length > 1).map((m) => m.geometry.slice());
  const out = [];
  while (open.length) {
    let ring = open.pop();
    for (let grew = true; grew && key(ring[0]) !== key(ring[ring.length - 1]); ) {
      grew = false;
      const end = key(ring[ring.length - 1]);
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        if (key(w[0]) === end) ring = ring.concat(w.slice(1));
        else if (key(w[w.length - 1]) === end) ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}

export async function buildOsm(size, cacheDir) {
  const b = regionBounds(size);
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  const query = `[out:json][timeout:300];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${bbox});
  way["waterway"~"^(river|canal|stream|drain|ditch)$"](${bbox});
  way["natural"="water"](${bbox});
  way["building"](${bbox});
  way["power"="line"](${bbox});
  node["natural"="peak"](${bbox});
  node["place"~"^(city|town|village|hamlet)$"](${bbox});
  node["man_made"~"^(mast|tower|communications_tower)$"](${bbox});
);
out geom;`;
  const json = await overpass(query, path.join(cacheDir, `osm_${size}.json`));

  // Mining and ranch tracks and town service lanes near Searchlight (the inner
  // region); cemeteries, mines and roadside businesses across the region.
  const ib = regionBounds(22000);
  const ibox = `${ib.south},${ib.west},${ib.north},${ib.east}`;
  const extra = await overpass(
    `[out:json][timeout:180];
(
  way["highway"~"^(track|service)$"](${ibox});
  way["landuse"="cemetery"](${bbox});
  way["amenity"="grave_yard"](${bbox});
  nwr["amenity"~"^(fuel|fast_food|restaurant|casino|cafe|bar|post_office|fire_station|school|community_centre|courthouse|place_of_worship|social_facility|shelter)$"](${bbox});
  nwr["shop"](${bbox});
  nwr["tourism"~"^(motel|hotel|museum|viewpoint|camp_site|caravan_site|attraction|information)$"](${bbox});
  nwr["historic"](${bbox});
  nwr["man_made"~"^(mineshaft|adit|water_tower|storage_tank|headframe)$"](${bbox});
  nwr["leisure"~"^(park|marina|slipway)$"](${bbox});
  node["natural"~"^(spring|saddle|cave_entrance)$"](${bbox});
  node["mountain_pass"="yes"](${bbox});
);
out geom;`,
    path.join(cacheDir, `osm_extra_${size}.json`),
  );
  json.elements.push(...extra.elements);

  // The road down to the river and the Laughlin strip, Bullhead City and Davis Dam.
  const wb = regionBounds(92000);
  const wbox = `${wb.south},${wb.west},${wb.north},${wb.east}`;
  const lb = regionBounds(13000, 30000, 34700);
  const lbox = `${lb.south},${lb.west},${lb.north},${lb.east}`;
  const river = await overpass(
    `[out:json][timeout:300];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"](${wbox});
  node["place"~"^(city|town|village|hamlet)$"](${wbox});
  node["natural"="peak"](${wbox});
  way["highway"~"^(unclassified|residential|living_street|service)$"]["service"!~"^(parking_aisle|driveway|drive-through)$"](${lbox});
  way["building"](${lbox});
  way["natural"="water"](${lbox});
  relation["natural"="water"](${lbox});
  way["power"="line"](${lbox});
  nwr["amenity"~"^(fuel|fast_food|restaurant|casino|cafe|bar|post_office)$"](${lbox});
  nwr["tourism"~"^(motel|hotel|museum|viewpoint|attraction|information)$"](${lbox});
  nwr["leisure"~"^(park|marina|slipway)$"](${lbox});
);
out geom;`,
    path.join(cacheDir, 'osm_laughlin.json'),
  );
  json.elements.push(...river.elements);

  const out = { roads: [], waterways: [], waterAreas: [], buildings: [], power: [], peaks: [], places: [], masts: [], cemeteries: [], pois: [] };
  const seen = new Set();
  for (const e of json.elements) {
    const t = e.tags || {};
    const id = `${e.type}${e.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind = poiKind(t);
    if (kind) {
      const g = e.type === 'node' ? [{ lat: e.lat, lon: e.lon }] : e.geometry || (e.bounds && [{ lat: (e.bounds.minlat + e.bounds.maxlat) / 2, lon: (e.bounds.minlon + e.bounds.maxlon) / 2 }]);
      if (g && g.length) {
        let lat = 0;
        let lon = 0;
        for (const p of g) {
          lat += p.lat;
          lon += p.lon;
        }
        const p = latLonToLocal(lat / g.length, lon / g.length);
        const fp = e.type === 'way' && t.building && e.geometry ? building(e.geometry) : null;
        out.pois.push({ name: t.name || '', kind, brand: t.brand || '', x: r1(p.x), z: r1(p.z), ...(fp ? { fp: fp.slice(2) } : {}) });
        if (fp) out.buildings.push(fp);
        if (e.type !== 'way' || !t.highway) continue;
      }
    }
    if (e.type === 'node') {
      const p = latLonToLocal(e.lat, e.lon);
      const item = { name: t.name || '', x: r1(p.x), z: r1(p.z) };
      if (t.natural === 'peak') out.peaks.push({ ...item, ele: Number(t.ele) || null });
      else if (t.place) out.places.push({ ...item, kind: t.place });
      else if (t.man_made) out.masts.push({ ...item, height: Number(t.height) || null });
      continue;
    }
    if (e.type === 'relation') {
      if (t.natural === 'water') for (const ring of rings(e.members || [])) out.waterAreas.push({ name: t.name || '', pts: toLine(ring) });
      continue;
    }
    if (!e.geometry) continue;
    if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') {
      out.cemeteries.push({ name: t.name || '', pts: toLine(e.geometry) });
    } else if (t.highway) {
      out.roads.push({ name: t.name || t.ref || '', kind: t.highway.replace('_link', ''), grade: Number((t.tracktype || '').slice(5)) || 0, lanes: Number(t.lanes) || 0, oneway: t.oneway === 'yes' || t.highway === 'motorway' ? 1 : t.oneway === '-1' ? -1 : 0, pts: toLine(e.geometry) });
    } else if (t.waterway) {
      out.waterways.push({ name: t.name || '', kind: t.waterway, pts: toLine(e.geometry) });
    } else if (t.natural === 'water') {
      out.waterAreas.push({ name: t.name || '', pts: toLine(e.geometry) });
    } else if (t.building) {
      const bld = building(e.geometry);
      if (bld) out.buildings.push(bld);
    } else if (t.power === 'line') {
      out.power.push({ pts: toLine(e.geometry) });
    }
  }
  return out;
}
