import * as THREE from 'three';
import type { HeightGrid, WorldData } from './loader';
import type { Heightfield } from './heightfield';
import type { RoadIndex } from './roadIndex';
import { LC } from './meta';

/** Water level grid: covers the land-cover square at this resolution. */
const RES = 2048;
const NO_WATER = -1000;

export type WaterKind = 'lake' | 'river' | 'pond';

export interface WaterHit {
  level: number;
  /** 0 .. 1: how surely this point is inside the lake or a pond. */
  mask: number;
  depth: number;
}

interface Pond {
  pts: number[];
  level: number;
  depth: number;
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Lake Mohave, the Colorado River reservoir behind Davis Dam, from the
 * land-cover water class, plus the stock tanks and the town's sewage lagoons
 * from OpenStreetMap. The washes are dry. Carves a bed below each surface and
 * bakes the water-level texture the water, lake bed and underwater shaders share.
 */
export class Water {
  readonly size: number;
  readonly texture: THREE.DataTexture;
  /** Lake Mohave's pool elevation (m). */
  readonly lakeLevel: number;
  private names: Uint16Array;
  private nameList: { name: string; kind: WaterKind }[] = [{ name: '', kind: 'pond' }];
  private level: Float32Array;
  private mask: Float32Array;

  constructor(world: WorldData, private hf: Heightfield, roads: RoadIndex) {
    this.size = world.meta.landcover.size;
    this.level = new Float32Array(RES * RES).fill(NO_WATER);
    this.mask = new Float32Array(RES * RES);
    this.names = new Uint16Array(RES * RES);

    const nearRoad = (x: number, z: number) => {
      const r = roads.nearest(x, z, 20);
      return !!r && r.dist < r.halfWidth + 5;
    };
    this.lakeLevel = this.planLake(world);
    for (const p of this.planPonds(world)) {
      this.carvePond(world.heights.inner, p, nearRoad);
      this.paintPond(p);
    }
    this.dilate(8);

    const data = new Uint16Array(RES * RES * 2);
    for (let i = 0; i < RES * RES; i++) {
      data[i * 2] = THREE.DataUtils.toHalfFloat(this.level[i]);
      data[i * 2 + 1] = THREE.DataUtils.toHalfFloat(this.mask[i]);
    }
    this.texture = new THREE.DataTexture(data, RES, RES, THREE.RGFormat, THREE.HalfFloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  /** Water surface, mask and depth at (x, z); bilinear like the GPU. */
  sample(x: number, z: number): WaterHit {
    if (Math.abs(x) > this.size || Math.abs(z) > this.size) return { level: NO_WATER, mask: 0, depth: 0 };
    const fx = Math.min(RES - 1.001, Math.max(0, (x / this.size + 0.5) * RES - 0.5));
    const fz = Math.min(RES - 1.001, Math.max(0, (z / this.size + 0.5) * RES - 0.5));
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const i = z0 * RES + x0;
    const bl = (a: Float32Array) => {
      const u = a[i] + (a[i + 1] - a[i]) * tx;
      const v = a[i + RES] + (a[i + RES + 1] - a[i + RES]) * tx;
      return u + (v - u) * tz;
    };
    const mask = bl(this.mask);
    if (mask < 0.01) return { level: NO_WATER, mask: 0, depth: 0 };
    const level = bl(this.level);
    return { level, mask, depth: Math.max(0, level - this.hf.height(x, z)) };
  }

  /** Depth of water over the ground at (x, z), 0 on dry land. */
  depthAt(x: number, z: number): number {
    return this.sample(x, z).depth;
  }

  /** Name and kind of the water body at (x, z), if any. */
  bodyAt(x: number, z: number): { name: string; kind: WaterKind } | null {
    if (Math.abs(x) > this.size || Math.abs(z) > this.size) return null;
    const i = Math.min(RES - 1, Math.max(0, Math.floor((x / this.size + 0.5) * RES)));
    const j = Math.min(RES - 1, Math.max(0, Math.floor((z / this.size + 0.5) * RES)));
    const k = this.names[j * RES + i];
    return k ? this.nameList[k] : null;
  }

  private nameId(name: string, kind: WaterKind) {
    let k = this.nameList.findIndex((n) => n.name === name && n.kind === kind);
    if (k < 0) {
      k = this.nameList.length;
      this.nameList.push({ name, kind });
    }
    return k;
  }

  /**
   * The lake fills the Colorado's canyon east of the Eldorado and Newberry
   * Mountains. Its surface sits a little above the elevation model's flat
   * reservoir; the bed drops away from shore toward the old river channel.
   */
  private planLake(world: WorldData): number {
    const lc = world.landcover;
    const r = lc.width;
    const cell = this.size / r;
    const water = new Uint8Array(r * r);
    const hs: number[] = [];
    for (let j = 0; j < r; j++) {
      for (let i = 0; i < r; i++) {
        if (lc.data[(j * r + i) * 4] !== LC.WATER) continue;
        const x = ((i + 0.5) / r - 0.5) * this.size;
        // Lake Mohave lies 18-25 km east of town; other water pixels are stock tanks.
        if (x < 15000) continue;
        water[j * r + i] = 1;
        if (hs.length < 20000) hs.push(this.hf.height(x, ((j + 0.5) / r - 0.5) * this.size));
      }
    }
    if (!hs.length) return NO_WATER;
    hs.sort((a, b) => a - b);
    const level = hs[Math.floor(hs.length * 0.3)] + 0.8;

    // Chamfer distance (in cells) from the shore, for the bed profile.
    const dist = new Float32Array(r * r);
    for (let k = 0; k < r * r; k++) dist[k] = water[k] ? 1e6 : 0;
    const pass = (j0: number, j1: number, dj: number, i0: number, i1: number, di: number) => {
      for (let j = j0; j !== j1; j += dj) {
        for (let i = i0; i !== i1; i += di) {
          const k = j * r + i;
          if (!dist[k]) continue;
          let d = dist[k];
          if (i - di >= 0 && i - di < r) d = Math.min(d, dist[k - di] + 1);
          if (j - dj >= 0 && j - dj < r) d = Math.min(d, dist[k - dj * r] + 1);
          if (i - di >= 0 && i - di < r && j - dj >= 0 && j - dj < r) d = Math.min(d, dist[k - dj * r - di] + 1.414);
          dist[k] = d;
        }
      }
    };
    pass(0, r, 1, 0, r, 1);
    pass(r - 1, -1, -1, r - 1, -1, -1);

    const id = this.nameId('Lake Mohave', 'lake');
    const scale = RES / r;
    for (let j = 0; j < r; j++) {
      for (let i = 0; i < r; i++) {
        const k = j * r + i;
        if (!water[k]) continue;
        for (let b = 0; b < scale; b++) {
          for (let a = 0; a < scale; a++) {
            const q = (j * scale + b) * RES + i * scale + a;
            this.level[q] = level;
            this.mask[q] = 1;
            this.names[q] = id;
          }
        }
      }
    }
    // Feather the mask a cell past the shore so the surface meets the land
    // where the ground rises through the water level, not on the pixel grid.
    const m = this.mask.slice();
    for (let j = 1; j < RES - 1; j++) {
      for (let i = 1; i < RES - 1; i++) {
        const k = j * RES + i;
        if (m[k]) continue;
        if (m[k - 1] || m[k + 1] || m[k - RES] || m[k + RES]) {
          this.mask[k] = 1;
          this.level[k] = level;
          this.names[k] = id;
        }
      }
    }

    // Steep canyon walls plunge into deep, clear water.
    const carve = (g: HeightGrid) => {
      for (let j = 0; j < g.res; j++) {
        const z = ((j + 0.5) / g.res - 0.5) * g.size;
        const lj = Math.floor((z / this.size + 0.5) * r);
        if (lj < 0 || lj >= r) continue;
        for (let i = 0; i < g.res; i++) {
          const x = ((i + 0.5) / g.res - 0.5) * g.size;
          const li = Math.floor((x / this.size + 0.5) * r);
          if (li < 0 || li >= r) continue;
          const d = dist[lj * r + li];
          if (!d) continue;
          const depth = Math.min(45, 1.5 + d * cell * 0.12);
          const k = j * g.res + i;
          g.heights[k] = Math.min(g.heights[k], level - depth);
        }
      }
    };
    carve(world.heights.mid);
    return level;
  }

  /** Stock tanks and the sewage lagoons east of town; big unnamed polygons are dry playas. */
  private planPonds(world: WorldData): Pond[] {
    const out: Pond[] = [];
    const half = world.meta.regions.inner.size * 0.47;
    for (const a of world.osm.waterAreas) {
      const p = a.pts;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]);
        maxX = Math.max(maxX, p[i]);
        minZ = Math.min(minZ, p[i + 1]);
        maxZ = Math.max(maxZ, p[i + 1]);
      }
      const ext = Math.max(maxX - minX, maxZ - minZ);
      if (ext > 200 || ext < 8 || Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ)) > half) continue;
      const hs: number[] = [];
      for (let i = 0; i < p.length; i += 2) hs.push(this.hf.height(p[i], p[i + 1]));
      hs.sort((x, y) => x - y);
      out.push({ pts: p, level: hs[Math.floor(hs.length * 0.2)] - 0.3, depth: Math.min(3, 1 + ext * 0.01), name: a.name, minX, maxX, minZ, maxZ });
    }
    return out;
  }

  private pondDist(p: { pts: number[] }, x: number, z: number): number {
    const a = p.pts;
    let inside = false;
    let best = Infinity;
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
      const xi = a[i], zi = a[i + 1], xj = a[j], zj = a[j + 1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      const ex = xj - xi, ez = zj - zi;
      const t = Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez || 1)));
      best = Math.min(best, Math.hypot(x - xi - ex * t, z - zi - ez * t));
    }
    return inside ? best : -best;
  }

  private carvePond(g: HeightGrid, p: Pond, nearRoad: (x: number, z: number) => boolean) {
    const cell = g.size / g.res;
    const bank = cell * 1.5;
    const toI = (v: number) => (v / g.size + 0.5) * g.res - 0.5;
    const i0 = Math.max(0, Math.floor(toI(p.minX - bank)));
    const i1 = Math.min(g.res - 1, Math.ceil(toI(p.maxX + bank)));
    const j0 = Math.max(0, Math.floor(toI(p.minZ - bank)));
    const j1 = Math.min(g.res - 1, Math.ceil(toI(p.maxZ + bank)));
    for (let j = j0; j <= j1; j++) {
      const z = ((j + 0.5) / g.res - 0.5) * g.size;
      for (let i = i0; i <= i1; i++) {
        const x = ((i + 0.5) / g.res - 0.5) * g.size;
        const d = this.pondDist(p, x, z);
        if (d < -bank) continue;
        const target = d > 0 ? p.level - Math.min(p.depth, 0.3 + d * 0.12) : p.level + (-d / bank) * 1.0;
        const k = j * g.res + i;
        if (target < g.heights[k] && !nearRoad(x, z)) g.heights[k] = target;
      }
    }
  }

  private paintPond(p: Pond) {
    const cell = this.size / RES;
    const toI = (v: number) => (v / this.size + 0.5) * RES - 0.5;
    const i0 = Math.max(0, Math.floor(toI(p.minX - cell * 2)));
    const i1 = Math.min(RES - 1, Math.ceil(toI(p.maxX + cell * 2)));
    const j0 = Math.max(0, Math.floor(toI(p.minZ - cell * 2)));
    const j1 = Math.min(RES - 1, Math.ceil(toI(p.maxZ + cell * 2)));
    const id = this.nameId(p.name, 'pond');
    for (let j = j0; j <= j1; j++) {
      const z = ((j + 0.5) / RES - 0.5) * this.size;
      for (let i = i0; i <= i1; i++) {
        const x = ((i + 0.5) / RES - 0.5) * this.size;
        if (this.pondDist(p, x, z) < -cell * 1.5) continue;
        const k = j * RES + i;
        if (this.mask[k] === 0 || p.level < this.level[k]) {
          this.level[k] = p.level;
          this.names[k] = id;
        }
        this.mask[k] = 1;
      }
    }
  }

  /**
   * Spreads each water level a few cells beyond its shore so the surface mesh,
   * which is sampled per vertex, never dips toward "no water".
   */
  private dilate(passes: number) {
    const L = this.level;
    for (let p = 0; p < passes; p++) {
      const next = L.slice();
      for (let j = 1; j < RES - 1; j++) {
        for (let i = 1; i < RES - 1; i++) {
          const k = j * RES + i;
          if (L[k] > NO_WATER) continue;
          let sum = 0, n = 0;
          const a = L[k - 1], b = L[k + 1], c = L[k - RES], d = L[k + RES];
          if (a > NO_WATER) (sum += a), n++;
          if (b > NO_WATER) (sum += b), n++;
          if (c > NO_WATER) (sum += c), n++;
          if (d > NO_WATER) (sum += d), n++;
          if (n) next[k] = sum / n;
        }
      }
      L.set(next);
    }
  }
}
