import * as THREE from 'three';
import { G } from '../render/globals';
import { propFragment, propVertex } from '../render/shaders/propShader';
import type { ShadowMap } from '../render/shadows';
import type { Heightfield } from './heightfield';
import { merge, StrutBuilder, withPart } from './geom';
import { LC, type OsmData } from './meta';
import { latticeGeometry, poleGeometry, PYLON, type Pylon } from './powerLines';

export const KIND = { HOUSE: 0, SHED: 1, TANK: 2, TOWER: 3, HUT: 4, VEHICLE: 5, TRAILER: 6, STUCCO: 7 } as const;
const GEO = { HOUSE: 0, SHED: 1, TANK: 2, TOWER: 3, LATTICE: 4, POLE: 5, TRAILER: 6, FLAT: 7 } as const;

function hash(n: number) {
  const s = Math.sin(n * 91.345 + 47.853) * 43758.5453;
  return s - Math.floor(s);
}

/** Unit house: walls to 0.62, low hip-ish gable roof to 0.9, ridge along x. */
function houseGeometry(): THREE.BufferGeometry {
  const walls = new THREE.BoxGeometry(1, 0.62, 1).translate(0, 0.31, 0);
  const e = 0.56;
  const v = [
    -e, 0.6, -e, e, 0.6, -e, e, 0.9, 0, -e, 0.6, -e, e, 0.9, 0, -e, 0.9, 0,
    -e, 0.6, e, -e, 0.9, 0, e, 0.9, 0, -e, 0.6, e, e, 0.9, 0, e, 0.6, e,
    -0.5, 0.62, -0.5, -0.5, 0.9, 0, -0.5, 0.62, 0.5,
    0.5, 0.62, -0.5, 0.5, 0.62, 0.5, 0.5, 0.9, 0,
  ];
  const gables = new THREE.BufferGeometry();
  gables.setAttribute('position', new THREE.Float32BufferAttribute(v.slice(36), 3));
  gables.computeVertexNormals();
  const slopes = new THREE.BufferGeometry();
  slopes.setAttribute('position', new THREE.Float32BufferAttribute(v.slice(0, 36), 3));
  slopes.computeVertexNormals();
  return merge([withPart(walls, 0), withPart(gables, 0), withPart(slopes, 1)]);
}

/** Unit metal shop building: tall walls, shallow ridged roof. */
function shedGeometry(): THREE.BufferGeometry {
  const walls = new THREE.BoxGeometry(1, 0.85, 1).translate(0, 0.425, 0);
  const roof = new THREE.CylinderGeometry(0.72, 0.72, 1.02, 12, 1, false, -0.78, 1.56)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.22, 1.4)
    .translate(0, 0.7, 0);
  return merge([withPart(walls, 0), withPart(roof, 1)]);
}

/** Welded steel water tank with a shallow cone lid. */
function tankGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.5, 0.5, 0.9, 20, 1, true).translate(0, 0.45, 0);
  const cap = new THREE.ConeGeometry(0.51, 0.1, 20, 1, true).translate(0, 0.95, 0);
  return merge([withPart(body, 2), withPart(cap, 1)]);
}

/** Single-wide manufactured home: long low box, barely pitched metal roof, along x. */
function trailerGeometry(): THREE.BufferGeometry {
  const walls = new THREE.BoxGeometry(1, 0.8, 1).translate(0, 0.4, 0);
  const v = [
    -0.52, 0.8, -0.54, 0.52, 0.8, -0.54, 0.52, 1, 0, -0.52, 0.8, -0.54, 0.52, 1, 0, -0.52, 1, 0,
    -0.52, 0.8, 0.54, -0.52, 1, 0, 0.52, 1, 0, -0.52, 0.8, 0.54, 0.52, 1, 0, 0.52, 0.8, 0.54,
  ];
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roof.computeVertexNormals();
  const ends = new THREE.BufferGeometry();
  ends.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.8, -0.5, -0.5, 1, 0, -0.5, 0.8, 0.5, 0.5, 0.8, -0.5, 0.5, 0.8, 0.5, 0.5, 1, 0], 3));
  ends.computeVertexNormals();
  return merge([withPart(walls, 0), withPart(ends, 0), withPart(roof, 1)]);
}

/** Flat-roofed block with a parapet: stucco homes and roadside businesses. */
function flatGeometry(): THREE.BufferGeometry {
  const walls = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const deck = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2).translate(0, 0.9, 0);
  return merge([withPart(walls, 0), withPart(deck, 1)]);
}

