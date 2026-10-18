import * as THREE from 'three';

// Unit plant: ground at y=0, top at y=1. Leafy forms have crown radius 1 in x/z
// and are scaled by crown radius and height per instance; rosette forms
// (Joshua trees, yuccas, palms, cholla) are modelled in height units and scaled
// uniformly so their spiky leaves keep their shape.

export const TREE_PART = { BARK: 0, LEAF: 1, INNER: 2, BLADE: 3, FLOWER: 4, SPINE: 5, THATCH: 6 } as const;

export type LeafyForm = 'tree' | 'creosote' | 'round' | 'cone' | 'feathery';
export type RosetteForm = 'joshua' | 'yucca' | 'palm' | 'cholla';
export type PlantForm = LeafyForm | RosetteForm;

export const ROSETTE_FORMS: ReadonlySet<PlantForm> = new Set(['joshua', 'yucca', 'palm', 'cholla']);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Crown {
  c: THREE.Vector3;
  r: THREE.Vector3;
}

class GeoBuilder {
  pos: number[] = [];
  center: number[] = [];
  part: number[] = [];
  idx: number[] = [];

  addMesh(g: THREE.BufferGeometry, m: THREE.Matrix4, center: THREE.Vector3, part: number, displace?: (p: THREE.Vector3) => void) {
    const base = this.pos.length / 3;
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (displace) displace(v);
      v.applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      this.center.push(center.x, center.y, center.z);
      this.part.push(part);
    }
    const index = g.index;
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  /** Raw triangles (already in plant space). */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, center: THREE.Vector3, part: number) {
    const base = this.pos.length / 3;
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      this.center.push(center.x, center.y, center.z);
      this.part.push(part);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /**
   * Finalises the geometry. Leaf clusters get a crown-shell normal and AO from
   * the crown ellipsoid; everything else keeps its geometric normal.
   */
  build(crown: Crown | null): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCenter', new THREE.Float32BufferAttribute(this.center, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;
    const count = this.pos.length / 3;
    const crownN = new Float32Array(count * 3);
    const shell = new Float32Array(count);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const part = this.part[i];
      v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      if (crown && (part === TREE_PART.LEAF || part === TREE_PART.INNER)) {
        const d = v.clone().sub(crown.c).divide(crown.r);
        const s = d.length();
        d.normalize();
        crownN.set([d.x, d.y, d.z], i * 3);
        shell[i] = Math.min(1, Math.max(0.25, 0.25 + 0.75 * s)) * (0.55 + 0.45 * Math.min(1, Math.max(0, (v.y - crown.c.y * 0.55) / (crown.c.y * 0.9))));
      } else {
        crownN.set([n.getX(i), n.getY(i), n.getZ(i)], i * 3);
        shell[i] = part === TREE_PART.BARK ? 0.35 + 0.45 * Math.min(1, v.y / 0.6) : 0.55 + 0.45 * Math.min(1, v.y);
      }
    }
    g.setAttribute('aCrownN', new THREE.BufferAttribute(crownN, 3));
    g.setAttribute('aShell', new THREE.BufferAttribute(shell, 1));
    return g;
  }
}

function limb(b: GeoBuilder, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides: number, part: number = TREE_PART.BARK) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const cyl = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
  cyl.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1));
  b.addMesh(cyl, m, from.clone().lerp(to, 0.5), part);
}

/** Leaf-cluster crown on the outer shell of an ellipsoid. */
function clusters(b: GeoBuilder, r: () => number, crown: Crown, n: number, size: number, detail: 0 | 1, open = 0) {
  const clusterGeo = new THREE.IcosahedronGeometry(1, detail === 0 ? 1 : 0);
  const innerGeo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < n; i++) {
    let dir: THREE.Vector3;
    if (i === 0) dir = new THREE.Vector3(0, 0.7, 0);
    else {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      dir = new THREE.Vector3(s * Math.cos(th), Math.abs(u) * 1.0 - 0.3, s * Math.sin(th));
    }
    const shell = detail === 0 ? 0.45 + 0.6 * r() : 0.55 + 0.35 * r();
    const c = new THREE.Vector3(dir.x * crown.r.x * shell, crown.c.y + dir.y * crown.r.y * shell, dir.z * crown.r.z * shell);
    const cr = size * (detail === 0 ? 0.65 + 0.7 * r() : 0.8 + 0.4 * r()) * (1 - open * 0.4 * r());
    const m = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(cr, cr * 0.8, cr));
    const k = r() * 10;
    b.addMesh(clusterGeo, m, c, TREE_PART.LEAF, (p) => {
      const w = 1 + 0.18 * Math.sin(p.x * 5 + k) * Math.sin(p.y * 4 + k * 1.3) * Math.sin(p.z * 6 - k);
      p.multiplyScalar(w);
    });
    if (detail === 0 && !open) {
      const mi = new THREE.Matrix4().compose(c, new THREE.Quaternion(), new THREE.Vector3(cr * 0.72, cr * 0.58, cr * 0.72));
      b.addMesh(innerGeo, mi, c, TREE_PART.INNER);
    }
  }
}

