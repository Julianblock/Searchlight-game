import * as THREE from 'three';
import { G } from '../render/globals';
import { landmarkFragment, landmarkVertex } from '../render/shaders/landmarkShader';
import type { ShadowMap } from '../render/shadows';
import { Frame, FX, type Mat, SignBuilder, SolidBuilder, UP } from './builders';
import type { Heightfield } from './heightfield';
import { buildSignAtlas, type SignRect } from './signAtlas';

/** Storey height the facade shader's room grid assumes (m). */
const FLOOR = 3.1;

/**
 * The Colorado's Nevada bank through the strip, [z, x] pairs north to south,
 * traced from the river's water mask.
 */
const BANK: [number, number][] = [
  [32300, 31660], [32800, 31668], [33000, 31672], [33200, 31642], [33400, 31622], [33600, 31612],
  [33800, 31608], [33900, 31578], [34100, 31552], [34300, 31540], [34400, 31516], [34500, 31496],
  [34600, 31462], [34700, 31426], [34800, 31390], [34900, 31356], [35000, 31322], [35100, 31292],
  [35300, 31278], [35400, 31246], [35500, 31212], [35700, 31215],
];

/** West bank x at z, and the unit normal pointing out over the river. */
export function bankAt(z: number): { x: number; nx: number; nz: number } {
  let i = 0;
  while (i < BANK.length - 2 && BANK[i + 1][0] < z) i++;
  const [z0, x0] = BANK[i];
  const [z1, x1] = BANK[i + 1];
  const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0)));
  const dxdz = (x1 - x0) / (z1 - z0);
  const l = Math.hypot(1, dxdz);
  return { x: x0 + (x1 - x0) * t, nx: 1 / l, nz: -dxdz / l };
}

interface Rect {
  x: number;
  z: number;
  ux: number;
  uz: number;
  hw: number;
  hd: number;
}

/**
 * Laughlin's casino row on the Colorado, hand-built from photographs: Don
 * Laughlin's Riverside with its red R crown, the copper-glass Aquarius, the
 * cream Edgewater slab, the Colorado Belle riverboat, the gold-and-green
 * Tropicana, the Pioneer and River Rick, the Golden Nugget, the rust-red River
 * Lodge and Harrah's mission parapets, strung together by the Riverwalk's
 * white rail, palms and lamps. The Laughlin Bridge carries Route 163 over to
 * Bullhead City.
 */
export class Laughlin {
  readonly group = new THREE.Group();
  /** Point lights (world xyz, rgb, size, blink) for the night-light renderer. */
  readonly lights: number[] = [];
  /** River-mirrored facades: world x, z, y0, y1, then linear rgb and half-width. */
  readonly glows: number[] = [];
  private sites: Rect[] = [];
  private s = new SolidBuilder();
  private sg = new SignBuilder();
  private rects: Record<string, SignRect>;
  private solidGeo: THREE.BufferGeometry;
  private shadowMat: THREE.ShaderMaterial;
  private seed = 100;