/** Triangular lattice radio mast, unit height, unit base width. */
function towerGeometry(): THREE.BufferGeometry {
  const sb = new StrutBuilder();
  const leg = (h: number) => 0.5 * (1 - 0.7 * h);
  const corner = (k: number, h: number) => {
    const a = (k / 3) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * leg(h), h, Math.sin(a) * leg(h));
  };
  const seg = 14;
  for (let i = 0; i < seg; i++) {
    const h0 = i / seg;
    const h1 = (i + 1) / seg;
    for (let k = 0; k < 3; k++) {
      sb.strut(corner(k, h0), corner(k, h1), 0.02);
      sb.strut(corner(k, h0), corner((k + 1) % 3, h1), 0.008);
      sb.strut(corner(k, h1), corner((k + 1) % 3, h1), 0.008);
    }
  }
  return sb.build();
}

const PROP_TILE = 2000;

interface Batch {
  geo: THREE.InstancedBufferGeometry;
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  radius: number;
  tower: boolean;
  caster?: THREE.Mesh;
}

/**
 * OSM buildings as desert homes (single-wides, stucco ranch houses), metal shop
 * buildings and water tanks, plus radio masts and transmission pylons.
 * `skip` reserves lots that hand-built landmarks occupy.
 */
export class Props {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly shadowMaterial: THREE.ShaderMaterial;
  /** Point lights (world xyz, rgb, size, blink) for the night-light renderer. */
  readonly lights: number[] = [];
  private batches: Batch[] = [];

