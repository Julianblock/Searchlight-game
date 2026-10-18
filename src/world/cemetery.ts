import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../render/globals';
import { cemeteryFragment, cemeteryVertex } from '../render/shaders/cemeteryShader';
import type { ShadowMap } from '../render/shadows';
import type { Heightfield } from './heightfield';
import type { OsmData } from './meta';
import { TREE, type PlantedTree } from '../veg/trees';

const PUBLIC_ROADS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential']);
const PART = { STONE: 0, INSCRIBED: 1, IRON: 2, CONCRETE: 3, SIGN: 4, WOOD: 5, PLASTIC: 6, ROCK: 7 } as const;

/** How each known plot looks: share of pioneer-era stones, crowding, vandalism. */
interface Character {
  old: number;
  density: number;
  vandal: number;
  closedSign: boolean;
}

const CHARACTER: Record<string, Character> = {
  // The gold camp's burial ground east of town: miners' graves from the 1900s
  // boom ringed with hillside rock under wooden crosses, beside modern granite.
  'Searchlight Cemetery': { old: 0.55, density: 0.5, vandal: 0.02, closedSign: true },
};
const DEFAULT: Character = { old: 0.85, density: 0.35, vandal: 0.06, closedSign: false };

export interface CemeteryPlan {
  name: string;
  poly: number[];
  cx: number;
  cz: number;
  /** Gate on the boundary, and the outward direction toward the road. */
  gate: [number, number] | null;
  out: [number, number];
  /** Unit direction of the fence side the gate sits in. */
  along: [number, number];
  /** A few Joshua trees and yuccas left standing among the graves. */
  trees: PlantedTree[];
  /** Drives crossing the plot (polyline points), kept clear of graves. */
  drives: number[][];
}

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function closest(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number, number] {
  const ex = bx - ax, ez = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez || 1)));
  const x = ax + ex * t, z = az + ez * t;
  return [x, z, Math.hypot(px - x, pz - z)];
}