const CROWNS: Record<LeafyForm, Crown> = {
  tree: { c: new THREE.Vector3(0, 0.62, 0), r: new THREE.Vector3(0.84, 0.36, 0.84) },
  feathery: { c: new THREE.Vector3(0, 0.58, 0), r: new THREE.Vector3(0.86, 0.42, 0.86) },
  creosote: { c: new THREE.Vector3(0, 0.62, 0), r: new THREE.Vector3(0.88, 0.42, 0.88) },
  round: { c: new THREE.Vector3(0, 0.45, 0), r: new THREE.Vector3(0.95, 0.52, 0.95) },
  cone: { c: new THREE.Vector3(0, 0.55, 0), r: new THREE.Vector3(0.72, 0.5, 0.72) },
};

/**
 * Leafy plants: wash trees and town trees (trunk, spreading limbs, lumpy
 * crown), creosote (an open vase of slender stems tipped with tiny leaf
 * clumps), bursage and blackbrush domes, pinyon/juniper eggs and feathery
 * tamarisk. `detail` selects the level of detail.
 */
export function buildLeafy(form: LeafyForm, detail: 0 | 1 | 2, seed = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const r = rng(seed);
  const crown = CROWNS[form];

  if (detail === 2) {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const m = new THREE.Matrix4().compose(crown.c, new THREE.Quaternion(), crown.r.clone().multiplyScalar(1.1));
    b.addMesh(ico, m, crown.c, TREE_PART.LEAF);
    return b.build(crown);
  }

  if (form === 'creosote') {
    // Many slender grey stems fanning up from the root crown.
    const stems = detail === 0 ? 16 : 6;
    const tip = new THREE.IcosahedronGeometry(1, detail === 0 ? 1 : 0);
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2 + r() * 0.6;
      const lean = 0.35 + r() * 0.5;
      const top = new THREE.Vector3(Math.cos(a) * lean, 0.75 + r() * 0.25, Math.sin(a) * lean);
      if (detail === 0) limb(b, new THREE.Vector3(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04), top, 0.022, 0.008, 3);
      // Sparse leaf clumps along the upper half of each stem.
      const nClump = detail === 0 ? 6 : 2;
      for (let k = 0; k < nClump; k++) {
        const t = 0.5 + (k / nClump) * 0.55 + r() * 0.1;
        const c = top.clone().multiplyScalar(Math.min(t, 1.05));
        c.x += (r() - 0.5) * 0.15;
        c.z += (r() - 0.5) * 0.15;
        const cr = (detail === 0 ? 0.095 : 0.24) * (0.7 + 0.6 * r());
        const m = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(cr, cr * 0.85, cr));
        b.addMesh(tip, m, c, TREE_PART.LEAF);
      }
    }
    return b.build(crown);
  }

  if (form === 'round') {
    // Low dome of interlaced twigs: bursage, blackbrush, brittlebush.
    if (detail === 0) {
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2;
        limb(b, new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(Math.cos(a) * 0.5, 0.55, Math.sin(a) * 0.5), 0.04, 0.015, 3);
      }
    }
    clusters(b, r, crown, detail === 0 ? 26 : 7, detail === 0 ? 0.26 : 0.46, detail);
    return b.build(crown);
  }

  if (form === 'cone') {
    // Pinyon and Utah juniper: a short twisted trunk under a dense egg of foliage.
    const top = new THREE.Vector3((r() - 0.5) * 0.1, 0.35, (r() - 0.5) * 0.1);
    limb(b, new THREE.Vector3(0, -0.1, 0), top, 0.09, 0.06, detail === 0 ? 6 : 4);
    clusters(b, r, crown, detail === 0 ? 30 : 7, detail === 0 ? 0.22 : 0.4, detail);
    return b.build(crown);
  }

  // Wash trees, town trees and tamarisk: trunk, limbs and a lumpy crown.
  const multi = form === 'feathery' ? 3 : 1;
  for (let s = 0; s < multi; s++) {
    const a0 = (s / multi) * Math.PI * 2 + r();
    const base = multi > 1 ? new THREE.Vector3(Math.cos(a0) * 0.08, -0.1, Math.sin(a0) * 0.08) : new THREE.Vector3(0, -0.1, 0);
    const trunkTop = new THREE.Vector3((r() - 0.5) * 0.12 + base.x * 2, 0.3, (r() - 0.5) * 0.12 + base.z * 2);
    limb(b, base, trunkTop, multi > 1 ? 0.05 : 0.075, multi > 1 ? 0.035 : 0.055, detail === 0 ? 7 : 4);
    const limbs = detail === 0 ? (multi > 1 ? 3 : 5) : 2;
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + r() * 0.8;
      const out = 0.32 + r() * 0.22;
      const end = new THREE.Vector3(Math.cos(a) * out, crown.c.y + (r() - 0.5) * 0.12, Math.sin(a) * out);
      limb(b, trunkTop, end, 0.045, 0.018, detail === 0 ? 5 : 3);
      if (detail === 0) {
        const a2 = a + (r() - 0.5) * 1.2;
        const end2 = end.clone().add(new THREE.Vector3(Math.cos(a2) * 0.14, 0.06 + r() * 0.06, Math.sin(a2) * 0.14));
        limb(b, end, end2, 0.018, 0.008, 3);
      }
    }
  }
  clusters(b, r, crown, detail === 0 ? 34 : 7, detail === 0 ? 0.21 : 0.4, detail, form === 'feathery' ? 0.3 : 0);
  return b.build(crown);
}

