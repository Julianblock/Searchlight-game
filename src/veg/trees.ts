import * as THREE from 'three';
import { G } from '../render/globals';
import type { ShadowMap } from '../render/shadows';
import type { Heightfield } from '../world/heightfield';
import type { RoadIndex } from '../world/roadIndex';
import { LC } from '../world/meta';
import { buildPlant, ROSETTE_FORMS, type PlantForm } from './treeGeometry';
import { SPECIES_COUNT, treeFragment, treeVertex } from './treeShader';
import { lowPower } from '../ui/device';

export const TREE = {
  CREOSOTE: 0,
  BURSAGE: 1,
  CATCLAW: 2,
  DESERT_WILLOW: 3,
  PINYON: 4,
  TAMARISK: 5,
  TOWN: 6,
  COTTONWOOD: 7,
  JOSHUA: 8,
  YUCCA: 9,
  PALM: 10,
  CHOLLA: 11,
} as const;

export interface PlantedTree {
  x: number;
  z: number;
  r: number;
  h: number;
  sp: number;
}

const TILE = 250;
const LOD0 = lowPower ? 110 : 170;
const LOD1 = lowPower ? 1100 : 1900;
const LOD2 = lowPower ? 4000 : 6500;
const CAP = lowPower ? [6000, 30000, 40000] : [14000, 70000, 90000];
/** Beyond the imagery zone, tiles are grown procedurally within this range. */
const OUTER_R = lowPower ? 1600 : 2600;
const OUTER_DROP = lowPower ? 2400 : 3600;
const LC_HALF = 25000;

/** Geometry form per species, and how many distinct variants of it exist. */
const FORM: PlantForm[] = ['creosote', 'round', 'tree', 'tree', 'cone', 'feathery', 'tree', 'tree', 'joshua', 'yucca', 'palm', 'cholla'];
const VARIANTS: Record<PlantForm, number> = { creosote: 2, round: 1, tree: 2, cone: 1, feathery: 1, joshua: 4, yucca: 2, palm: 1, cholla: 2 };
/** Share of the instance budget per form. */
const BUDGET: Record<PlantForm, number> = { creosote: 1.0, round: 0.6, tree: 0.25, cone: 0.2, feathery: 0.15, joshua: 0.7, yucca: 0.35, palm: 0.03, cholla: 0.2 };
/** Small plants vanish into the ground texture past this range. */
const MAX_DIST: number[] = [1100, 900, LOD2, LOD2, LOD2, LOD2, LOD2, LOD2, LOD2, 2600, LOD2, 900];

// Month keyframes (Jan..Dec) for leaf amount per species.
const LEAF_KF: number[][] = [
  [1, 1, 1, 1, 1, 0.95, 0.9, 0.9, 0.92, 0.95, 1, 1], // creosote
  [0.75, 0.85, 1, 1, 0.85, 0.6, 0.55, 0.6, 0.65, 0.7, 0.75, 0.75], // bursage / blackbrush
  [0.35, 0.35, 0.6, 1, 1, 1, 1, 1, 1, 0.85, 0.55, 0.4], // catclaw acacia
  [0.02, 0.02, 0.15, 0.7, 1, 1, 1, 1, 1, 0.8, 0.35, 0.05], // desert willow
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // pinyon / juniper
  [0.3, 0.3, 0.7, 1, 1, 1, 1, 1, 1, 0.9, 0.55, 0.35], // tamarisk
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // town trees (Aleppo pine, athel)
  [0.0, 0.0, 0.5, 1, 1, 1, 1, 1, 1, 0.9, 0.45, 0.02], // Fremont cottonwood
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Joshua tree
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Mojave yucca
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // fan palm
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // cholla
];