function inside(poly: number[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function edgeDist(poly: number[], x: number, z: number) {
  let d = Infinity;
  for (let i = 0; i + 3 < poly.length; i += 2) d = Math.min(d, closest(x, z, poly[i], poly[i + 1], poly[i + 2], poly[i + 3])[2]);
  return d;
}

/**
 * Finds a gate for every cemetery near Searchlight and lays a dirt lane from the
 * nearest public road to it. Lanes go into `osm.roads` so they are drawn,
 * indexed and drivable like any other track; call before building roads.
 */
export function planCemeteries(osm: OsmData, radius = 14000): CemeteryPlan[] {
  const plans: CemeteryPlan[] = [];
  for (const c of osm.cemeteries ?? []) {
    const poly = c.pts.slice();
    if (poly.length < 8) continue;
    if (poly[0] !== poly[poly.length - 2] || poly[1] !== poly[poly.length - 1]) poly.push(poly[0], poly[1]);
    let cx = 0, cz = 0;
    const n = poly.length / 2 - 1;
    for (let i = 0; i < n; i++) (cx += poly[i * 2]), (cz += poly[i * 2 + 1]);
    cx /= n;
    cz /= n;
    if (Math.hypot(cx, cz) > radius) continue;

    // Nearest public road to the plot.
    let best = Infinity, rx = 0, rz = 0;
    for (const r of osm.roads) {
      if (!PUBLIC_ROADS.has(r.kind)) continue;
      const p = r.pts;
      if (Math.abs(p[0] - cx) > 6000 && Math.abs(p[p.length - 2] - cx) > 6000) continue;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const [x, z, d] = closest(cx, cz, p[i], p[i + 1], p[i + 2], p[i + 3]);
        if (d < best) (best = d), (rx = x), (rz = z);
      }
    }
    let gate: [number, number] | null = null;
    let out: [number, number] = [1, 0];
    let along: [number, number] = [0, 1];
    const lane = mappedLane(osm, poly);
    if (lane) {
      // A mapped track already runs to the plot: gate where it meets the fence.
      gate = lane.gate;
      out = lane.out;
      along = lane.along;
      osm.roads.push({ name: c.name || 'Cemetery lane', kind: 'track', grade: 2, lanes: 0, pts: [lane.end[0], lane.end[1], gate[0], gate[1], cx, cz] });
    } else if (best < 800) {
      // Gate in the middle of the fence side facing the road.
      let gd = Infinity;
      for (let i = 0; i + 3 < poly.length; i += 2) {
        const ex = poly[i + 2] - poly[i], ez = poly[i + 3] - poly[i + 1];
        const el = Math.hypot(ex, ez);
        if (el < 8) continue;
        const mx = poly[i] + ex / 2, mz = poly[i + 1] + ez / 2;
        const d = Math.hypot(rx - mx, rz - mz);
        if (d < gd) (gd = d), (gate = [mx, mz]), (along = [ex / el, ez / el]);
      }
      if (!gate) gate = [poly[0], poly[1]];
      const g = gate;
      const dx = rx - g[0], dz = rz - g[1];
      const l = Math.hypot(dx, dz);
      out = l > 0.5 ? [dx / l, dz / l] : [(g[0] - cx) / Math.hypot(g[0] - cx, g[1] - cz), (g[1] - cz) / Math.hypot(g[0] - cx, g[1] - cz)];
      // Lane from the road through the gate to the middle of the plot.
      const pts = l > 3 ? [rx, rz, g[0], g[1], cx, cz] : [g[0], g[1], cx, cz];
      osm.roads.push({ name: c.name || 'Cemetery lane', kind: 'track', grade: 2, lanes: 0, pts });
    }
    // Drives inside the plot are graded dirt, not pavement.
    const drives: number[][] = [];
    for (const r of osm.roads) {
      const p = r.pts;
      let inn = 0;
      for (let i = 0; i < p.length; i += 2) if (inside(poly, p[i], p[i + 1]) || edgeDist(poly, p[i], p[i + 1]) < 4) inn++;
      if (!inn) continue;
      if (r.kind === 'service' && inn / (p.length / 2) > 0.6) (r.kind = 'track'), (r.grade = 1);
      drives.push(p);
    }
    plans.push({ name: c.name, poly, cx, cz, gate, out, along, trees: shadeTrees(c.name, poly, cx, cz, gate), drives });
  }
  return plans;
}

/** An OSM track ending at the plot boundary, with the gate where it arrives. */
function mappedLane(osm: OsmData, poly: number[]) {
  for (const r of osm.roads) {
    if (r.kind !== 'track' || r.name) continue;
    const p = r.pts;
    const n = p.length;
    for (const [ex, ez, px, pz] of [
      [p[0], p[1], p[2], p[3]],
      [p[n - 2], p[n - 1], p[n - 4], p[n - 3]],
    ]) {
      let gd = Infinity;
      let gate: [number, number] = [ex, ez];
      let along: [number, number] = [1, 0];
      for (let i = 0; i + 3 < poly.length; i += 2) {
        const [x, z, d] = closest(ex, ez, poly[i], poly[i + 1], poly[i + 2], poly[i + 3]);
        if (d < gd) {
          gd = d;
          gate = [x, z];
          const l = Math.hypot(poly[i + 2] - poly[i], poly[i + 3] - poly[i + 1]) || 1;
          along = [(poly[i + 2] - poly[i]) / l, (poly[i + 3] - poly[i + 1]) / l];
        }
      }
      if (gd > 20) continue;
      const ox = px - ex, oz = pz - ez;
      const ol = Math.hypot(ox, oz) || 1;
      return { end: [ex, ez] as [number, number], gate, along, out: [ox / ol, oz / ol] as [number, number] };
    }
  }
  return null;
}

/** Joshua trees and Mojave yuccas the graves were dug around. */
function shadeTrees(name: string, poly: number[], cx: number, cz: number, gate: [number, number] | null): PlantedTree[] {
  const rnd = rand(name.length * 977 + Math.round(Math.abs(cx)));
  const trees: PlantedTree[] = [];
  const extent = Math.sqrt(Math.abs(polyArea(poly)));
  const want = extent < 20 ? 0 : Math.round(extent / 25);
  for (let tries = 0; tries < 200 && trees.length < want; tries++) {
    const x = cx + (rnd() - 0.5) * 0.85 * extent;
    const z = cz + (rnd() - 0.5) * 0.85 * extent;
    if (!inside(poly, x, z) || edgeDist(poly, x, z) < 3) continue;
    if (gate && closest(x, z, gate[0], gate[1], cx, cz)[2] < 4) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 8)) continue;
    if (rnd() < 0.6) trees.push({ x, z, r: 1.6 + rnd(), h: 4 + rnd() * 2.5, sp: TREE.JOSHUA });
    else trees.push({ x, z, r: 0.9, h: 1.6 + rnd(), sp: TREE.YUCCA });
  }
  return trees;
}