/**
 * One spiky leaf: a narrow keeled blade from `base` along `dir` (unit), so it
 * catches light on one face and shades on the other.
 */
function blade(b: GeoBuilder, base: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, center: THREE.Vector3, part: number, droop = 0) {
  const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const keel = new THREE.Vector3().crossVectors(side, dir).normalize();
  const mid = base.clone().addScaledVector(dir, len * 0.5);
  mid.y -= droop * len * 0.25;
  const tip = base.clone().addScaledVector(dir, len);
  tip.y -= droop * len;
  const l = mid.clone().addScaledVector(side, -width * 0.5);
  const rr = mid.clone().addScaledVector(side, width * 0.5);
  const k = mid.clone().addScaledVector(keel, width * 0.25);
  b.tri(base, l, k, center, part);
  b.tri(base, k, rr, center, part);
  b.tri(l, tip, k, center, part);
  b.tri(k, tip, rr, center, part);
}

/** A ball of stiff dagger leaves at the end of a branch. */
function rosette(b: GeoBuilder, r: () => number, at: THREE.Vector3, axis: THREE.Vector3, size: number, detail: 0 | 1, opts: { n?: number; width?: number; dead?: boolean; droop?: number } = {}) {
  const n = opts.n ?? (detail === 0 ? 26 : 9);
  const width = opts.width ?? size * 0.09;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  for (let i = 0; i < n; i++) {
    // Golden-angle spiral over the upper three quarters of a sphere.
    const t = (i + 0.5) / n;
    const y = 1 - t * 1.45;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996 + r() * 0.3;
    const d = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad).applyQuaternion(q).normalize();
    const len = size * (0.75 + 0.35 * r()) * (y < -0.2 ? 0.85 : 1);
    blade(b, at, d, len, width, at, TREE_PART.BLADE, (y < 0 ? 0.15 : 0.05) * (opts.droop ?? 1));
  }
  if (detail === 0) {
    const core = new THREE.IcosahedronGeometry(1, 0);
    const m = new THREE.Matrix4().compose(at, new THREE.Quaternion(), new THREE.Vector3(size * 0.22, size * 0.22, size * 0.22));
    b.addMesh(core, m, at, TREE_PART.INNER);
  }
  // Skirt of dead, down-folded leaves below the living rosette.
  if (opts.dead !== false) {
    const skirtLen = size * 0.9;
    const cone = new THREE.CylinderGeometry(size * 0.16, size * 0.3, skirtLen, detail === 0 ? 7 : 4, 1, true);
    cone.translate(0, -skirtLen / 2 - size * 0.05, 0);
    const m = new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));
    b.addMesh(cone, m, at, TREE_PART.THATCH);
  }
}