// Leaf colour keyframes: [winter, spring, summer, fall] (sRGB hex).
const LEAF_COL: string[][] = [
  ['#5e6440', '#6c7438', '#646840', '#62663e'],
  ['#7e7a68', '#7c8060', '#8a836c', '#7a7462'],
  ['#5a5c3c', '#647040', '#5c6438', '#6a6440'],
  ['#5c5a48', '#6a7a40', '#5c6a3a', '#8a7a40'],
  ['#38422e', '#3c4a30', '#3a442e', '#3a442e'],
  ['#6a6050', '#6a7a5a', '#64705a', '#8a7a5a'],
  ['#4c5a38', '#56663a', '#4e5a36', '#4e5836'],
  ['#706a5e', '#8aa84b', '#5f7a38', '#c99c34'],
  ['#6a7440', '#727e40', '#68703e', '#6a723e'],
  ['#6a7440', '#76803e', '#6e763e', '#6e763e'],
  ['#5a6a40', '#62743e', '#5c6c3c', '#5c6c3c'],
  ['#c8c0a0', '#c8c0a0', '#c8c0a0', '#c8c0a0'],
];
const BARK = ['#6a6258', '#7a7062', '#5a4c40', '#5e5048', '#4a4038', '#5a4a40', '#4c443c', '#8a8274', '#4a423a', '#5a5048', '#6a6052', '#3a3428'];
const THATCH = ['#6a6258', '#7a7062', '#5a4c40', '#5e5048', '#4a4038', '#5a4a40', '#4c443c', '#8a8274', '#6e6558', '#857660', '#a08a62', '#d8cca8'];

/** Bloom colour, the month (0 = Jan 1) it peaks, and how long it lasts (months). */
const BLOOM: Partial<Record<number, { col: string; peak: number; width: number }>> = {
  [TREE.CREOSOTE]: { col: '#d8c040', peak: 3.3, width: 0.7 },
  [TREE.DESERT_WILLOW]: { col: '#d8a0c8', peak: 5.6, width: 1.3 },
  [TREE.TAMARISK]: { col: '#d8a0b0', peak: 3.9, width: 1.0 },
  [TREE.JOSHUA]: { col: '#d8d4b0', peak: 2.6, width: 0.75 },
  [TREE.YUCCA]: { col: '#efe9d2', peak: 3.5, width: 0.6 },
};

function kf(keys: number[], m: number) {
  const i0 = ((Math.floor(m) % 12) + 12) % 12;
  const i1 = (i0 + 1) % 12;
  const t = m - Math.floor(m);
  return keys[i0] + (keys[i1] - keys[i0]) * t;
}