  constructor(private hf: Heightfield) {
    const atlas = buildSignAtlas();
    this.rects = atlas.rects;

    this.bridge();
    this.riverside();
    this.aquarius();
    this.regency();
    this.edgewater();
    this.belle();
    this.tropicana();
    this.pioneer();
    this.nugget();
    this.riverLodge();
    this.harrahs();
    this.roadside();
    this.riverwalk();

    const solidMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: landmarkVertex,
      fragmentShader: landmarkFragment,
      uniforms: { ...G },
      side: THREE.DoubleSide,
    });
    const signMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: landmarkVertex,
      fragmentShader: landmarkFragment,
      uniforms: { ...G, uMap: { value: atlas.texture } },
      defines: { USE_MAP: '' },
      side: THREE.DoubleSide,
    });
    this.shadowMat = solidMat.clone();
    this.shadowMat.uniforms = solidMat.uniforms;
    this.shadowMat.defines = { SHADOW_PASS: '' };
    this.solidGeo = this.s.build();
    const solids = new THREE.Mesh(this.solidGeo, solidMat);
    const signs = new THREE.Mesh(this.sg.build(), signMat);
    solids.name = signs.name = 'laughlin';
    this.group.add(solids, signs);
  }

  /** True on the lots the hand-built casinos stand on (OSM buildings skip these). */
  occupies(x: number, z: number) {
    for (const r of this.sites) {
      const dx = x - r.x;
      const dz = z - r.z;
      if (Math.abs(dx * r.ux + dz * r.uz) < r.hw && Math.abs(-dx * r.uz + dz * r.ux) < r.hd) return true;
    }
    return false;
  }

  addShadowCasters(shadow: ShadowMap) {
    shadow.addCaster(this.solidGeo, this.shadowMat);
  }

  // --- helpers ---------------------------------------------------------------------

  /**
   * Frame centred at (x, z), squared to a footprint whose edges run along `ang`
   * (radians): local +z is whichever edge normal faces the river most, so local
   * x runs along the river. Reserves `hw` x `hd` metres of lot.
   */
  private site(x: number, z: number, ang: number, hw: number, hd: number): Frame {
    const b = bankAt(z);
    let fx = 1;
    let fz = 0;
    let best = -2;
    for (let k = 0; k < 4; k++) {
      const a = ang + (k * Math.PI) / 2;
      const d = Math.cos(a) * b.nx + Math.sin(a) * b.nz;
      if (d > best) {
        best = d;
        fx = Math.cos(a);
        fz = Math.sin(a);
      }
    }
    const fr = new Frame(x, this.hf.height(x, z), z, fx, fz);
    this.sites.push({ x, z, ux: fr.r.x, uz: fr.r.z, hw, hd });
    return fr;
  }

  private box(fr: Frame, x: number, y: number, z: number, w: number, h: number, d: number, color: string, mat: Mat = {}, yaw = 0, seed = this.seed) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    this.s.add(g, fr.at(x, y, z, yaw), color, mat, seed);
  }

  private cyl(fr: Frame, x: number, y: number, z: number, r0: number, r1: number, h: number, color: string, mat: Mat = {}, sides = 10) {
    const g = new THREE.CylinderGeometry(r1, r0, h, sides).translate(0, h / 2, 0);
    this.s.add(g, fr.at(x, y, z), color, mat, this.seed);
  }

  /** Sign face centred at local (x, y, z), facing local yaw (0 = toward the river). */
  private sign(fr: Frame, name: string, x: number, y: number, z: number, h: number, glow = 1, fx: number = FX.NONE, yaw = 0, both = false) {
    const s = this.rects[name];
    this.sg.quad(fr.p(x, y, z), fr.dir(yaw), UP, h * s.aspect, h, s, glow, fx, this.seed, both);
  }

  /** Hotel slab: `floors` storeys of rooms over a sunk base, with a plain roof cap. */
  private slab(fr: Frame, x: number, z: number, w: number, d: number, floors: number, color: string, fx: number = FX.WINDOWS, wash = 0, yaw = 0, base = 0) {
    const h = floors * FLOOR;
    this.box(fr, x, base - 4, z, w, h + 4, d, color, { rough: 0.75, fx, glow: wash }, yaw);
    return base + h;
  }

  /** Thin glowing tube along a polyline in the frame. */
  private tube(fr: Frame, a: THREE.Vector3, b: THREE.Vector3, r: number, color: string, glow: number) {
    const d = b.clone().sub(a);
    const len = d.length();
    const g = new THREE.BoxGeometry(r, len, r).translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    const m = new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1));
    this.s.add(g, fr.basis.clone().multiply(m), color, { glow, rough: 0.4 }, this.seed);
  }

  /** Neon edge outline around a box's vertical corners and roofline. */
  private outline(fr: Frame, x: number, z: number, w: number, d: number, y0: number, y1: number, color: string, glow: number, yaw = 0) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const corner = (u: number, v: number, y: number) => new THREE.Vector3(x + u * c + v * s, y, z - u * s + v * c);
    const cs: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    for (let i = 0; i < 4; i++) {
      const [u, v] = cs[i];
      const [u2, v2] = cs[(i + 1) % 4];
      this.tube(fr, corner(u * 1.004, v * 1.004, y0), corner(u * 1.004, v * 1.004, y1), 0.35, color, glow);
      this.tube(fr, corner(u * 1.004, v * 1.004, y1), corner(u2 * 1.004, v2 * 1.004, y1), 0.35, color, glow);
    }
  }

  /** A lit facade `w` wide between local heights y0..y1 that the river mirrors at night. */
  private glow(fr: Frame, x: number, z: number, w: number, y0: number, y1: number, r: number, g: number, b: number) {
    const a = fr.p(x, y0, z);
    this.glows.push(a.x, a.z, a.y, fr.p(x, y1, z).y, r, g, b, w / 2);
  }

  private light(p: THREE.Vector3, r: number, g: number, b: number, size: number, blink = 0) {
    this.lights.push(p.x, p.y, p.z, r, g, b, size, blink);
  }

  /** Red obstruction beacons at both ends of a tower's roof (`w` long along local x). */
  private beacons(fr: Frame, x: number, z: number, w: number, y: number) {
    for (const u of [-w / 2, w / 2]) this.light(fr.p(x + u, y + 1.5, z), 1, 0.08, 0.04, 3.2, 1);
  }

  /** A Mexican fan palm: tall slim trunk, a shaggy skirt and a tight crown. */
  private palm(x: number, z: number, h: number, k: number) {
    const y = this.hf.height(x, z);
    const fr = new Frame(x, y, z, Math.cos(k * 2.1), Math.sin(k * 2.1));
    const lean = (Math.sin(k * 7.7) * 0.5) * 0.06;
    const trunk = new THREE.CylinderGeometry(0.2, 0.3, h, 6).translate(0, h / 2, 0);
    const m = fr.at(0, -0.3, 0).multiply(new THREE.Matrix4().makeRotationZ(lean));
    this.s.add(trunk, m, '#8a7458', { rough: 0.95 }, this.seed);
    const top = new THREE.Vector3(0, h, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(lean));
    const skirt = new THREE.CylinderGeometry(0.75, 0.45, 1.6, 7).translate(0, -0.8, 0);
    this.s.add(skirt, fr.at(top.x, top.y - 0.3, top.z), '#9a8a62', { rough: 1 }, this.seed);
    const frond = new THREE.ConeGeometry(0.55, 3.4, 4, 1).rotateX(Math.PI / 2).translate(0, 0, 1.7).scale(1, 0.25, 1);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + k;
      const droop = 0.15 + ((i * 37) % 5) * 0.09;
      const fm = fr.at(top.x, top.y + 0.2, top.z, a).multiply(new THREE.Matrix4().makeRotationX(droop));
      this.s.add(frond, fm, i % 3 ? '#4f6a2c' : '#5e7a34', { rough: 0.85 }, this.seed);
    }
  }

  /** A row of palms from a to b, about `step` metres apart. */
  private palms(ax: number, az: number, bx: number, bz: number, step: number, h = 13) {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const k = ax * 0.013 + az * 0.007 + i;
      this.palm(ax + (bx - ax) * t, az + (bz - az) * t, h + Math.sin(k * 3.3) * 2.5, k);
    }
  }

  /** Porte-cochère: a lit canopy on columns at local (x, z). */
  private porte(fr: Frame, x: number, z: number, w: number, d: number, color: string, h = 6) {
    this.box(fr, x, h, z, w, 1.4, d, color, { rough: 0.5 });
    this.box(fr, x, h - 0.05, z, w - 1, 0.05, d - 1, '#fff2d8', { glow: 1.3 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(fr, x + sx * (w / 2 - 1), -1, z + sz * (d / 2 - 1), 0.9, h + 1, 0.9, color);
    this.light(fr.p(x, h - 0.4, z), 1, 0.9, 0.75, 4);
  }

  /** Two-pole street marquee with a sign on top and an LED board under it. */
  private marquee(fr: Frame, x: number, z: number, top: string, topH: number, led: string, ledH: number, poleColor: string) {
    const tw = topH * this.rects[top].aspect;
    const lw = ledH * this.rects[led].aspect;
    const y1 = 6 + ledH + 0.6;
    const yTop = y1 + topH / 2 + 0.6;
    for (const px of [-1, 1]) this.box(fr, x + px * Math.max(tw, lw) * 0.32, -1, z, 0.9, yTop + topH / 2 + 1.5, 0.9, poleColor, { rough: 0.5 });
    this.box(fr, x, 6 - 0.3, z, lw + 0.6, ledH + 0.6, 0.7, '#1e1e22');
    this.box(fr, x, y1 + 0.2, z, tw + 0.6, topH + 0.6, 0.7, '#1e1e22');
    // Both faces read up and down Casino Drive.
    for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
      const off = Math.sign(yaw) * 0.37;
      this.sg.quad(fr.p(x - off, 6 + ledH / 2, z), fr.dir(yaw), UP, lw, ledH, this.rects[led], 1.5, FX.NONE, this.seed, false);
      this.sg.quad(fr.p(x - off, yTop, z), fr.dir(yaw), UP, tw, topH, this.rects[top], 1.4, FX.NONE, this.seed, false);
    }
    this.light(fr.p(x, yTop, z), 1, 0.8, 0.6, 7);
  }

  // --- the strip, north to south ----------------------------------------------------

  /** Donald J. Laughlin Memorial Bridge: concrete box girders on three pier pairs. */
  private bridge() {
    this.seed = 100;
    const z = 32507;
    const ax = 31630;
    const bx = 31935;
    const ya = this.hf.height(ax, z);
    const yb = this.hf.height(bx, z);
    const deck = Math.max(ya, yb);
    this.hf.addDeck(ax - 10, z, bx + 10, z, 12, ya + 0.1, yb + 0.1);
    const fr = new Frame((ax + bx) / 2, 0, z, 0, 1);
    const L = bx - ax;
    for (let i = 0; i < 24; i++) {
      const t0 = i / 24;
      const t1 = (i + 1) / 24;
      const y0 = ya + (yb - ya) * t0 + Math.sin(t0 * Math.PI) * 1.2;
      const y1 = ya + (yb - ya) * t1 + Math.sin(t1 * Math.PI) * 1.2;
      const x0 = -L / 2 + L * t0;
      const len = L / 24;
      const g = new THREE.BoxGeometry(len + 0.2, 2.6, 23).translate(0, -1.3, 0);
      const m = fr.at(x0 + len / 2, (y0 + y1) / 2, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(y1 - y0, len)));
      this.s.add(g, m, '#c9c4b8', { rough: 0.85 }, this.seed);
      // Parapets.
      for (const side of [-1, 1]) {
        const pg = new THREE.BoxGeometry(len + 0.2, 1.1, 0.4).translate(0, 0.55, 0);
        const pm = fr.at(x0 + len / 2, (y0 + y1) / 2, side * 11.3).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(y1 - y0, len)));
        this.s.add(pg, pm, '#dcd8ce', { rough: 0.8 }, this.seed);
      }
    }
    for (const t of [0.25, 0.5, 0.75]) {
      for (const side of [-6, 6]) this.cyl(fr, -L / 2 + L * t, 140, side, 1.6, 1.6, deck - 140 - 2, '#bdb8ac', { rough: 0.9 }, 12);
    }
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const px = -L / 2 + L * t;
      const py = ya + (yb - ya) * t + Math.sin(t * Math.PI) * 1.2;
      for (const side of [-1, 1]) {
        this.cyl(fr, px, py, side * 11, 0.12, 0.1, 9, '#8a8c8e', { fx: FX.METAL });
        this.light(fr.p(px, py + 9, side * 11), 1, 0.62, 0.25, 2.2);
      }
    }
  }

  /** Don Laughlin's Riverside: the slim balconied south tower with its red R crown and the wide north tower. */
  private riverside() {
    this.seed = -101;
    const fr = this.site(31585, 33015, 0, 95, 75);
    // Casino podium along the river, white with a red fascia.
    this.box(fr, 0, -3, 0, 120, 15, 110, '#efe9de', { rough: 0.8 });
    this.box(fr, 0, 10.5, 0, 121, 2.2, 111, '#c8141c', { rough: 0.6 });
    this.box(fr, 0, 12.8, 0, 118, 0.2, 108, '#d4d0c6');
    // North tower: wide white slab facing the drive, red neon edges and RIVERSIDE on the roof.
    const nx = 40, nz = -38;
    const nTop = this.slab(fr, nx, nz, 72, 20, 15, '#f2f0ea', FX.WINDOWS, 0.7);
    this.outline(fr, nx, nz, 72, 20, 12, nTop + 0.5, '#ff2a2a', 1.6);
    this.box(fr, nx, nTop, nz, 50, 6, 3, '#2a2222');
    this.sign(fr, 'riversideRoof', nx, nTop + 4.2, nz - 1.7, 6.5, 1.6, FX.NONE, Math.PI);
    this.sign(fr, 'riversideRoof', nx, nTop + 4.2, nz + 1.7, 6.5, 1.6);
    this.beacons(fr, nx, nz, 72, nTop + 6);
    this.glow(fr, nx, nz, 72, 12, nTop, 1, 0.72, 0.42);
    this.glow(fr, nx, nz, 50, nTop + 1, nTop + 7, 2.4, 0.15, 0.12);
    this.glow(fr, 0, 0, 120, 10.5, 12.7, 1.6, 0.08, 0.06);
    // South tower: slim, 28 floors of balconies with the red badge crown.
    const sx = -45, sz = 38;
    const sTop = this.slab(fr, sx, sz, 44, 24, 28, '#f4f2ec', FX.BALCONY, 0.7);
    this.box(fr, sx, sTop, sz, 45, 9, 25, '#f4f2ec', { rough: 0.7, glow: 0.5, fx: FX.WASH });
    for (const f of [1, -1]) {
      this.box(fr, sx, sTop + 1.5, sz + f * 12.6, 10, 9, 0.5, '#c8141c');
      this.sign(fr, 'riversideR', sx, sTop + 6, sz + f * 12.9, 8, 1.4, FX.NONE, f > 0 ? 0 : Math.PI);
    }
    this.outline(fr, sx, sz, 45, 25, sTop, sTop + 9, '#ff2a2a', 1.4);
    this.beacons(fr, sx, sz, 44, sTop + 9);
    this.glow(fr, sx, sz, 44, 12, sTop, 1, 0.75, 0.45);
    this.glow(fr, sx, sz, 44, sTop, sTop + 9, 2.2, 0.12, 0.1);
    // Classic car showroom glass on the river side and the Riverview restaurant deck.
    this.box(fr, 0, 0, 55.2, 80, 8, 0.3, '#2a3a44', { rough: 0.1, glow: 0.5 });
    this.box(fr, -30, 0, 60, 40, 0.6, 10, '#d8d2c4');
    // Casino Drive side: porte-cochère and the big marquee.
    this.porte(fr, 10, -62, 30, 14, '#c8141c');
    this.marquee(fr, -20, -76, 'riversideRoof', 3.2, 'riversideLED', 6, '#c8141c');
    // Casino West and the parking garage across the drive.
    const wf = this.site(31452, 32957, 3.11, 18, 28);
    this.box(wf, 0, -2, 0, 30, 10, 48, '#efe9de');
    this.box(wf, 0, 7.6, 0, 30.6, 1.6, 48.6, '#c8141c');
    this.storefront(wf, 0, 24.1, 22, 3);
    const gf = this.site(31430, 33008, 1.81, 50, 32);
    for (let l = 0; l < 5; l++) {
      this.box(gf, 0, l * 3.2 - 1, 0, 90, 0.5, 56, '#bdb6a8');
      if (l) for (const px of [-44, -22, 0, 22, 44]) for (const pz of [-27, 27]) this.box(gf, px, (l - 1) * 3.2 - 0.5, pz, 0.8, 3.2, 0.8, '#b0aa9c');
    }
    this.box(gf, 0, -1, 0, 89, 1, 55, '#8a8680');
    this.palms(31640, 32900, 31646, 33120, 14);
  }

  /** Lit storefront glazing strip on a wall at local z. */
  private storefront(fr: Frame, cx: number, z: number, w: number, h: number, glow = 0.8) {
    this.box(fr, cx, 0.2, z, w, h, 0.15, '#3a2e22', { rough: 0.15, glow });
  }

  /** Aquarius: two copper-glass towers with white fins and blue light strips. */
  private aquarius() {
    this.seed = 102.6;
    const fr = this.site(31540, 33450, 0.27, 110, 100);
    this.box(fr, 0, -3, 0, 150, 14, 120, '#e8e2d6', { rough: 0.8 });
    this.box(fr, 0, 9.8, 0, 151, 1.4, 121, '#2a7ab8', { rough: 0.5, glow: 0.6 });
    const towers: [number, number, number, number, number][] = [
      [20, 30, 66, 24, 20],
      [-35, -10, 58, 22, 17],
    ];
    for (const [x, z, w, d, fl] of towers) {
      const top = this.slab(fr, x, z, w, d, fl, '#a86a3e', FX.GLASS, 0.5);
      // White fins at the ends and a white crown.
      for (const e of [-1, 1]) {
        this.box(fr, x + e * (w / 2 + 0.6), -2, z, 2.4, top + 3, d + 1.2, '#f0ece4', { rough: 0.6 });
        this.box(fr, x + e * (w / 2 + 1.9), 12, z, 0.3, top - 12, 4.2, '#a86a3e', { rough: 0.3, fx: FX.WINDOWS, glow: 0.4 });
      }
      this.box(fr, x, top, z, w + 2, 2.4, d + 1.2, '#f0ece4');
      // Blue LED strips up the corners.
      for (const e of [-1, 1]) for (const f of [-1, 1]) this.tube(fr, new THREE.Vector3(x + e * (w / 2 + 1.9), 10, z + f * (d / 2 + 0.7)), new THREE.Vector3(x + e * (w / 2 + 1.9), top + 2, z + f * (d / 2 + 0.7)), 0.3, '#3aa8ff', 2.2);
      this.beacons(fr, x, z, w, top + 2.4);
      this.glow(fr, x, z, w + 4, 10, top + 2, 0.35, 0.75, 1.6);
    }
    this.sign(fr, 'aquarius', 20, 23 * FLOOR - 4, 30 + 12.3, 10, 1.4);
    this.sign(fr, 'aquarius', 0, 5, 60.4, 5.5, 1.5);
    this.porte(fr, -40, -66, 34, 14, '#2a7ab8');
    this.marquee(fr, -70, -80, 'aquarius', 4, 'aquariusLED', 6, '#e8e2d6');
    this.palms(31620, 33360, 31612, 33560, 13);
  }

  private regency() {
    this.seed = 103;
    const fr = this.site(31582, 33644, -0.01, 12, 26);
    this.box(fr, 0, -2, 0, 20, 9, 47, '#e6d8c0');
    this.box(fr, 0, 6.2, 0, 20.5, 1.2, 47.5, '#7a2a3a');
    this.storefront(fr, 0, -23.6, 14, 3);
  }

  /** Edgewater: the cream 26-storey slab with its recessed stripe and blue name. */
  private edgewater() {
    this.seed = -104;
    const fr = this.site(31585, 33700, 1.565, 50, 22);
    const W = 86, D = 22;
    const top = this.slab(fr, 0, 0, W, D, 26, '#e8dcc0', FX.WINDOWS, 0.8);
    // Recessed centre stripe and stair towers at the ends.
    for (const f of [-1, 1]) this.box(fr, 0, -2, f * (D / 2 + 0.1), 6, top + 2, 0.4, '#bfae8c', { rough: 0.8, glow: 0.4, fx: FX.WASH });
    for (const e of [-1, 1]) this.box(fr, e * (W / 2 + 2.5), -2, 0, 5, top + 6, 10, '#ddd0b2', { rough: 0.8, glow: 0.6, fx: FX.WASH });
    this.box(fr, 0, top, 0, W, 2.6, D, '#d8cba8');
    this.sign(fr, 'edgewater', 0, top + 6, D / 2 + 0.3, 7.5, 1.5);
    this.sign(fr, 'edgewater', 0, top + 6, -D / 2 - 0.3, 7.5, 1.5, FX.NONE, Math.PI);
    this.box(fr, 0, top + 2.6, 0, 66, 7, 1, '#d8cba8');
    this.beacons(fr, 0, 0, W, top + 9);
    this.glow(fr, 0, 0, W, 4, top, 1, 0.78, 0.5);
    this.glow(fr, 0, 0, 60, top + 3, top + 9, 0.3, 0.55, 2.2);
    // Second tower and the low white riverfront casino.
    const tf = this.site(31468, 33765, 0, 23, 36);
    this.slab(tf, 0, 0, 40, 66, 9, '#e2d6ba', FX.WINDOWS, 0.5);
    const cf = this.site(31548, 33805, -1.556, 64, 62);
    this.box(cf, 0, -2, 0, 120, 13, 118, '#f2eee6');
    this.box(cf, 0, 10.6, 0, 121, 1, 119, '#1f4fa8', { glow: 0.5 });
    this.storefront(cf, 0, 59.2, 70, 4, 0.9);
    this.porte(cf, 0, -66, 30, 12, '#e2d6ba');
    this.palms(31606, 33740, 31600, 33880, 12);
  }

  /** Colorado Belle: the paddlewheeler in her moat, four black stacks, the six-floor hotel behind. Dark since 2020. */
  private belle() {
    this.seed = 105;
    const fr = this.site(31540, 34092, -1.43, 95, 40);
    const L = 165;
    // Hull and three decks, tapering toward the bow (local -x, upriver).
    this.box(fr, 5, -4, 0, L - 10, 7, 34, '#f6f2ea', { rough: 0.6 });
    const bow = new THREE.CylinderGeometry(17, 17, 7, 3, 1).rotateY(Math.PI / 6).scale(0.9, 1, 1).translate(0, 3.5, 0);
    this.s.add(bow, fr.at(-L / 2 + 6, -4, 0), '#f6f2ea', { rough: 0.6 }, this.seed);
    this.box(fr, 5, 2.6, 0, L - 12, 0.6, 35, '#b81822');
    for (let k = 0; k < 3; k++) {
      const w = L - 26 - k * 22;
      const y = 3.2 + k * 4.4;
      this.box(fr, 8 + k * 6, y, 0, w, 3.8, 30 - k * 4, '#fbf8f0', { rough: 0.6 });
      this.box(fr, 8 + k * 6, y + 3.8, 0, w + 2, 0.4, 32 - k * 4, '#b81822');
      // Rail and window band.
      this.box(fr, 8 + k * 6, y + 0.8, 15.1 - k * 2, w - 4, 1.6, 0.1, '#2a3036', { rough: 0.2 });
      this.box(fr, 8 + k * 6, y + 0.8, -15.1 + k * 2, w - 4, 1.6, 0.1, '#2a3036', { rough: 0.2 });
    }
    // Pilot house and the four tall stacks with gold crowns.
    this.box(fr, -28, 16.4, 0, 12, 4, 10, '#fbf8f0');
    this.box(fr, -28, 20.4, 0, 14, 0.5, 12, '#b81822');
    for (const [px, pz] of [[-46, -7], [-46, 7], [-40, -7], [-40, 7]]) {
      this.cyl(fr, px, 15, pz, 1.4, 1.4, 26, '#141414', { rough: 0.6 }, 10);
      this.cyl(fr, px, 40.5, pz, 1.5, 2.6, 2.2, '#d6a84a', { rough: 0.4, fx: FX.METAL }, 10);
    }
    // Stern paddlewheel, sign boards along the hull.
    const wheel = new THREE.CylinderGeometry(8.5, 8.5, 22, 20, 1, true).rotateX(Math.PI / 2);
    this.s.add(wheel, fr.at(L / 2 + 2, 4, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), '#c01822', { rough: 0.7 }, this.seed);
    this.sign(fr, 'belleWheel', L / 2 - 12, 9, 17.6, 14, 0.2);
    this.sign(fr, 'belle', 0, 0, 17.2, 4.2, 0.2);
    this.sign(fr, 'belle', 0, 0, -17.2, 4.2, 0.2, FX.NONE, Math.PI);
    // Moat in front, the hotel behind.
    const hf = this.site(31520, 33920, 3.14, 54, 52);
    this.slab(hf, 0, 0, 104, 30, 6, '#efeae0', FX.WINDOWS, 0);
    this.palms(31585, 33990, 31570, 34190, 16, 11);
  }

  /** Tropicana: the wide white slab with its gold-and-green gabled centre, green turrets, and a green wash at night. */
  private tropicana() {
    this.seed = 106.36;
    const fr = this.site(31040, 34105, 1.57, 80, 30);
    const W = 150, D = 22;
    const top = this.slab(fr, 0, 0, W, D, 21, '#f0eee8', FX.WINDOWS, 1.6);
    // Centre section: gold and dark green, rising above the roof into a gable with an arched window.
    const cw = 26;
    this.box(fr, 0, -2, 0.8, cw, top + 6, D + 2, '#d4aa48', { rough: 0.6, glow: 1.2, fx: FX.WASH });
    for (const e of [-1, 1]) this.box(fr, e * 7, -2, D / 2 + 1.9, 5, top + 4, 0.3, '#1f4a3a', { rough: 0.5 });
    const gable = new THREE.CylinderGeometry(cw * 0.72, cw * 0.72, D + 2, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(1, 0.55, 1);
    this.s.add(gable, fr.at(0, top + 4 + cw * 0.18, 0.8), '#1f4a3a', { rough: 0.5 }, this.seed);
    this.box(fr, 0, top - 2, D / 2 + 2, 8, 10, 0.3, '#ffe0a0', { glow: 0.9 });
    this.sign(fr, 'tropicana', 0, top - 8, D / 2 + 2.3, 4.5, 1.5);
    // Green cupola turrets over the wings.
    for (const e of [-1, 1]) {
      this.box(fr, e * 52, top, 0, 14, 7, 14, '#f0eee8');
      const dome = new THREE.ConeGeometry(9.5, 9, 4, 1).rotateY(Math.PI / 4);
      this.s.add(dome, fr.at(e * 52, top + 11.5, 0), '#2a7a5a', { rough: 0.5, glow: 0.6, fx: FX.WASH }, this.seed);
    }
    this.beacons(fr, 0, 0, W, top + 14);
    this.glow(fr, 0, 0, W, 4, top + 6, 0.35, 1.2, 0.55);
    this.glow(fr, 0, 0, cw, 4, top + 14, 1.6, 1.1, 0.4);
    // Low casino and porte-cochère toward Casino Drive.
    const cf = this.site(31197, 34099, 1.44, 86, 60);
    this.box(cf, 0, -2, 0, 160, 11, 110, '#e8e2d2');
    this.box(cf, 0, 8.6, 0, 161, 1.6, 111, '#1f4a3a', { glow: 0.5 });
    this.box(cf, 0, 10.2, 0, 156, 0.2, 106, '#cfcabe');
    this.porte(cf, 0, 62, 40, 14, '#1f4a3a');
    this.marquee(cf, -40, 70, 'tropicana', 3, 'tropicanaLED', 6, '#d4aa48');
    this.palms(31262, 34020, 31270, 34180, 14);
  }

  /** The Pioneer: weathered western false fronts and River Rick waving at Casino Drive. */
  private pioneer() {
    this.seed = 107;
    const fr = this.site(31458, 34340, 0, 55, 34);
    this.box(fr, 0, -2, 0, 100, 13, 62, '#8a5a34', { rough: 0.95 });
    this.box(fr, 0, 10.8, 0, 101, 0.8, 63, '#5a3a20');
    this.slab(fr, 10, 10, 70, 30, 3, '#c8a878', FX.WINDOWS, 0, 0, 11);
    // False fronts with a shaded boardwalk along the drive.
    for (let i = 0; i < 4; i++) {
      this.box(fr, -36 + i * 24, 0, -32, 20, 14 + (i % 2) * 3, 1.4, i % 2 ? '#a06a3a' : '#7a4a28', { rough: 0.95 });
    }
    this.box(fr, 0, 3.6, -36, 96, 0.4, 6, '#5a3a20');
    for (let i = -4; i <= 4; i++) this.box(fr, i * 11, -1, -38.6, 0.4, 4.8, 0.4, '#5a3a20');
    this.sign(fr, 'pioneer', 0, 12, -32.8, 6, 1.4, FX.NONE, Math.PI);
    // River Rick on his pole at the corner.
    for (const px of [-0.8, 0.8]) this.box(fr, -40 + px, -1, -46, 0.5, 9, 0.5, '#3a3a3a');
    this.sign(fr, 'riverRick', -40, 17, -46, 16, 1.1, FX.NONE, Math.PI, true);
    this.light(fr.p(-40, 18, -47), 1, 0.75, 0.4, 7);
  }

  /** Golden Nugget: tan stucco, a big parking garage with the logo, and a forest of palms. */
  private nugget() {
    this.seed = 108;
    const fr = this.site(31437, 34481, 1.77, 50, 60);
    this.box(fr, 0, -2, 0, 86, 13, 110, '#cdb48e');
    this.box(fr, 0, 10.4, 0, 87, 1.6, 111, '#8a6a3e');
    for (const [x, z] of [[-24, 30], [24, 30]]) this.slab(fr, x, z, 30, 18, 4, '#d6bf98', FX.WINDOWS, 0.4, 0, 12);
    this.storefront(fr, 0, 55.2, 60, 4);
    this.sign(fr, 'nugget', 0, 7, 55.4, 5, 1.3);
    const gf = this.site(31350, 34535, 1.6, 56, 34);
    for (let l = 0; l < 6; l++) this.box(gf, 0, l * 3.3 - 1, 0, 108, 0.6, 63, '#c8b48e');
    for (const e of [-1, 1]) this.box(gf, e * 54, -1, 0, 1.2, 19, 63, '#b89a72');
    this.box(gf, 0, -1, 31.8, 108, 2, 0.6, '#b89a72');
    this.sign(gf, 'nugget', 0, 13, 32.3, 6, 1.2);
    this.sign(gf, 'nugget', 0, 13, -32.3, 6, 1.2, FX.NONE, Math.PI);
    for (let i = 0; i < 7; i++) this.palms(31480 + i * 6, 34420 + i * 4, 31440 + i * 6, 34560 + i * 4, 18, 12 + i);
  }

  /** Laughlin River Lodge: the rust-and-tan 25-storey tower with its curved crown, low red-roofed casino. */
  private riverLodge() {
    this.seed = -109;
    const fr = this.site(31335, 34851, -1.21, 48, 16);
    const W = 82, D = 20;
    const top = this.slab(fr, 0, 0, W, D, 25, '#c69a72', FX.WINDOWS, 0.6);
    for (const e of [-1, 1]) this.box(fr, e * (W / 2 + 0.4), -2, 0, 3, top + 4, D + 1.5, '#b4542e', { rough: 0.8 });
    // Curved parapet crown.
    const crown = new THREE.CylinderGeometry(D * 0.9, D * 0.9, W - 4, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.35, 0.6);
    this.s.add(crown, fr.at(0, top, 0), '#d8b48c', { rough: 0.7 }, this.seed);
    this.sign(fr, 'riverLodge', 0, top + 2.6, D / 2 + 1, 4.2, 1.4);
    this.beacons(fr, 0, 0, W, top + 6);
    this.glow(fr, 0, 0, W, 4, top + 4, 1, 0.7, 0.42);
    const cf = this.site(31245, 34995, 1.925, 90, 50);
    this.box(cf, 0, -2, 0, 160, 10, 90, '#d2b48c');
    const roof = new THREE.CylinderGeometry(1, 1, 160, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4).scale(1, 5, 46);
    this.s.add(roof, cf.at(0, 10, 0), '#a8482a', { rough: 0.7 }, this.seed);
    this.storefront(cf, 0, 45.2, 80, 3);
    // Water taxi dock.
    const b = bankAt(34970);
    const df = new Frame(b.x + b.nx * 6, this.hf.height(b.x - 8, 34970) - 3, 34970 + b.nz * 6, b.nx, b.nz);
    this.box(df, 0, 0, 0, 30, 0.6, 5, '#8a7a62');
    this.sign(df, 'waterTaxi', 0, 3, -1, 1.2, 0.8, FX.NONE, 0, true);
    for (const px of [-12, 12]) this.box(df, px, 0, -1, 0.3, 3.2, 0.3, '#6a6a6a');
    this.palms(31402, 34780, 31330, 34950, 15);
  }

  /** Harrah's: three terracotta-brick wings capped by white mission parapets, and its beach on the river. */
  private harrahs() {
    this.seed = -110;
    // [x, z, footprint angle, length along the river, depth toward it, floors]
    const wings: [number, number, number, number, number, number][] = [
      [31140, 35433, -3.14, 19, 86, 14],
      [31154, 35479, 1.57, 75, 27, 16],
      [31105, 35570, -3.12, 19, 83, 14],
    ];
    for (const [x, z, a, w, d, fl] of wings) {
      const fr = this.site(x, z, a, w / 2 + 4, d / 2 + 4);
      const top = this.slab(fr, 0, 0, w, d, fl, '#a85a3c', FX.WINDOWS, 0.6);
      this.box(fr, 0, top, 0, w + 1, 1.4, d + 1, '#f4efe4');
      // Mission parapet: scalloped white crown on the broad faces.
      const alongX = w > d;
      const L = alongX ? w : d;
      const D = alongX ? d : w;
      const yaw = alongX ? 0 : Math.PI / 2;
      for (let i = -3; i <= 3; i++) {
        const arch = new THREE.CylinderGeometry(3.2, 3.2, 0.8, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
        for (const f of [-1, 1]) {
          const u = i * (L / 7);
          const v = f * (D / 2 + 0.1);
          this.s.add(arch, fr.at(alongX ? u : v, top + 1.4, alongX ? v : u, yaw), '#f4efe4', { rough: 0.7 }, this.seed);
        }
      }
      for (const f of [-1, 1]) {
        const v = f * (D / 2 + 0.6);
        this.sign(fr, 'harrahs', alongX ? 0 : v, top + 4.6, alongX ? v : 0, 5.5, 1.5, FX.NONE, alongX ? (f > 0 ? 0 : Math.PI) : f > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      this.light(fr.p(0, top + 7, 0), 1, 0.08, 0.04, 3.2, 1);
      this.glow(fr, 0, 0, Math.max(w, d), 4, top + 6, 1, 0.66, 0.4);
    }
    const cf = this.site(31135, 35572, 0.004, 150, 62);
    this.box(cf, 0, -2, -10, 280, 12, 90, '#d8b898');
    this.box(cf, 0, 9.6, -10, 281, 1.4, 91, '#a85a3c');
    this.porte(cf, 60, -62, 34, 16, '#a85a3c');
    this.marquee(cf, 100, -80, 'harrahs', 3.4, 'harrahsLED', 6, '#a85a3c');
    // The beach: pale sand down to the water, umbrellas and palms.
    const b = bankAt(35560);
    for (let i = 0; i < 9; i++) {
      const z = 35500 + i * 14;
      const bb = bankAt(z);
      const fr = new Frame(bb.x - 6, this.hf.height(bb.x - 6, z), z, bb.nx, bb.nz);
      const col = i % 3 === 0 ? '#e8402a' : i % 3 === 1 ? '#18a8a0' : '#f0d040';
      this.cyl(fr, 0, -0.2, 0, 0.05, 0.05, 2.6, '#e8e8e8');
      const umb = new THREE.ConeGeometry(1.6, 0.7, 8).translate(0, 2.6, 0);
      this.s.add(umb, fr.at(0, 0, 0), col, { rough: 0.8 }, this.seed);
    }
    this.palms(b.x - 18, 35470, b.x - 14, 35660, 13, 12);
  }

  /** Terrible's and its 76, the In-N-Out, and the welcome sign at the foot of the bridge. */
  private roadside() {
    this.seed = 111;
    const tf = this.site(31213, 33867, 3.142, 12, 14);
    this.box(tf, 0, -1.5, 0, 19, 6.5, 24, '#e2d6be');
    this.box(tf, 0, 4.2, 11.7, 19.6, 1.6, 1.2, '#ffc61a');
    this.sign(tf, 'terriblesStore', 0, 5, 12.4, 1.4, 1.1);
    this.storefront(tf, 0, 12.1, 12, 2.6, 0.9);
    const sf = this.site(31248, 33875, 1.578, 15, 9);
    this.box(sf, 0, 5, 0, 26, 1.2, 14, '#f4f4f2');
    this.box(sf, 0, 4.95, 0, 25, 0.05, 13, '#fff6e8', { glow: 1.6 });
    for (const px of [-8, 0, 8]) this.box(sf, px, -1, 0, 0.7, 6, 0.7, '#e8e6e0');
    for (const yaw of [Math.PI / 2, -Math.PI / 2]) this.sign(sf, 'seventySix', 13.5, 9, 0, 4, 1.4, FX.NONE, yaw);
    this.cyl(sf, 13.5, -1, 0, 0.3, 0.25, 8, '#d8d8d8');
    this.light(sf.p(0, 4.8, 0), 1, 0.97, 0.92, 3);
    const nf = this.site(31252, 33942, -1.602, 13, 8);
    this.box(nf, 0, -1, 0, 23, 5.5, 13, '#f6f2ea');
    this.box(nf, 0, 3.6, 0, 23.4, 0.9, 13.4, '#d8001d');
    this.box(nf, 0, 3, 6.7, 23, 0.4, 0.1, '#ffd200', { glow: 0.6 });
    this.cyl(nf, 14, -1, 4, 0.35, 0.3, 12, '#d8d8d8');
    for (const yaw of [Math.PI / 2, -Math.PI / 2]) this.sign(nf, 'innout', 14, 13, 4, 3, 1.4, FX.NONE, yaw);
    this.palms(31238, 33925, 31238, 33962, 18, 14);
    // Welcome to Laughlin, at the bridge's Nevada end.
    const wf = new Frame(31590, this.hf.height(31590, 32480), 32480, 1, 0);
    for (const px of [-4, 4]) this.box(wf, px, -0.5, 0, 0.6, 5, 0.6, '#d4aa48');
    this.box(wf, 0, 2.6, 0, 9.4, 4.6, 0.4, '#0a2a5a');
    this.sign(wf, 'laughlinWelcome', 0, 4.9, 0.25, 4.2, 1.1, FX.NONE, 0, true);
    this.light(wf.p(0, 0.4, 2), 1, 0.85, 0.6, 1.5);
  }

  /** The Riverwalk: white rail along the bank from the bridge to Harrah's, lamps and palms. */
  private riverwalk() {
    this.seed = 112;
    const fr = new Frame(0, 0, 0, 0, 1);
    let prev: THREE.Vector3 | null = null;
    let k = 0;
    for (let z = 32560; z <= 35680; z += 3) {
      const b = bankAt(z);
      const x = b.x - b.nx * 4;
      const zz = z - b.nz * 4;
      const y = this.hf.height(x, zz);
      if (y < 155) {
        prev = null;
        continue;
      }
      const p = new THREE.Vector3(x, y, zz);
      this.box(fr, x, y - 0.3, zz, 0.14, 1.4, 0.14, '#f4f4f0', { rough: 0.5 });
      if (prev) {
        for (const h of [0.55, 1.05]) this.tube(fr, prev.clone().setY(prev.y + h), p.clone().setY(y + h), 0.09, '#f4f4f0', 0);
      }
      if (k % 9 === 0) {
        const lx = x - b.nx * 2.5;
        const lz = zz - b.nz * 2.5;
        const ly = this.hf.height(lx, lz);
        this.cyl(fr, lx, ly - 0.3, lz, 0.09, 0.07, 4.2, '#2a3a2e', { fx: FX.METAL }, 6);
        const globe = new THREE.SphereGeometry(0.32, 8, 6);
        this.s.add(globe, fr.at(lx, ly + 4.2, lz), '#fff4d8', { glow: 1.6 }, this.seed);
        this.light(new THREE.Vector3(lx, ly + 4.2, lz), 1, 0.78, 0.45, 1.3);
      }
      if (k % 6 === 3 && !this.occupies(x - b.nx * 8, zz - b.nz * 8)) this.palm(x - b.nx * 8, zz - b.nz * 8, 11 + (k % 5), k * 0.37);
      prev = p;
      k++;
    }
  }
}