/**
 * Rosette plants. Joshua trees: a shaggy trunk that forks every time it
 * flowers, each arm ending in a spiky rosette; Mojave yucca: a few leaning
 * stems wrapped in dead leaves; California fan palms; and silver cholla.
 */
export function buildRosette(form: RosetteForm, detail: 0 | 1 | 2, seed = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const r = rng(seed);
  const d01 = (detail === 2 ? 1 : detail) as 0 | 1;
  const sides = detail === 0 ? 6 : detail === 1 ? 4 : 3;

  if (form === 'joshua') {
    const trunkH = 0.32 + r() * 0.16;
    const trunkTop = new THREE.Vector3((r() - 0.5) * 0.06, trunkH, (r() - 0.5) * 0.06);
    limb(b, new THREE.Vector3(0, -0.05, 0), trunkTop, 0.06, 0.05, sides, TREE_PART.THATCH);
    const tips: { p: THREE.Vector3; d: THREE.Vector3 }[] = [];
    const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
      const to = from.clone().addScaledVector(dir, len);
      to.y = Math.min(to.y, 0.95);
      limb(b, from, to, rad, rad * 0.82, sides, TREE_PART.THATCH);
      const forks = depth <= 0 ? 0 : r() < 0.15 ? 1 : r() < 0.7 ? 2 : 3;
      if (forks === 0 || to.y > 0.86) {
        tips.push({ p: to, d: dir });
        return;
      }
      for (let k = 0; k < forks; k++) {
        const az = Math.atan2(dir.z, dir.x) + (forks === 1 ? (r() - 0.5) * 0.8 : (k / forks - 0.5) * 2.2 + (r() - 0.5) * 0.6);
        const out = 0.45 + r() * 0.45;
        // Arms bend out and then turn skyward, the classic Joshua candelabra.
        const nd = new THREE.Vector3(Math.cos(az) * out, 0.55 + r() * 0.5, Math.sin(az) * out).normalize();
        grow(to, nd, len * (0.75 + r() * 0.3), rad * 0.8, depth - 1);
      }
    };
    const first = r() < 0.2 ? 1 : 2 + Math.floor(r() * 2);
    for (let k = 0; k < first; k++) {
      const az = (k / first) * Math.PI * 2 + r() * 1.2;
      const out = 0.5 + r() * 0.5;
      grow(trunkTop, new THREE.Vector3(Math.cos(az) * out, 0.6 + r() * 0.4, Math.sin(az) * out).normalize(), 0.11 + r() * 0.06, 0.042, 3 + (r() < 0.4 ? 1 : 0));
    }
    for (const t of tips) {
      const size = 0.075 + r() * 0.03;
      if (detail === 2) {
        const ico = new THREE.IcosahedronGeometry(1, 0);
        b.addMesh(ico, new THREE.Matrix4().compose(t.p, new THREE.Quaternion(), new THREE.Vector3(size, size, size)), t.p, TREE_PART.BLADE);
        continue;
      }
      rosette(b, r, t.p, new THREE.Vector3(t.d.x * 0.4, 1, t.d.z * 0.4), size, d01, { n: detail === 0 ? 40 : 12, width: size * 0.13 });
      // Cream panicle of waxy blossoms rising from the rosette (spring only).
      if (detail === 0 && r() < 0.45) {
        const fp = t.p.clone().add(new THREE.Vector3(0, size * 0.9, 0));
        const fl = new THREE.IcosahedronGeometry(1, 1);
        b.addMesh(fl, new THREE.Matrix4().compose(fp, new THREE.Quaternion(), new THREE.Vector3(size * 0.18, size * 0.36, size * 0.18)), t.p, TREE_PART.FLOWER, (p) => {
          p.multiplyScalar(1 + 0.25 * Math.sin(p.x * 9) * Math.sin(p.y * 7) * Math.sin(p.z * 8));
        });
      }
    }
    return b.build(null);
  }

  if (form === 'yucca') {
    // Mojave yucca: one to four leaning stems, shaggy with dead leaves, each
    // crowned by a rosette of long stiff yellow-green bayonets.
    const stems = 1 + Math.floor(r() * 3.5);
    for (let s = 0; s < stems; s++) {
      const a = r() * Math.PI * 2;
      const lean = s === 0 ? 0.05 : 0.12 + r() * 0.15;
      const h = s === 0 ? 0.62 + r() * 0.2 : 0.3 + r() * 0.4;
      const top = new THREE.Vector3(Math.cos(a) * lean, h, Math.sin(a) * lean);
      const base = new THREE.Vector3(Math.cos(a) * 0.03, -0.05, Math.sin(a) * 0.03);
      limb(b, base, top, 0.05, 0.042, sides, TREE_PART.THATCH);
      if (detail === 2) {
        const ico = new THREE.IcosahedronGeometry(1, 0);
        b.addMesh(ico, new THREE.Matrix4().compose(top, new THREE.Quaternion(), new THREE.Vector3(0.22, 0.2, 0.22)), top, TREE_PART.BLADE);
        continue;
      }
      rosette(b, r, top, new THREE.Vector3(top.x, 1, top.z), 0.26, d01, { n: detail === 0 ? 46 : 14, width: 0.032, droop: 0 });
      if (detail === 0 && s === 0 && r() < 0.6) {
        const fp = top.clone().add(new THREE.Vector3(0, 0.3, 0));
        const fl = new THREE.IcosahedronGeometry(1, 1);
        b.addMesh(fl, new THREE.Matrix4().compose(fp, new THREE.Quaternion(), new THREE.Vector3(0.08, 0.16, 0.08)), top, TREE_PART.FLOWER);
      }
    }
    return b.build(null);
  }

  if (form === 'palm') {
    // California fan palm: a tall column with a skirt of dead fronds under a
    // crown of living fans.
    const top = new THREE.Vector3((r() - 0.5) * 0.04, 0.84, (r() - 0.5) * 0.04);
    limb(b, new THREE.Vector3(0, -0.05, 0), top, 0.04, 0.032, sides + 2);
    const skirt = new THREE.CylinderGeometry(0.06, 0.085, 0.3, detail === 0 ? 10 : 6, 1, true);
    skirt.translate(0, top.y - 0.17, 0);
    b.addMesh(skirt, new THREE.Matrix4(), top, TREE_PART.THATCH);
    const fronds = detail === 0 ? 18 : detail === 1 ? 9 : 6;
    for (let i = 0; i < fronds; i++) {
      const a = i * 2.39996;
      const up = 0.65 - (i / fronds) * 0.9;
      const d = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
      const end = top.clone().addScaledVector(d, 0.12);
      if (detail === 0) limb(b, top, end, 0.006, 0.004, 3);
      // Fan of narrow segments spreading from the petiole tip.
      const seg = detail === 0 ? 9 : detail === 1 ? 5 : 3;
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      for (let k = 0; k < seg; k++) {
        const f = (k / (seg - 1) - 0.5) * 1.8;
        const sd = d.clone().multiplyScalar(Math.cos(f)).addScaledVector(side, Math.sin(f)).normalize();
        sd.y += 0.15;
        blade(b, end, sd.normalize(), 0.13, detail === 0 ? 0.028 : 0.05, top, TREE_PART.BLADE, 0.35);
      }
    }
    return b.build(null);
  }

  // Silver cholla: a jointed little tree of cylindrical stems wrapped in a glowing haze of spines.
  const trunkTop = new THREE.Vector3(0, 0.3, 0);
  limb(b, new THREE.Vector3(0, -0.05, 0), trunkTop, 0.06, 0.05, sides);
  const joint = (from: THREE.Vector3, dir: THREE.Vector3, depth: number) => {
    const len = 0.16 + r() * 0.08;
    const to = from.clone().addScaledVector(dir, len);
    limb(b, from, to, 0.045, 0.04, sides, TREE_PART.SPINE);
    if (depth <= 0) return;
    const n = r() < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const az = r() * Math.PI * 2;
      joint(to, new THREE.Vector3(Math.cos(az) * 0.7, 0.6 + r() * 0.5, Math.sin(az) * 0.7).normalize(), depth - 1);
    }
  };
  const arms = 3 + Math.floor(r() * 3);
  for (let k = 0; k < arms; k++) {
    const az = (k / arms) * Math.PI * 2 + r();
    joint(trunkTop, new THREE.Vector3(Math.cos(az) * 0.8, 0.5 + r() * 0.5, Math.sin(az) * 0.8).normalize(), detail === 0 ? 2 : 1);
  }
  return b.build(null);
}

export function buildPlant(form: PlantForm, detail: 0 | 1 | 2, seed = 1): THREE.BufferGeometry {
  return ROSETTE_FORMS.has(form) ? buildRosette(form as RosetteForm, detail, seed) : buildLeafy(form as LeafyForm, detail, seed);
}