/** Same as the GLSL hash12. */
export function hash12(x: number, y: number) {
  const f = (v: number) => v - Math.floor(v);
  let a = f(x * 0.1031), b = f(y * 0.1031), c = f(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return f((a + b) * c);
}

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Tile {
  data: Float32Array; // 8 floats per plant: x y z rot r h species seed
  count: number;
  cx: number;
  cz: number;
  minY: number;
  maxY: number;
}

interface Kind {
  geo: THREE.InstancedBufferGeometry;
  a0: THREE.InstancedBufferAttribute;
  a1: THREE.InstancedBufferAttribute;
  cap: number;
  n: number;
}

/**
 * Plant size for a species: crown radius and height (m). Rosette plants are
 * modelled in height units, so their radius equals their height.
 */
function sizeFor(sp: number, s: number, s2: number): [number, number] {
  switch (sp) {
    case TREE.CREOSOTE:
      return [0.8 + s * 0.7, 1.0 + s2 * 1.2];
    case TREE.BURSAGE:
      return [0.45 + s * 0.5, 0.45 + s2 * 0.7];
    case TREE.CATCLAW:
      return [1.8 + s * 1.4, 2.5 + s2 * 2.0];
    case TREE.DESERT_WILLOW:
      return [2.2 + s * 1.3, 3.5 + s2 * 2.5];
    case TREE.PINYON:
      return [1.5 + s * 1.5, 3 + s2 * 3];
    case TREE.TAMARISK:
      return [2.5 + s * 1.5, 3.5 + s2 * 2.5];
    case TREE.TOWN:
      return [2.5 + s * 2, 5 + s2 * 4];
    case TREE.COTTONWOOD:
      return [4 + s * 3, 12 + s2 * 6];
    case TREE.JOSHUA: {
      // Most Joshua trees are 3–6 m; the old giants near Searchlight top 9 m.
      const h = 2.6 + Math.pow(s, 1.6) * 6.4;
      return [h, h];
    }
    case TREE.YUCCA: {
      const h = 1.4 + s * 2.2;
      return [h, h];
    }
    case TREE.PALM: {
      const h = 8 + s * 8;
      return [h, h];
    }
    default: {
      const h = 0.8 + s * 1.0;
      return [h, h];
    }
  }
}

/**
 * Species for a plant seen in the imagery, from the land-cover band it stands
 * in (creosote flats, the Joshua belt, blackbrush slopes, pinyon crests,
 * washes, town and shore) and how dark its blob is.
 */
function speciesFor(lc: number, dark: number, s: number): number {
  const big = 0.6 + dark * 1.5;
  switch (lc) {
    case LC.WETLAND:
      return s < 0.8 ? TREE.TAMARISK : TREE.DESERT_WILLOW;
    case LC.WASH:
      if (dark > 0.3 && s < 0.4) return TREE.CATCLAW;
      if (dark > 0.3 && s < 0.55) return TREE.DESERT_WILLOW;
      return s < 0.8 ? TREE.CREOSOTE : TREE.BURSAGE;
    case LC.URBAN_OPEN:
      // "Developed open" is mostly the US-95 corridor and dirt lots: still desert.
      return s < 0.3 ? TREE.JOSHUA : s < 0.4 ? TREE.YUCCA : s < 0.75 ? TREE.CREOSOTE : TREE.BURSAGE;
    case LC.URBAN_LOW:
    case LC.URBAN_MED:
    case LC.URBAN_HIGH:
      // Searchlight yards: Joshua trees, a few Aleppo pines and athel, the odd palm.
      if (s < 0.14) return TREE.TOWN;
      if (s < 0.18) return TREE.PALM;
      if (s < 0.5) return TREE.JOSHUA;
      if (s < 0.6) return TREE.YUCCA;
      return TREE.CREOSOTE;
    case LC.FARM:
      return TREE.TOWN;
    case LC.PINYON:
      if (s < 0.65) return TREE.PINYON;
      if (s < 0.75) return TREE.JOSHUA;
      if (s < 0.85) return TREE.YUCCA;
      return TREE.BURSAGE;
    case LC.JOSHUA:
      if (s < 0.38 * big) return TREE.JOSHUA;
      if (s < 0.56 * big) return TREE.YUCCA;
      if (s < 0.62 * big) return TREE.CHOLLA;
      return s < 0.8 ? TREE.BURSAGE : TREE.CREOSOTE;
    case LC.BLACKBRUSH:
      if (s < 0.15 * big) return TREE.JOSHUA;
      if (s < 0.27 * big) return TREE.YUCCA;
      if (s < 0.32 * big) return TREE.CHOLLA;
      return s < 0.8 ? TREE.BURSAGE : TREE.CREOSOTE;
    case LC.CREOSOTE:
      if (s < 0.03) return TREE.YUCCA;
      if (s < 0.05) return TREE.CATCLAW;
      if (s < 0.12) return TREE.CHOLLA;
      return s < 0.72 ? TREE.CREOSOTE : TREE.BURSAGE;
    default:
      return s < 0.5 ? TREE.CREOSOTE : s < 0.9 ? TREE.BURSAGE : TREE.YUCCA;
  }
}

/** Real Mojave plants: every Joshua tree, yucca and shrub detected in the aerial imagery. */
export class Trees {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private tiles: Tile[] = [];
  /** kinds[form][variant][lod] */
  private kinds = new Map<PlantForm, Kind[][]>();
  private allKinds: Kind[] = [];
  private lastPos = new THREE.Vector3(1e9, 0, 0);
  private lastQuat = new THREE.Quaternion();
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private box = new THREE.Box3();
  counts = [0, 0, 0];
  total = 0;
  private tileMap = new Map<number, Tile>();
  private zone = 0;
  private outer = new Map<string, Tile>();
  private hf: Heightfield;

  /** Hand-placed plants on top of those detected in the imagery (town landscaping, cemetery). */
  constructor(
    buf: ArrayBuffer,
    zone: number,
    hf: Heightfield,
    private roads?: RoadIndex,
    private planted: PlantedTree[] = [],
    private water?: { depthAt(x: number, z: number): number; sample(x: number, z: number): { mask: number; depth: number } },
  ) {
    this.hf = hf;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: treeVertex,
      fragmentShader: treeFragment,
      uniforms: {
        ...G,
        uLeafColor: { value: Array.from({ length: SPECIES_COUNT }, () => new THREE.Color()) },
        uBarkColor: { value: BARK.map((h) => new THREE.Color(h)) },
        uThatchColor: { value: THATCH.map((h) => new THREE.Color(h)) },
        uBloomColor: { value: Array.from({ length: SPECIES_COUNT }, (_, s) => new THREE.Color(BLOOM[s]?.col ?? '#ffffff')) },
        uLeafAmount: { value: new Array(SPECIES_COUNT).fill(1) },
        uBloom: { value: new Array(SPECIES_COUNT).fill(0) },
        // Creosote and bursage are airy, see-through shrubs; catclaw is lacy.
        uOpen: { value: [1, 0.45, 0.6, 0.3, 0, 0.35, 0, 0, 0, 0, 0, 0] },
        uFallTint: { value: new THREE.Color('#a0783a') },
      },
      side: THREE.DoubleSide,
    });

    for (const form of Object.keys(VARIANTS) as PlantForm[]) {
      const vs: Kind[][] = [];
      for (let v = 0; v < VARIANTS[form]; v++) {
        const lods: Kind[] = [];
        for (let lod = 0; lod < 3; lod++) {
          const base = buildPlant(form, lod as 0 | 1 | 2, 7 + v * 31 + lod);
          const g = new THREE.InstancedBufferGeometry();
          g.index = base.index;
          for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
          const cap = Math.ceil((CAP[lod] * BUDGET[form]) / VARIANTS[form]) + 64;
          const a0 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
          const a1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
          a0.setUsage(THREE.DynamicDrawUsage);
          a1.setUsage(THREE.DynamicDrawUsage);
          g.setAttribute('aInst0', a0);
          g.setAttribute('aInst1', a1);
          g.instanceCount = 0;
          const mesh = new THREE.Mesh(g, this.material);
          mesh.frustumCulled = false;
          this.group.add(mesh);
          const kind = { geo: g, a0, a1, cap, n: 0 };
          lods.push(kind);
          this.allKinds.push(kind);
        }
        vs.push(lods);
      }
      this.kinds.set(form, vs);
    }
    this.decode(buf, zone, hf);
  }

  private push(out: number[], x: number, z: number, sp: number, seed: number) {
    const [r, h] = sizeFor(sp, hash(seed * 7.7), hash(seed * 3.3));
    out.push(x, this.hf.height(x, z) - (ROSETTE_FORMS.has(FORM[sp]) ? 0.1 : 0.3), z, seed * 6.2831, r, h, sp, hash(seed * 17.3));
  }

  /** Plants for one tile outside the imagery zone, from land cover alone. */
  private growTile(ti: number, tj: number): Tile | null {
    const hf = this.hf;
    const x0 = ti * TILE, z0 = tj * TILE;
    const out: number[] = [];
    for (let z = z0 + 5; z < z0 + TILE; z += 10)
      for (let x = x0 + 5; x < x0 + TILE; x += 10) {
        const seed = hash(x * 0.311 + z * 0.917);
        const jx = x + (hash(seed * 3.1) - 0.5) * 9, jz = z + (hash(seed * 5.3) - 0.5) * 9;
        const lc = hf.landcover(jx, jz);
        let p = 0;
        if (this.water) {
          const w = this.water.sample(jx, jz);
          if (w.depth > 0.05) continue;
          // Tamarisk thickets crowd the lake shore.
          if (w.mask > 0.03) p = 0.5;
        }
        if (lc === LC.JOSHUA) p = Math.max(p, 0.09);
        else if (lc === LC.BLACKBRUSH || lc === LC.PINYON) p = Math.max(p, 0.07);
        else if (lc === LC.CREOSOTE || lc === LC.WASH) p = Math.max(p, 0.05);
        else if (lc === LC.WETLAND) p = Math.max(p, 0.3);
        else if (lc >= LC.URBAN_OPEN && lc <= LC.URBAN_HIGH) p = Math.max(p, 0.06);
        if (hash(seed * 11.7) > p) continue;
        const road = this.roads?.nearest(jx, jz, 12);
        if (road && road.dist < road.halfWidth + 1.8) continue;
        const sp = p >= 0.5 && lc !== LC.JOSHUA ? TREE.TAMARISK : speciesFor(lc, 0.3, hash(seed * 23.1));
        this.push(out, jx, jz, sp, seed);
      }
    if (!out.length) return null;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < out.length; i += 8) {
      minY = Math.min(minY, out[i + 1]);
      maxY = Math.max(maxY, out[i + 1] + out[i + 5]);
    }
    return { data: new Float32Array(out), count: out.length / 8, cx: x0 + TILE / 2, cz: z0 + TILE / 2, minY, maxY };
  }

  /** Grows outer tiles near the camera (a few per call) and drops far ones. Returns true if anything changed. */
  private growOuter(cx: number, cz: number): boolean {
    let changed = false;
    const zh = this.zone / 2;
    for (const [key, t] of this.outer) {
      if (Math.hypot(t.cx - cx, t.cz - cz) > OUTER_DROP) {
        this.outer.delete(key);
        if (t.count) this.tiles.splice(this.tiles.indexOf(t), 1);
        changed = true;
      }
    }
    const want: [number, number, number][] = [];
    const n = Math.ceil(OUTER_R / TILE);
    const ci = Math.floor(cx / TILE), cj = Math.floor(cz / TILE);
    for (let tj = cj - n; tj <= cj + n; tj++)
      for (let ti = ci - n; ti <= ci + n; ti++) {
        const x = (ti + 0.5) * TILE, z = (tj + 0.5) * TILE;
        if (Math.abs(x) < zh && Math.abs(z) < zh) continue;
        if (Math.abs(x) > LC_HALF || Math.abs(z) > LC_HALF) continue;
        const d = Math.hypot(x - cx, z - cz);
        if (d > OUTER_R || this.outer.has(ti + ',' + tj)) continue;
        want.push([d, ti, tj]);
      }
    want.sort((a, b) => a[0] - b[0]);
    const t0 = performance.now();
    for (const [, ti, tj] of want) {
      if (performance.now() - t0 > 6) break;
      const t = this.growTile(ti, tj);
      const empty: Tile = { data: new Float32Array(0), count: 0, cx: (ti + 0.5) * TILE, cz: (tj + 0.5) * TILE, minY: 0, maxY: 0 };
      this.outer.set(ti + ',' + tj, t ?? empty);
      if (t) {
        this.tiles.push(t);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Deepest trunk overlapping a circle at (x, z), as a push-out direction and
   * depth. Shrubs, yuccas and cholla are ignored (the truck rolls over them).
   */
  trunkHit(x: number, z: number, radius: number): { nx: number; nz: number; depth: number } | null {
    const zone = this.zone;
    const tilesN = Math.ceil(zone / TILE);
    const reach = radius + 1;
    const i0 = Math.floor((x - reach + zone / 2) / TILE), i1 = Math.floor((x + reach + zone / 2) / TILE);
    const j0 = Math.floor((z - reach + zone / 2) / TILE), j1 = Math.floor((z + reach + zone / 2) / TILE);
    let best: { nx: number; nz: number; depth: number } | null = null;
    for (let tj = j0; tj <= j1; tj++)
      for (let ti = i0; ti <= i1; ti++) {
        if (ti < 0 || tj < 0 || ti >= tilesN || tj >= tilesN) continue;
        const t = this.tileMap.get(tj * tilesN + ti);
        if (t) check(t);
      }
    const g0 = Math.floor((x - reach) / TILE), g1 = Math.floor((x + reach) / TILE);
    const h0 = Math.floor((z - reach) / TILE), h1 = Math.floor((z + reach) / TILE);
    for (let tj = h0; tj <= h1; tj++)
      for (let ti = g0; ti <= g1; ti++) {
        const t = this.outer.get(ti + ',' + tj);
        if (t) check(t);
      }
    return best;

    function check(t: Tile) {
      const d = t.data;
      for (let k = 0; k < t.count; k++) {
        const o = k * 8;
        const dx = x - d[o], dz = z - d[o + 2];
        if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
        const sp = d[o + 6];
        if (sp === TREE.CREOSOTE || sp === TREE.BURSAGE || sp === TREE.YUCCA || sp === TREE.CHOLLA) continue;
        const trunk = sp === TREE.JOSHUA ? d[o + 5] * 0.05 : sp === TREE.PALM ? d[o + 5] * 0.035 : Math.min(0.7, Math.max(0.25, d[o + 4] * 0.08));
        const dist = Math.hypot(dx, dz);
        const depth = radius + trunk - dist;
        if (depth > 0 && (!best || depth > best.depth)) {
          const l = dist || 1;
          best = { nx: dx / l, nz: dz / l, depth };
        }
      }
    }
  }

  /** Registers the near plant LODs as shadow casters. */
  addShadowCasters(shadow: ShadowMap) {
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: treeVertex,
      fragmentShader: treeFragment,
      uniforms: this.material.uniforms,
      defines: { SHADOW_PASS: '' },
      side: THREE.DoubleSide,
    });
    for (const vs of this.kinds.values())
      for (const lods of vs) {
        shadow.addCaster(lods[0].geo, mat);
        shadow.addCaster(lods[1].geo, mat);
      }
  }

  private decode(buf: ArrayBuffer, zone: number, hf: Heightfield) {
    // Tiles cover the imagery zone, widened to take any hand-planted plants outside it.
    let grid = zone;
    for (const t of this.planted) grid = Math.max(grid, 2 * Math.max(Math.abs(t.x), Math.abs(t.z)) + 2 * TILE);
    grid = Math.ceil(grid / (2 * TILE)) * 2 * TILE;
    this.zone = grid;
    const v = new DataView(buf);
    const n = buf.byteLength / 6;
    const tilesN = Math.ceil(grid / TILE);
    const lists: number[][] = Array.from({ length: tilesN * tilesN }, () => []);
    const add = (x: number, z: number, sp: number, seed: number, r?: number, h?: number) => {
      const ti = Math.floor((x + grid / 2) / TILE);
      const tj = Math.floor((z + grid / 2) / TILE);
      if (ti < 0 || tj < 0 || ti >= tilesN || tj >= tilesN) return;
      const l = lists[tj * tilesN + ti];
      this.push(l, x, z, sp, seed);
      if (r !== undefined && h !== undefined) {
        l[l.length - 4] = r;
        l[l.length - 3] = h;
      }
    };
    for (let k = 0; k < n; k++) {
      const x = (v.getUint16(k * 6, true) / 65535 - 0.5) * zone;
      const z = (v.getUint16(k * 6 + 2, true) / 65535 - 0.5) * zone;
      const dark = v.getUint8(k * 6 + 5) / 255;
      const seed = hash(k * 0.61803 + x * 0.001);
      const lc = hf.landcover(x, z);
      if (lc === LC.WATER) continue;
      if (this.water && this.water.depthAt(x, z) > 0.15) continue;
      const sp = speciesFor(lc, dark, hash(seed * 29.3));
      // Imagery blobs over a road put the plant on the asphalt; step it onto the shoulder.
      let tx = x, tz = z;
      const road = this.roads?.nearest(x, z, 16);
      if (road) {
        const clear = road.halfWidth + 1.3 + (sp === TREE.CREOSOTE || sp === TREE.BURSAGE ? 0.3 : 0.8);
        if (road.dist < clear) {
          let nx = x - road.x, nz = z - road.z;
          const l = Math.hypot(nx, nz);
          if (l > 0.01) (nx /= l), (nz /= l);
          else (nx = -road.dz), (nz = road.dx);
          tx = road.x + nx * clear;
          tz = road.z + nz * clear;
        }
      }
      add(tx, tz, sp, seed);
    }
    this.planted.forEach((t, k) => add(t.x, t.z, t.sp, hash(k * 3.17 + 0.5), t.r, t.h));
    for (let tj = 0; tj < tilesN; tj++) {
      for (let ti = 0; ti < tilesN; ti++) {
        const l = lists[tj * tilesN + ti];
        if (!l.length) continue;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < l.length; i += 8) {
          minY = Math.min(minY, l[i + 1]);
          maxY = Math.max(maxY, l[i + 1] + l[i + 5]);
        }
        const tile: Tile = {
          data: new Float32Array(l),
          count: l.length / 8,
          cx: -grid / 2 + (ti + 0.5) * TILE,
          cz: -grid / 2 + (tj + 0.5) * TILE,
          minY,
          maxY,
        };
        this.tiles.push(tile);
        this.tileMap.set(tj * tilesN + ti, tile);
        this.total += l.length / 8;
      }
    }
  }

  /** Seasonal foliage: leaf-out, colour and blooms for the given month (0 = Jan 1). */
  setSeason(month: number) {
    const u = this.material.uniforms;
    const amount = u.uLeafAmount.value as number[];
    const bloom = u.uBloom.value as number[];
    const cols = u.uLeafColor.value as THREE.Color[];
    // Weights for winter / spring / summer / fall colour keys.
    const w = [
      kf([1, 0.8, 0.2, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.8], month),
      kf([0, 0.2, 0.8, 1, 0.7, 0.2, 0, 0, 0, 0, 0, 0], month),
      kf([0, 0, 0, 0, 0.3, 0.8, 1, 1, 0.7, 0.2, 0, 0], month),
      kf([0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 0.8, 0.2], month),
    ];
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    const c = new THREE.Color();
    for (let s = 0; s < SPECIES_COUNT; s++) {
      amount[s] = kf(LEAF_KF[s], month);
      cols[s].setRGB(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        c.set(LEAF_COL[s][k]);
        cols[s].r += (c.r * w[k]) / sum;
        cols[s].g += (c.g * w[k]) / sum;
        cols[s].b += (c.b * w[k]) / sum;
      }
      const b = BLOOM[s];
      bloom[s] = b ? Math.max(0, Math.min(1, (1 - Math.abs(month - b.peak) / b.width) * 1.6)) : 0;
    }
    (u.uFallTint.value as THREE.Color).set(w[3] / sum > 0.3 ? '#c49a34' : '#5d6a3a');
  }

  update(camera: THREE.PerspectiveCamera) {
    const grew = this.growOuter(camera.position.x, camera.position.z);
    const moved = camera.position.distanceTo(this.lastPos);
    const turned = 1 - Math.abs(camera.quaternion.dot(this.lastQuat));
    if (moved < 25 && turned < 0.002 && !grew) return;
    this.lastPos.copy(camera.position);
    this.lastQuat.copy(camera.quaternion);
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (const k of this.allKinds) k.n = 0;
    const half = TILE / 2 + 12;
    // Visible tiles nearest-first, so instance caps only ever drop the farthest plants.
    const vis: [number, Tile][] = [];
    for (const t of this.tiles) {
      const dx = Math.max(Math.abs(t.cx - cx) - half, 0);
      const dz = Math.max(Math.abs(t.cz - cz) - half, 0);
      const dy = Math.max(t.minY - cy, cy - t.maxY, 0);
      const tileDist = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (tileDist > LOD2) continue;
      this.box.min.set(t.cx - half, t.minY - 2, t.cz - half);
      this.box.max.set(t.cx + half, t.maxY + 2, t.cz + half);
      if (!this.frustum.intersectsBox(this.box)) continue;
      vis.push([tileDist, t]);
    }
    vis.sort((a, b) => a[0] - b[0]);
    const counts = [0, 0, 0];
    for (const [, t] of vis) {
      const d = t.data;
      for (let i = 0; i < t.count; i++) {
        const o = i * 8;
        const ex = d[o] - cx;
        const ey = d[o + 1] - cy;
        const ez = d[o + 2] - cz;
        const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const sp = d[o + 6];
        if (dist > MAX_DIST[sp]) continue;
        let lod = dist < LOD0 ? 0 : dist < LOD1 ? 1 : 2;
        let scale = 1;
        if (lod === 2) {
          // Thin small plants with distance; survivors grow slightly to keep cover.
          const keep = Math.min(1, (sp === TREE.JOSHUA ? 1.45 : 1.25) - dist / LOD2);
          if (d[o + 7] > keep) continue;
          scale = 1 + (1 - keep) * 0.35;
        }
        const form = FORM[sp];
        const lods = this.kinds.get(form)![Math.floor(d[o + 7] * 997) % VARIANTS[form]];
        let kind = lods[lod];
        if (kind.n >= kind.cap) {
          if (lod === 2) continue;
          lod++;
          kind = lods[lod];
          if (kind.n >= kind.cap) continue;
        }
        const k = kind.n++ * 4;
        counts[lod]++;
        const a0 = kind.a0.array as Float32Array;
        const a1 = kind.a1.array as Float32Array;
        a0[k] = d[o];
        a0[k + 1] = d[o + 1];
        a0[k + 2] = d[o + 2];
        a0[k + 3] = d[o + 3];
        a1[k] = d[o + 4] * scale;
        a1[k + 1] = d[o + 5] * scale;
        a1[k + 2] = sp;
        a1[k + 3] = d[o + 7];
      }
    }
    for (const kind of this.allKinds) {
      kind.geo.instanceCount = kind.n;
      kind.a0.clearUpdateRanges();
      kind.a0.addUpdateRange(0, kind.n * 4);
      kind.a0.needsUpdate = true;
      kind.a1.clearUpdateRanges();
      kind.a1.addUpdateRange(0, kind.n * 4);
      kind.a1.needsUpdate = true;
    }
    this.counts = counts;
  }
}