  constructor(osm: OsmData, hf: Heightfield, pylons: Pylon[] = [], skip: (x: number, z: number) => boolean = () => false) {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: propVertex,
      fragmentShader: propFragment,
      uniforms: { ...G },
      side: THREE.DoubleSide,
    });
    this.shadowMaterial = this.material.clone();
    this.shadowMaterial.uniforms = this.material.uniforms;
    this.shadowMaterial.defines = { SHADOW_PASS: '' };

    const geos = [houseGeometry(), shedGeometry(), tankGeometry(), towerGeometry(), latticeGeometry(), poleGeometry(), trailerGeometry(), flatGeometry()];
    const data: number[][][] = geos.map(() => []);
    const c = new THREE.Color();
    const push = (kind: number, geo: number, x: number, z: number, w: number, h: number, d: number, ang: number, wall: string, roof: string, lit: number, seed: number) => {
      const y = hf.height(x, z) - 0.4;
      c.set(wall);
      const wr = [c.r, c.g, c.b];
      c.set(roof);
      data[geo].push([x, y, z, ang, w, h, d, kind, wr[0], wr[1], wr[2], lit, c.r, c.g, c.b, seed]);
    };

    // Sun-faded desert paint: sand, adobe, bone white, sage, the odd turquoise.
    const STUCCO = ['#d8c6a4', '#cdb08a', '#e6dcc8', '#c49a74', '#b8a88c', '#d9cbb0', '#a9b49a', '#e0d0b4', '#c8b49a', '#9fb8b0'];
    const TRAILER = ['#e8e4da', '#ddd6c4', '#c9c2b0', '#d8cfbc', '#b9c2c4', '#e2d8c0', '#cfc6a8'];
    const ROOF = ['#6a5e52', '#7a6a5a', '#5a5048', '#8a7058', '#8a5a3e', '#6e4a36'];
    const FLATROOF = ['#d8d6d0', '#c8c4ba', '#5a554e', '#e4e2dc'];
    const METAL = ['#c4c6c8', '#b0b4b8', '#d8d8d4', '#9ea3a8', '#b8a890', '#8f9a8a'];
    const addHome = (x: number, z: number, w: number, d: number, ang: number, s: number, i: number, town: boolean) => {
      const lit = s < (town ? 0.7 : 0.45) ? 1 : 0;
      const long = Math.max(w, d) / Math.max(1, Math.min(w, d));
      if (long > 2.2 && Math.min(w, d) < 7.5) {
        // Single-wide: always ~4.3 m wide, the long axis along x.
        const a = w >= d ? ang : ang + Math.PI / 2;
        push(KIND.TRAILER, GEO.TRAILER, x, z, Math.max(w, d), 4.3 + s * 0.4, Math.min(Math.max(Math.min(w, d), 4.2), 4.9), a, TRAILER[i % TRAILER.length], METAL[(i * 3) % METAL.length], lit, s);
      } else if (s < 0.45) {
        push(KIND.STUCCO, GEO.FLAT, x, z, w, 3.6 + s * 1.4, d, ang, STUCCO[i % STUCCO.length], FLATROOF[(i * 5) % FLATROOF.length], lit, s);
      } else {
        push(KIND.HOUSE, GEO.HOUSE, x, z, w, 5.2 + s * 1.2, d, ang, STUCCO[(i * 3) % STUCCO.length], ROOF[(i * 7) % ROOF.length], lit, s);
      }
      if (lit) {
        // Porch light, or a blue-white mercury yard light on a pole.
        const yard = s < 0.25;
        const off = yard ? Math.max(w, d) * 0.9 : w * 0.6;
        const col = yard ? [0.7, 0.85, 1] : s < 0.5 ? [1, 0.55, 0.22] : [1, 0.7, 0.4];
        this.lights.push(x + Math.cos(ang) * off, hf.height(x, z) + (yard ? 7 : 2.6), z + Math.sin(ang) * off, col[0], col[1], col[2], yard ? 1.2 : 0.7, 0);
      }
    };
    const isTown = (x: number, z: number) => {
      const lc = hf.landcover(x, z);
      return lc >= LC.URBAN_OPEN && lc <= LC.URBAN_HIGH;
    };
    osm.buildings.forEach(([x, z, w, d, ang], i) => {
      const s = hash(i + x * 0.01);
      const area = w * d;
      if (area < 10 || w > 400 || d > 400 || skip(x, z)) return;
      const town = isTown(x, z);
      const ratio = Math.max(w, d) / Math.max(1, Math.min(w, d));
      if (ratio < 1.15 && w > 3 && w < 16 && s < 0.4) {
        push(KIND.TANK, GEO.TANK, x, z, w, w * (0.5 + s * 0.6), w, ang, '#b8b0a0', '#a8a49c', 0, s);
        return;
      }
      if (area > 500 || (!town && area > 260)) {
        const h = 5.5 + Math.min(5, Math.sqrt(area) * 0.1) + s * 2;
        push(KIND.SHED, GEO.SHED, x, z, w, h, d, ang, METAL[i % METAL.length], METAL[(i + 2) % METAL.length], 0, s);
        return;
      }
      addHome(x, z, w, d, ang, s, i, town);
    });

    // Searchlight's grid is only partly mapped: fill empty lots along town
    // streets with homes, mostly single-wides set well back on big lots.
    const occ = new Set<number>();
    const key = (x: number, z: number) => Math.floor(x / 20) * 100003 + Math.floor(z / 20);
    for (const [x, z] of osm.buildings) occ.add(key(x, z));
    let seed = 1;
    for (const road of osm.roads) {
      const res = road.kind === 'residential';
      const town = res || road.kind === 'tertiary' || road.kind === 'trunk' || road.kind === 'unclassified';
      if (!town) continue;
      const p = road.pts;
      let lamp = 0;
      for (let k = 0; k + 3 < p.length; k += 2) {
        const dx = p[k + 2] - p[k];
        const dz = p[k + 3] - p[k + 1];
        const len = Math.hypot(dx, dz);
        if (len < 1) continue;
        const ux = dx / len;
        const uz = dz / len;
        const ang = Math.atan2(uz, ux);
        for (let t = 10; t < len; t += 26) {
          const cx = p[k] + ux * t;
          const cz = p[k + 1] + uz * t;
          const lc = hf.landcover(cx, cz);
          if (lc < LC.URBAN_LOW || lc > LC.URBAN_HIGH) continue;
          lamp += 26;
          // A few sodium cobra-heads at the town's main corners only.
          if (!res && lamp > 120) {
            lamp = 0;
            const sx = cx - uz * 9;
            const sz = cz + ux * 9;
            this.lights.push(sx, hf.height(sx, sz) + 9, sz, 1, 0.5, 0.14, 1.6, 0);
          }
          if (!res) continue;
          for (const side of [-1, 1]) {
            const s = hash(seed++);
            if (s < 0.45) continue;
            const off = 22 + s * 8;
            const hx = cx - uz * off * side;
            const hz = cz + ux * off * side;
            const kk = key(hx, hz);
            if (occ.has(kk) || !isTown(hx, hz) || skip(hx, hz)) continue;
            occ.add(kk);
            const single = s > 0.55;
            addHome(hx, hz, single ? 16 + s * 6 : 13 + s * 4, single ? 4.4 : 10 + s * 3, ang + (s > 0.8 ? Math.PI / 2 : 0), s, seed, true);
          }
        }
      }
    }

    // Steel water tanks on the hills above town and at the springs.
    for (const poi of osm.pois) {
      if (poi.kind !== 'storage_tank' && poi.kind !== 'water_tower') continue;
      const w = poi.fp ? Math.max(3, Math.min(poi.fp[0], 16)) : 6;
      push(KIND.TANK, GEO.TANK, poi.x, poi.z, w, w * 0.7 + 2, w, 0, '#b4ac9a', '#a09a90', 0, 0.3);
    }

    // Radio masts on the peaks and along US-95, with red obstruction beacons.
    for (const m of osm.masts) {
      const h = m.height ?? 30 + hash(m.x) * 60;
      push(KIND.TOWER, GEO.TOWER, m.x, m.z, Math.max(1.6, h * 0.035), h, Math.max(1.6, h * 0.035), hash(m.z) * 6, '#a8adb2', '#a8adb2', 0, 0.5);
      push(KIND.HUT, GEO.FLAT, m.x + 6, m.z + 3, 4.5, 3, 3.2, hash(m.z) * 3, '#c8c0b0', '#d8d6d0', 0, 0.2);
      if (h > 25) this.lights.push(m.x, hf.height(m.x, m.z) + h, m.z, 1, 0.08, 0.04, 3.0, 1);
    }

    // Transmission pylons (metres-scale geometry; wall colour tints insulators and wood).
    for (const t of pylons) {
      const lattice = t.type === PYLON.LATTICE;
      push(KIND.TOWER, lattice ? GEO.LATTICE : GEO.POLE, t.x, t.z, 1, 1, 1, t.ang, lattice ? '#5e6b70' : '#6a5440', '#4e5a5e', 0, 0.5);
    }

    // Split each kind into spatial tiles so the GPU only draws what's in view.
    geos.forEach((base, k) => {
      const byTile = new Map<number, number[][]>();
      for (const r of data[k]) {
        const key = k === GEO.TOWER ? -1 : Math.floor(r[0] / PROP_TILE) * 1000 + Math.floor(r[2] / PROP_TILE);
        const l = byTile.get(key);
        if (l) l.push(r);
        else byTile.set(key, [r]);
      }
      for (const rows of byTile.values()) {
        const g = new THREE.InstancedBufferGeometry();
        for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.attributes[name]);
        const n = rows.length;
        const t0 = new Float32Array(n * 4);
        const t1 = new Float32Array(n * 4);
        const wall = new Float32Array(n * 4);
        const roof = new Float32Array(n * 4);
        const box = new THREE.Box3();
        const metres = k === GEO.LATTICE || k === GEO.POLE;
        rows.forEach((r, i) => {
          t0.set(r.slice(0, 4), i * 4);
          t1.set(r.slice(4, 8), i * 4);
          wall.set(r.slice(8, 12), i * 4);
          roof.set(r.slice(12, 16), i * 4);
          const e = metres ? 9 : Math.max(r[4], r[6]);
          box.expandByPoint(new THREE.Vector3(r[0] - e, r[1], r[2] - e));
          box.expandByPoint(new THREE.Vector3(r[0] + e, r[1] + (metres ? 41 : r[5]), r[2] + e));
        });
        g.setAttribute('aT0', new THREE.InstancedBufferAttribute(t0, 4));
        g.setAttribute('aT1', new THREE.InstancedBufferAttribute(t1, 4));
        g.setAttribute('aWall', new THREE.InstancedBufferAttribute(wall, 4));
        g.setAttribute('aRoof', new THREE.InstancedBufferAttribute(roof, 4));
        g.instanceCount = n;
        g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        g.boundingBox = box;
        const mesh = new THREE.Mesh(g, this.material);
        this.group.add(mesh);
        this.batches.push({ geo: g, mesh, center: g.boundingSphere.center, radius: g.boundingSphere.radius, tower: k === GEO.TOWER });
      }
    });
  }

  /** Distance-culls far tiles and limits shadow casting to tiles near the focus. */
  update(cam: THREE.Vector3, focus: THREE.Vector3) {
    for (const b of this.batches) {
      const d = Math.hypot(b.center.x - cam.x, b.center.z - cam.z) - b.radius;
      b.mesh.visible = b.tower || d < 14000;
      if (b.caster) b.caster.visible = Math.hypot(b.center.x - focus.x, b.center.z - focus.z) - b.radius < 700;
    }
  }

  addShadowCasters(shadow: ShadowMap) {
    for (const b of this.batches) b.caster = shadow.addCaster(b.geo, this.shadowMaterial);
  }
}