function polyArea(poly: number[]) {
  let a = 0;
  for (let i = 0; i + 3 < poly.length; i += 2) a += poly[i] * poly[i + 3] - poly[i + 2] * poly[i + 1];
  return a / 2;
}

/** Collects transformed pieces into one world-space geometry with material tags. */
class Mesher {
  pos: number[] = [];
  nrm: number[] = [];
  part: number[] = [];
  tint: number[] = [];
  seed: number[] = [];
  uv: number[] = [];
  private v = new THREE.Vector3();
  private nm = new THREE.Matrix3();

  /**
   * `front` tags faces pointing along local +z (an inscription or sign face);
   * `rect` maps those faces into the sign atlas.
   */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, part: number, tint: THREE.Color, seed: number, front = -1, rect?: [number, number, number, number]) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeBoundingBox();
    const bb = ng.boundingBox!;
    const w = bb.max.x - bb.min.x || 1;
    const h = bb.max.y - bb.min.y || 1;
    const p = ng.attributes.position;
    const nn = ng.attributes.normal;
    this.nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), ly = p.getY(i);
      const isFront = front >= 0 && nn.getZ(i) > 0.9;
      this.v.set(lx, ly, p.getZ(i)).applyMatrix4(m);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.set(nn.getX(i), nn.getY(i), nn.getZ(i)).applyMatrix3(this.nm).normalize();
      this.nrm.push(this.v.x, this.v.y, this.v.z);
      this.part.push(isFront ? front : part);
      this.tint.push(tint.r, tint.g, tint.b);
      this.seed.push(seed);
      const u = (lx - bb.min.x) / w, vv = (ly - bb.min.y) / h;
      if (isFront && rect) this.uv.push(rect[0] + u * rect[2], rect[1] + vv * rect[3]);
      else this.uv.push(u, vv);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const box = (w: number, h: number, d: number, x = 0, y = h / 2, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();

/** Upright tablet, optionally with a semicircular top, base at y = 0. */
function tablet(w: number, h: number, t: number, round: boolean) {
  if (!round) return box(w, h, t);
  const r = w / 2;
  const body = box(w, h - r, t);
  const cap = new THREE.CylinderGeometry(r, r, t, 14, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, h - r, 0).toNonIndexed();
  return mergeGeometries([body, cap])!;
}

function obelisk(s: number) {
  const shaft = new THREE.CylinderGeometry(0.12 * s, 0.19 * s, 1.6 * s, 4, 1).rotateY(Math.PI / 4).translate(0, 0.62 * s + 0.8 * s, 0).toNonIndexed();
  shaft.computeVertexNormals();
  const tip = new THREE.ConeGeometry(0.12 * s, 0.2 * s, 4).rotateY(Math.PI / 4).translate(0, 2.32 * s, 0).toNonIndexed();
  tip.computeVertexNormals();
  return [box(0.75 * s, 0.32 * s, 0.75 * s), box(0.55 * s, 0.3 * s, 0.55 * s, 0, 0.47 * s), shaft, tip];
}

function cross(s: number) {
  return mergeGeometries([box(0.5 * s, 0.28 * s, 0.32 * s), box(0.13 * s, 1.0 * s, 0.13 * s, 0, 0.78 * s), box(0.55 * s, 0.13 * s, 0.13 * s, 0, 1.0 * s)])!;
}

/** Painted sign boards in one canvas atlas. */
function signAtlas(names: string[]) {
  const W = 1024, ROW = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = ROW * names.length + 512;
  const g = canvas.getContext('2d')!;
  const rects: [number, number, number, number][] = [];
  const H = canvas.height;
  names.forEach((name, i) => {
    const y = i * ROW;
    g.fillStyle = '#5a3e26';
    g.fillRect(0, y, W, ROW);
    g.strokeStyle = '#e8dcc0';
    g.lineWidth = 10;
    g.strokeRect(18, y + 18, W - 36, ROW - 36);
    g.fillStyle = '#efe4c8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = name.toUpperCase();
    let size = 110;
    g.font = `bold ${size}px Georgia, serif`;
    while (g.measureText(label).width > W - 90 && size > 40) g.font = `bold ${(size -= 4)}px Georgia, serif`;
    g.fillText(label, W / 2, y + ROW / 2 + 6);
    rects.push([0, 1 - (y + ROW) / H, 1, ROW / H]);
  });
  // Enamel "closed after dark" notice.
  const y = names.length * ROW;
  g.fillStyle = '#f4f2ec';
  g.fillRect(0, y, 420, 512);
  g.fillStyle = '#b3201c';
  g.fillRect(0, y, 420, 120);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = 'bold 54px Helvetica, Arial, sans-serif';
  g.fillText('CEMETERY', 210, y + 50);
  g.fillText('CLOSED', 210, y + 100);
  g.fillStyle = '#151515';
  g.font = 'bold 40px Helvetica, Arial, sans-serif';
  g.fillText('SUNSET', 210, y + 175);
  g.fillText('TO SUNRISE', 210, y + 220);
  g.fillStyle = '#b3201c';
  g.font = 'bold 46px Helvetica, Arial, sans-serif';
  g.fillText('NO', 210, y + 300);
  g.fillText('VANDALISM', 210, y + 350);
  g.fillStyle = '#151515';
  g.font = 'bold 26px Helvetica, Arial, sans-serif';
  g.fillText('PLEASE RESPECT', 210, y + 420);
  g.fillText('OUR PIONEERS', 210, y + 455);
  const closed: [number, number, number, number] = [0, 1 - (y + 512) / H, 420 / W, 512 / H];
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return { tex, rects, closed };
}

const MARBLE = ['#e4e1da', '#d8d5ce', '#cfcbc2', '#e9e6df'];
const SANDSTONE = ['#b9a184', '#a89176', '#c2ad90'];
const GRANITE = ['#77777a', '#5d5c5e', '#8a7470', '#3a3a3c', '#9a9894'];
/** Andesite and granite from the hills round the camp, and white quartz. */
const FIELD_ROCK = ['#6a5446', '#5a4a40', '#7a6452', '#8a7a6a', '#4a3e36', '#d8d2c6'];
/** Plastic roses, carnations and sunflowers. */
const FLOWERS = ['#c8202a', '#e85a8a', '#f0c020', '#f4f0ec', '#8a3ac8', '#e8742a', '#2a6ad0'];

/** Searchlight's desert burial grounds. */
export class Cemeteries {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private shadowMaterial: THREE.ShaderMaterial;
  private geos: THREE.BufferGeometry[] = [];

  constructor(plans: CemeteryPlan[], hf: Heightfield) {
    const atlas = signAtlas(plans.map((p) => p.name || 'Cemetery'));
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: cemeteryVertex,
      fragmentShader: cemeteryFragment,
      uniforms: { ...G, uSignTex: { value: atlas.tex } },
      side: THREE.DoubleSide,
    });
    this.shadowMaterial = this.material.clone();
    this.shadowMaterial.uniforms = this.material.uniforms;
    this.shadowMaterial.defines = { SHADOW_PASS: '' };

    plans.forEach((plan, pi) => {
      const ch = CHARACTER[plan.name] ?? DEFAULT;
      const m = new Mesher();
      this.stones(m, plan, ch, hf, pi);
      this.fence(m, plan, hf, pi);
      if (plan.gate) this.signs(m, plan, ch, hf, atlas.rects[pi], atlas.closed);
      const geo = m.build();
      this.geos.push(geo);
      const mesh = new THREE.Mesh(geo, this.material);
      this.group.add(mesh);
    });
  }

  private stones(m: Mesher, plan: CemeteryPlan, ch: Character, hf: Heightfield, pi: number) {
    const rnd = rand(9173 + pi * 7919);
    const { poly, gate } = plan;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      minX = Math.min(minX, poly[i]);
      maxX = Math.max(maxX, poly[i]);
      minZ = Math.min(minZ, poly[i + 1]);
      maxZ = Math.max(maxZ, poly[i + 1]);
    }
    const small = (maxX - minX) * (maxZ - minZ) < 400;
    const margin = small ? 1.2 : 2.2;
    const onDrive = (x: number, z: number) =>
      plan.drives.some((p) => {
        for (let i = 0; i + 3 < p.length; i += 2) if (closest(x, z, p[i], p[i + 1], p[i + 2], p[i + 3])[2] < 3.6) return true;
        return false;
      });
    // Graves run east from the headstone; keep the whole plot off the drives.
    const aisle = (x: number, z: number) =>
      (gate ? closest(x, z, gate[0], gate[1], plan.cx, plan.cz)[2] < 2.6 : false) || onDrive(x, z) || onDrive(x + 2.2, z);
    const col = new THREE.Color();
    const mat = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const rowStep = small ? 2.4 : 3.1;
    // Graves run in north-south rows, headstones at the west end facing east.
    for (let x = minX + margin; x < maxX - margin; x += rowStep) {
      // Family plots: a low concrete curb around a few graves.
      let curbLeft = 0;
      let curbStart = 0;
      for (let z = minZ + margin; z < maxZ - margin; z += 1.6 + rnd() * 0.8) {
        const jx = x + (rnd() - 0.5) * 0.5;
        if (!inside(poly, jx, z) || edgeDist(poly, jx, z) < margin || aisle(jx, z)) continue;
        if (plan.trees.some((t) => Math.hypot(t.x - jx, t.z - z) < 1.2 + t.r * 0.12)) continue;
        if (rnd() > ch.density) continue;
        const old = rnd() < ch.old;
        const s = rnd();
        if (!small && curbLeft <= 0 && rnd() < 0.025) {
          curbLeft = 2 + Math.floor(rnd() * 3);
          curbStart = z - 0.9;
        }
        if (curbLeft > 0 && --curbLeft === 0) this.curb(m, jx - 0.6, curbStart, jx + 2.4, z + 0.9, hf, col);

        const pal = old ? (rnd() < 0.75 ? MARBLE : SANDSTONE) : GRANITE;
        col.set(pal[Math.floor(rnd() * pal.length)]);
        const seed = (old ? 1 : 0) + rnd() * 0.999;
        const yaw = Math.PI / 2 + (rnd() - 0.5) * 0.12;
        const y = hf.height(jx, z) - 0.06;
        // Headstones settle and heave over a century; vandals topple and smash them.
        const lean = old ? (rnd() - 0.5) * 0.22 : (rnd() - 0.5) * 0.03;
        const roll = old ? (rnd() - 0.5) * 0.12 : 0;
        const fate = rnd();
        const toppled = fate < ch.vandal * 0.5;
        const broken = !toppled && fate < ch.vandal;

        let geos: THREE.BufferGeometry[];
        let front = true;
        let w = 0.5, h = 0.8, t = 0.1;
        let part: number = PART.STONE;
        // Miners' graves: a mound of gravel ringed with hillside rock, under a
        // weathered wooden cross or inside a little picket enclosure.
        if (old && s < 0.55) {
          this.rockRing(m, jx, z, hf, rnd);
          if (s < 0.4) {
            col.set(rnd() < 0.3 ? '#e8e2d4' : '#6a5a48');
            geos = [cross(0.8 + rnd() * 0.35)];
            part = PART.WOOD;
            front = false;
          } else {
            this.picketPen(m, jx, z, hf, rnd);
            geos = [];
          }
        } else if (old && s < 0.62 && !broken && !toppled) {
          geos = obelisk(0.7 + rnd() * 0.4);
          front = false;
        } else if (!old && s < 0.45) {
          // Modern lawn marker or low pillow stone.
          w = 0.6 + rnd() * 0.3;
          h = s < 0.2 ? 0.08 : 0.3 + rnd() * 0.15;
          t = s < 0.2 ? 0.35 : 0.22 + rnd() * 0.1;
          geos = [box(w, h, t)];
        } else {
          w = old ? 0.38 + rnd() * 0.25 : 0.7 + rnd() * 0.4;
          h = old ? 0.6 + rnd() * 0.6 : 0.6 + rnd() * 0.35;
          t = old ? 0.06 + rnd() * 0.04 : 0.15 + rnd() * 0.08;
          geos = [tablet(w, broken ? h * (0.35 + rnd() * 0.2) : h, t, !broken && (old ? rnd() < 0.65 : rnd() < 0.3))];
          if (!old || rnd() < 0.4) geos.push(box(w * 1.25, 0.14, t + 0.18, 0, 0.07, 0));
        }
        // Bright plastic bouquets on the newer graves, a few on the old ones too.
        if (rnd() < (old ? 0.15 : 0.6)) this.flowers(m, jx + 0.35, z, hf, rnd);
        mat.makeTranslation(jx, y, z).multiply(tmp.makeRotationY(yaw));
        if (toppled) {
          // Lying on its back, face to the sky, beside its base.
          mat.multiply(tmp.makeTranslation(0, t / 2 + 0.04, -0.15)).multiply(tmp.makeRotationX(-Math.PI / 2 + (rnd() - 0.5) * 0.1));
        } else {
          mat.multiply(tmp.makeRotationX(lean)).multiply(tmp.makeRotationZ(roll));
        }
        geos.forEach((g, k) => m.add(g, mat, part, col, seed, front && k === 0 ? PART.INSCRIBED : -1));
        if (broken && part === PART.STONE && geos.length) {
          // The snapped-off top lies face-down in the gravel.
          const top = tablet(w, h * 0.5, t, true);
          const ang = rnd() * Math.PI * 2;
          const fx = jx + Math.cos(ang) * 0.6, fz = z + Math.sin(ang) * 0.6;
          mat.makeTranslation(fx, hf.height(fx, fz) + t / 2 - 0.03, fz).multiply(tmp.makeRotationY(ang)).multiply(tmp.makeRotationX(Math.PI / 2));
          m.add(top, mat, PART.STONE, col, seed);
        }
      }
    }
  }

  /** A gravel mound outlined with a ring of fist-to-head-sized field rocks. */
  private rockRing(m: Mesher, x: number, z: number, hf: Heightfield, rnd: () => number) {
    const col = new THREE.Color();
    const mat = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const y = hf.height(x + 1, z);
    col.set('#8a7a66');
    mat.makeTranslation(x + 1.05, y - 0.05, z).multiply(tmp.makeScale(1.0, 0.16, 0.42));
    m.add(new THREE.SphereGeometry(1, 10, 6), mat, PART.ROCK, col, rnd());
    const n = 14 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      // Walk the rectangle's perimeter.
      const u = i / n;
      const per = u * 6.4;
      let lx: number, lz: number;
      if (per < 2.2) (lx = per), (lz = -0.55);
      else if (per < 3.2) (lx = 2.2), (lz = -0.55 + (per - 2.2) * 1.1);
      else if (per < 5.4) (lx = 2.2 - (per - 3.2)), (lz = 0.55);
      else (lx = 0), (lz = 0.55 - (per - 5.4) * 1.1);
      const r = 0.1 + rnd() * 0.09;
      const rx = x - 0.05 + lx + (rnd() - 0.5) * 0.08, rz = z + lz + (rnd() - 0.5) * 0.08;
      col.set(FIELD_ROCK[Math.floor(rnd() * FIELD_ROCK.length)]);
      mat.makeTranslation(rx, hf.height(rx, rz) + r * 0.3, rz).multiply(tmp.makeRotationY(rnd() * 6.3)).multiply(tmp.makeScale(1, 0.7 + rnd() * 0.3, 0.8 + rnd() * 0.4));
      m.add(new THREE.DodecahedronGeometry(r, 0), mat, PART.ROCK, col, rnd());
    }
  }

  /** A low wooden picket fence around a single grave, a few pickets gone. */
  private picketPen(m: Mesher, x: number, z: number, hf: Heightfield, rnd: () => number) {
    const col = new THREE.Color(rnd() < 0.5 ? '#ece6da' : '#7a6a58');
    const mat = new THREE.Matrix4();
    const y = hf.height(x + 1, z) - 0.05;
    const x0 = x - 0.25, x1 = x + 2.45, z0 = z - 0.8, z1 = z + 0.8;
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      for (const ry of [0.22, 0.58]) {
        mat.makeTranslation((ax + bx) / 2, y + ry, (az + bz) / 2).multiply(new THREE.Matrix4().makeRotationY(yaw));
        m.add(box(0.025, 0.05, len, 0, 0, 0), mat, PART.WOOD, col, rnd());
      }
      for (let s = 0; s <= len; s += 0.14) {
        if (rnd() < 0.08) continue;
        const px = ax + ((bx - ax) * s) / len, pz = az + ((bz - az) * s) / len;
        mat.makeTranslation(px, y, pz).multiply(new THREE.Matrix4().makeRotationZ((rnd() - 0.5) * 0.08));
        m.add(box(0.06, 0.72, 0.018), mat, PART.WOOD, col, rnd());
      }
    }
  }

  /** A bunch of plastic flowers stuck in the gravel, or in a coffee can. */
  private flowers(m: Mesher, x: number, z: number, hf: Heightfield, rnd: () => number) {
    const col = new THREE.Color();
    const mat = new THREE.Matrix4();
    const y = hf.height(x, z);
    const n = 3 + Math.floor(rnd() * 6);
    const base = FLOWERS[Math.floor(rnd() * FLOWERS.length)];
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.3, r = rnd() * 0.12;
      const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
      const h = 0.25 + rnd() * 0.25;
      col.set('#3a6a2a');
      mat.makeTranslation(fx, y, fz);
      m.add(box(0.008, h, 0.008), mat, PART.PLASTIC, col, rnd());
      col.set(rnd() < 0.6 ? base : FLOWERS[Math.floor(rnd() * FLOWERS.length)]);
      mat.makeTranslation(fx, y + h, fz);
      m.add(new THREE.IcosahedronGeometry(0.035 + rnd() * 0.02, 0), mat, PART.PLASTIC, col, rnd());
    }
  }

  private curb(m: Mesher, x0: number, z0: number, x1: number, z1: number, hf: Heightfield, col: THREE.Color) {
    col.set('#8f8a7f');
    const mat = new THREE.Matrix4();
    const y = hf.height((x0 + x1) / 2, (z0 + z1) / 2) - 0.08;
    const w = x1 - x0, d = z1 - z0;
    const pieces: [number, number, number, number][] = [
      [(x0 + x1) / 2, z0, w, 0.15],
      [(x0 + x1) / 2, z1, w, 0.15],
      [x0, (z0 + z1) / 2, 0.15, d],
      [x1, (z0 + z1) / 2, 0.15, d],
    ];
    for (const [x, z, bw, bd] of pieces) {
      mat.makeTranslation(x, y, z);
      m.add(box(bw, 0.18, bd), mat, PART.CONCRETE, col, 0.5);
    }
  }

  /** Steel T-posts and barbed wire on the boundary, a welded pipe arch over the gate. */
  private fence(m: Mesher, plan: CemeteryPlan, hf: Heightfield, pi: number) {
    const steel = new THREE.Color(0.18, 0.17, 0.16);
    const mat = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const tpost = box(0.04, 1.35, 0.04);
    const corner = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6).translate(0, 0.75, 0).toNonIndexed();
    const { poly, gate } = plan;
    const rnd = rand(311 + pi * 101);
    const GATE_HALF = 2.2;
    for (let i = 0; i + 3 < poly.length; i += 2) {
      const ax = poly[i], az = poly[i + 1], bx = poly[i + 2], bz = poly[i + 3];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const yaw = Math.atan2(ux, uz);
      const at = (s: number) => [ax + ux * s, az + uz * s] as const;
      const gated = (x: number, z: number) => gate !== null && Math.hypot(x - gate[0], z - gate[1]) < GATE_HALF;
      mat.makeTranslation(ax, hf.height(ax, az) - 0.1, az);
      m.add(corner, mat, PART.IRON, steel, rnd());
      const nPost = Math.max(1, Math.ceil(len / 3.5));
      for (let k = 0; k <= nPost; k++) {
        const [x, z] = at((len * k) / nPost);
        if (gated(x, z)) continue;
        // T-posts lean a little where the wire has been leaned on.
        mat.makeTranslation(x, hf.height(x, z) - 0.15, z).multiply(tmp.makeRotationY(yaw)).multiply(tmp.makeRotationX((rnd() - 0.5) * 0.06));
        m.add(tpost, mat, PART.IRON, steel, rnd());
        if (k === nPost) continue;
        const [x2, z2] = at((len * (k + 1)) / nPost);
        if (gated(x2, z2)) continue;
        const y1 = hf.height(x, z), y2 = hf.height(x2, z2);
        const seg = Math.hypot(x2 - x, z2 - z);
        const pitch = Math.atan2(y2 - y1, seg);
        for (const ry of [0.3, 0.6, 0.9, 1.15]) {
          // Strands sag a few centimetres between posts.
          mat.makeTranslation((x + x2) / 2, (y1 + y2) / 2 + ry - 0.03, (z + z2) / 2).multiply(tmp.makeRotationY(yaw)).multiply(tmp.makeRotationX(-pitch));
          m.add(box(0.006, 0.006, seg / Math.cos(pitch), 0, 0, 0), mat, PART.IRON, steel, rnd());
        }
      }
    }
    if (gate) {
      // Pipe uprights and crossbar, painted white long ago.
      const [ox, oz] = plan.out;
      const [sx, sz] = plan.along;
      const c = new THREE.Color('#d8d2c4');
      const yaw = Math.atan2(ox, oz);
      const pipe = new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8).translate(0, 1.8, 0).toNonIndexed();
      for (const side of [-1, 1]) {
        const x = gate[0] + sx * GATE_HALF * side, z = gate[1] + sz * GATE_HALF * side;
        mat.makeTranslation(x, hf.height(x, z) - 0.1, z);
        m.add(pipe, mat, PART.IRON, c, 0.5);
      }
      const gy = hf.height(gate[0], gate[1]) - 0.1;
      mat.makeTranslation(gate[0], gy + 3.55, gate[1]).multiply(tmp.makeRotationY(yaw + Math.PI / 2));
      m.add(new THREE.CylinderGeometry(0.05, 0.05, GATE_HALF * 2 + 0.3, 8).rotateX(Math.PI / 2).toNonIndexed(), mat, PART.IRON, c, 0.5);
      mat.makeTranslation(gate[0], gy + 2.75, gate[1]).multiply(tmp.makeRotationY(yaw + Math.PI / 2));
      m.add(new THREE.CylinderGeometry(0.04, 0.04, GATE_HALF * 2, 8).rotateX(Math.PI / 2).toNonIndexed(), mat, PART.IRON, c, 0.5);
    }
  }

  private signs(m: Mesher, plan: CemeteryPlan, ch: Character, hf: Heightfield, name: [number, number, number, number], closed: [number, number, number, number]) {
    const gate = plan.gate!;
    const [ox, oz] = plan.out;
    const [sx, sz] = plan.along;
    const yaw = Math.atan2(ox, oz);
    const mat = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const white = new THREE.Color(1, 1, 1);
    // Name board hung in the arch between its two crossbars, readable from the lane.
    const gy = hf.height(gate[0], gate[1]) - 0.1;
    mat.makeTranslation(gate[0], gy, gate[1]).multiply(tmp.makeRotationY(yaw));
    m.add(box(3.6, 0.62, 0.05, 0, 3.15, 0), mat, PART.WOOD, white, 0.5, PART.SIGN, name);
    if (!ch.closedSign) return;
    // County notice on a steel post by the gate.
    const cx = gate[0] + ox * 1.2 - sx * 3.0, cz = gate[1] + oz * 1.2 - sz * 3.0;
    mat.makeTranslation(cx, hf.height(cx, cz) - 0.1, cz).multiply(tmp.makeRotationY(yaw + 0.15));
    m.add(box(0.05, 2.1, 0.05, 0, 1.05, -0.03), mat, PART.IRON, new THREE.Color(0.25, 0.25, 0.26), 0.5);
    m.add(box(0.46, 0.56, 0.015, 0, 1.75, 0), mat, PART.IRON, white, 0.5, PART.SIGN, closed);
  }

  addShadowCasters(shadow: ShadowMap) {
    for (const g of this.geos) shadow.addCaster(g, this.shadowMaterial);
  }
}
