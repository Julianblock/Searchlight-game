import * as THREE from 'three';
import { G } from '../render/globals';
import { landmarkFragment, landmarkVertex } from '../render/shaders/landmarkShader';
import type { ShadowMap } from '../render/shadows';
import type { Heightfield } from './heightfield';
import type { OsmData } from './meta';
import { buildSignAtlas, type SignRect } from './signAtlas';
import { Frame, FX, type Mat, SignBuilder, SolidBuilder, UP } from './builders';

interface Site {
  x: number;
  z: number;
  radius: number;
}

/**
 * Searchlight's Main Street, hand-built: Terrible's Roadhouse and its Denny's,
 * the McDonald's pole sign, the Chevron, Terrible's Diesel and Rebel canopies,
 * the El Rey and B·V motels, the post office, the Duplex Mine headframe and
 * the Navy P-3 Orion memorial. Signs glow after dark.
 */
export class Landmarks {
  readonly group = new THREE.Group();
  readonly lights: number[] = [];
  readonly sites: Site[] = [];
  private solidMat: THREE.ShaderMaterial;
  private signMat: THREE.ShaderMaterial;
  private shadowMat: THREE.ShaderMaterial;
  private solidGeo: THREE.BufferGeometry;
  private hwy: number[][] = [];
  private hf: Heightfield;
  private s = new SolidBuilder();
  private sg = new SignBuilder();
  private rects: Record<string, SignRect>;
  private seed = 0;

  constructor(osm: OsmData, hf: Heightfield) {
    this.hf = hf;
    const atlas = buildSignAtlas();
    this.rects = atlas.rects;
    for (const r of osm.roads) if (r.kind === 'trunk') this.hwy.push(r.pts);

    const poi = (name: string) => osm.pois.find((p) => p.name === name);
    const site = (name: string, fallback: [number, number]) => {
      const p = poi(name);
      return p ? [p.x, p.z] : fallback;
    };

    this.terribles(...(site("Terrible's Roadhouse Searchlight", [-25.5, -81.5]) as [number, number]));
    this.terriblesStore(...(site('Terrible Herbst', [89.3, 461.6]) as [number, number]));
    this.mcdonalds(...(site("McDonald's", [118.9, 476]) as [number, number]));
    this.chevron(...(site('Chevron', [114.1, 514.6]) as [number, number]));
    this.diesel(...(site("Terrible's Diesel", [145.6, 548.5]) as [number, number]));
    this.rebel(...(site('Rebel', [63.8, 385.3]) as [number, number]));
    this.elRey(...(site('El Rey Motel', [38.4, 208.3]) as [number, number]));
    this.bvMotel(...(site('B V Motel', [113.6, 371.7]) as [number, number]));
    this.townCountry(...(site('Town & Country Store', [82.2, 375.1]) as [number, number]));
    this.postOffice(...(site('Searchlight Post Office', [113.5, 191.2]) as [number, number]));
    this.fireStation(...(site('Clark County Fire Station Number 75', [319.5, 25.5]) as [number, number]));
    this.headframe(...(site('Duplex Mine', [-248.4, 603.6]) as [number, number]));
    this.colton(...(site('George Frederick Colton and the Duplex Mine', [-29.3, 408.3]) as [number, number]));
    this.orion(...(site('152159 United States Navy P3A Orion Memorial', [1111.5, -265.6]) as [number, number]));
    this.museum(...(site('Searchlight Community Center', [1156.8, -328]) as [number, number]));
    this.welcome(-392, -598, -1);
    this.welcome(84, 614, 1);

    this.solidMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: landmarkVertex,
      fragmentShader: landmarkFragment,
      uniforms: { ...G },
      side: THREE.DoubleSide,
    });
    this.signMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: landmarkVertex,
      fragmentShader: landmarkFragment,
      uniforms: { ...G, uMap: { value: atlas.texture } },
      defines: { USE_MAP: '' },
    });
    this.shadowMat = this.solidMat.clone();
    this.shadowMat.uniforms = this.solidMat.uniforms;
    this.shadowMat.defines = { SHADOW_PASS: '' };
    this.solidGeo = this.s.build();
    this.group.add(new THREE.Mesh(this.solidGeo, this.solidMat), new THREE.Mesh(this.sg.build(), this.signMat));
  }

  /** True where a hand-built landmark already stands (OSM buildings skip these lots). */
  occupies(x: number, z: number) {
    return this.sites.some((s) => Math.hypot(x - s.x, z - s.z) < s.radius);
  }

  addShadowCasters(shadow: ShadowMap) {
    shadow.addCaster(this.solidGeo, this.shadowMat);
  }

  // --- helpers ---------------------------------------------------------------------

  /** Nearest point on US-95 and the road's direction there. */
  private nearestHighway(x: number, z: number) {
    let best = { d: Infinity, px: x, pz: z, tx: 1, tz: 0 };
    for (const p of this.hwy) {
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d < best.d) {
          const l = Math.sqrt(l2);
          best = { d, px, pz, tx: dx / l, tz: dz / l };
        }
      }
    }
    return best;
  }

  /** Frame at (x, z) facing the highway. */
  private frameFacing(x: number, z: number, radius: number) {
    const h = this.nearestHighway(x, z);
    let fx = h.px - x;
    let fz = h.pz - z;
    if (Math.hypot(fx, fz) < 1) { fx = -h.tz; fz = h.tx; }
    this.sites.push({ x, z, radius });
    return { fr: new Frame(x, this.hf.height(x, z), z, fx, fz), hwy: h };
  }

  private box(fr: Frame, x: number, y: number, z: number, w: number, h: number, d: number, color: string, mat: Mat = {}, yaw = 0) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    this.s.add(g, fr.at(x, y, z, yaw), color, mat, this.seed);
  }

  private cyl(fr: Frame, x: number, y: number, z: number, r0: number, r1: number, h: number, color: string, mat: Mat = {}, sides = 10) {
    const g = new THREE.CylinderGeometry(r1, r0, h, sides).translate(0, h / 2, 0);
    this.s.add(g, fr.at(x, y, z), color, mat, this.seed);
  }

  /** Sign face on a wall: centre (x, y, z) in the frame, facing local yaw (0 = toward the road). */
  private sign(fr: Frame, name: string, x: number, y: number, z: number, h: number, glow = 1, fx: number = FX.NONE, yaw = 0, both = false) {
    const s = this.rects[name];
    this.sg.quad(fr.p(x, y, z), fr.dir(yaw), UP, h * s.aspect, h, s, glow, fx, this.seed, both);
  }

  /**
   * Highway pylon: poles beside the road carrying stacked double-sided panels
   * turned broadside to traffic. Returns the frame of the pylon.
   */
  private pylon(hwy: { px: number; pz: number; tx: number; tz: number }, side: THREE.Vector3, setback: number, poles: number, panels: { name: string; h: number; y: number; glow?: number; fx?: number }[], poleColor = '#5a5a5c') {
    const x = hwy.px + side.x * setback;
    const z = hwy.pz + side.z * setback;
    // Panel faces point along the road so both directions of traffic read them.
    const fr = new Frame(x, this.hf.height(x, z), z, hwy.tx, hwy.tz);
    const top = Math.max(...panels.map((p) => p.y + p.h / 2));
    const width = Math.max(...panels.map((p) => p.h * this.rects[p.name].aspect));
    const sp = poles > 1 ? width * 0.32 : 0;
    for (let i = 0; i < poles; i++) {
      const px = poles > 1 ? (i ? sp : -sp) : 0;
      this.cyl(fr, px, -1, 0, poles > 1 ? 0.3 : 0.45, poles > 1 ? 0.26 : 0.38, top + 0.4, poleColor, { rough: 0.5, fx: FX.METAL });
    }
    for (const p of panels) {
      const w = p.h * this.rects[p.name].aspect;
      this.box(fr, 0, p.y - p.h / 2 - 0.15, 0, w + 0.3, p.h + 0.3, 0.5, '#2a2a2c', { rough: 0.6 });
      this.sg.quad(fr.p(0, p.y, 0.25), fr.r, UP, w, p.h, this.rects[p.name], p.glow ?? 1, p.fx ?? FX.NONE, this.seed, false);
      this.sg.quad(fr.p(0, p.y, -0.25), fr.r.clone().negate(), UP, w, p.h, this.rects[p.name], p.glow ?? 1, p.fx ?? FX.NONE, this.seed + 0.5, false);
    }
    return fr;
  }

  private light(p: THREE.Vector3, r: number, g: number, b: number, size: number, blink = 0) {
    this.lights.push(p.x, p.y, p.z, r, g, b, size, blink);
  }

  /** Tall parking-lot pole with a downlight. */
  private lotLight(fr: Frame, x: number, z: number, led = true) {
    this.cyl(fr, x, -1, z, 0.12, 0.09, 10, '#6a6a6a', { rough: 0.5, fx: FX.METAL }, 6);
    this.box(fr, x, 9.8, z, 0.8, 0.25, 0.5, '#3a3a3a');
    const p = fr.p(x, 9.7, z);
    if (led) this.light(p, 0.9, 0.93, 1, 1.4);
    else this.light(p, 1, 0.55, 0.18, 1.4);
  }

  /** Gas canopy: columns, fascia band from the atlas, glowing light panels underneath. */
  private canopy(fr: Frame, cx: number, cz: number, w: number, d: number, clear: number, band: string, fasciaColor: string) {
    const fh = 1.3;
    this.box(fr, cx, clear, cz, w, fh, d, fasciaColor, { rough: 0.5 });
    // Fascia band on all four sides.
    const bandH = fh * 0.92;
    const bandRect = this.rects[band];
    const mid = clear + fh / 2;
    this.sg.quad(fr.p(cx, mid, cz + d / 2), fr.r, UP, w, bandH, bandRect, 0.5, FX.NONE, this.seed);
    this.sg.quad(fr.p(cx, mid, cz - d / 2), fr.r.clone().negate(), UP, w, bandH, bandRect, 0.5, FX.NONE, this.seed);
    this.sg.quad(fr.p(cx + w / 2, mid, cz), fr.f.clone().negate(), UP, d, bandH, bandRect, 0.5, FX.NONE, this.seed);
    this.sg.quad(fr.p(cx - w / 2, mid, cz), fr.f, UP, d, bandH, bandRect, 0.5, FX.NONE, this.seed);
    // Recessed LED panels: the canopy blazes white at night.
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const px = cx + (i - 1) * w * 0.3;
        const pz = cz + (j - 0.5) * d * 0.45;
        this.box(fr, px, clear - 0.04, pz, w * 0.18, 0.04, d * 0.22, '#fff6e8', { glow: 1.6 });
        this.light(fr.p(px, clear - 0.1, pz), 1, 0.97, 0.92, 2.2);
      }
    }
    // Columns and pump islands.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = cx + sx * w * 0.3;
        const z = cz + sz * d * 0.22;
        this.box(fr, x, -1, z, 0.6, clear + 1, 0.6, '#e8e6e0', { rough: 0.5 });
        this.box(fr, x, -0.6, z, 1.2, 0.8, 4.4, '#cfcac0');
        this.box(fr, x, 0.2, z + 1.1, 0.8, 1.7, 0.5, '#d8d8dc', { rough: 0.4 });
        this.box(fr, x, 1.2, z + 1.1, 0.7, 0.5, 0.52, '#1a1a1e', { glow: 0.5 });
      }
    }
  }

  /** Lit storefront glazing strip on the front wall at local z. */
  private storefront(fr: Frame, cx: number, z: number, w: number, h: number, glow = 0.7) {
    this.box(fr, cx, 0.3, z, w, h, 0.12, '#3a2e22', { rough: 0.15, glow });
    // Mullions.
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 2.4) this.box(fr, cx + x, 0.3, z + 0.06, 0.12, h, 0.08, '#8a8a88', { fx: FX.METAL });
  }

  // --- landmarks --------------------------------------------------------------------

  private terribles(x: number, z: number) {
    this.seed = 1;
    const { fr, hwy } = this.frameFacing(x, z, 34);
    const zf = 15;
    // Casino: stacked-stone walls under a red standing-seam hip roof.
    this.box(fr, -11, -1.5, 0, 24, 5.7, 30, '#8c7e6c', { rough: 1 });
    this.box(fr, -11, -1.5, 0, 24.3, 2.2, 30.3, '#77695a', { rough: 1 });
    this.box(fr, -11, 4, 0, 25.6, 0.3, 31.6, '#3a2a1e');
    this.box(fr, -11, 3.85, zf + 0.82, 25.6, 0.12, 0.08, '#ffe2a0', { glow: 1.3 });
    const hip = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).scale(26 / Math.SQRT2, 3.4, 32 / Math.SQRT2).translate(0, 1.7, 0);
    this.s.add(hip, fr.at(-11, 4.25, 0), '#86281f', { rough: 0.45, fx: FX.METAL }, this.seed);
    // Entry: stone vestibule with a red gable and the brown CASINO board.
    this.box(fr, -9, -1, zf + 2, 9, 5.6, 4, '#8c7e6c', { rough: 1 });
    const gable = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0).scale(10.4 / 1.732, 2.8 / 1.5, 4.6);
    this.s.add(gable, fr.at(-9, 4.6, zf + 2.1), '#86281f', { rough: 0.45, fx: FX.METAL }, this.seed);
    this.box(fr, -9, 4.6, zf + 4.45, 8.4, 1.8, 0.15, '#4a2c1c');
    this.sign(fr, 'casinoBoard', -9, 5.4, zf + 4.56, 1.5, 0.9);
    this.storefront(fr, -9, zf + 4.06, 4.8, 3, 0.8);
    this.light(fr.p(-9, 4, zf + 5), 1, 0.8, 0.5, 3);
    // Dark awning over the rest of the casino front.
    this.box(fr, -18, 3, zf + 1.2, 10, 0.25, 2.4, '#3a2c22');
    this.storefront(fr, -18, zf + 0.06, 8, 2.4, 0.55);
    this.palm(fr, -14, zf + 3, 8);
    // Denny's: taller tan box, brown base, red mansard band with striped awnings below it.
    const dx = 12, dz = -1, dw = 22, dd = 28, dzf = dz + dd / 2;
    this.box(fr, dx, -1.5, dz, dw, 9.3, dd, '#d6c4a2');
    this.box(fr, dx, -1.5, dz, dw + 0.2, 2.5, dd + 0.2, '#4e3626');
    this.box(fr, dx, 7.6, dz, dw + 0.3, 0.35, dd + 0.3, '#5a3e2c');
    this.storefront(fr, dx, dzf + 0.06, 19, 2.3, 0.9);
    const tilt = (x: number, z: number, yaw: number, a: number) => fr.at(x, 0, z, yaw).multiply(new THREE.Matrix4().makeRotationX(a));
    const mansard = (len: number) => new THREE.BoxGeometry(len, 1.7, 0.25).translate(0, 0.85, 0);
    const lift = new THREE.Matrix4().makeTranslation(0, 3.5, 0);
    this.s.add(mansard(dw + 1.2), lift.clone().multiply(tilt(dx, dzf + 0.75, 0, -0.42)), '#7e1e1a', { rough: 0.45, fx: FX.METAL }, this.seed);
    this.s.add(mansard(dd + 1.2), lift.clone().multiply(tilt(dx + dw / 2 + 0.75, dz, Math.PI / 2, -0.42)), '#7e1e1a', { rough: 0.45, fx: FX.METAL }, this.seed);
    this.box(fr, dx, 3.35, dzf + 0.5, dw + 1.4, 0.15, 1.3, '#ffe2a0', { glow: 1.2 });
    const stripe = new THREE.BoxGeometry(0.62, 0.05, 1.5).translate(0, 0, 0.75);
    for (let i = 0; i < 5; i++) {
      const ax = dx - dw / 2 + 2.3 + i * 4.35;
      for (let k = 0; k < 6; k++) {
        this.s.add(stripe, new THREE.Matrix4().makeTranslation(0, 2.95, 0).multiply(tilt(ax - 1.55 + k * 0.62, dzf + 0.05, 0, 0.55)), k % 2 ? '#f2eee6' : '#c4201c', { rough: 0.8 }, this.seed);
      }
    }
    this.sign(fr, 'americasDiner', dx - 1.5, 6.1, dzf + 0.05, 0.95, 0.7);
    this.sign(fr, 'dennysHex', dx + dw / 2 - 2.4, 6.6, dzf + 0.06, 1.8, 1.2);
    const hex = this.rects.dennysHex;
    this.sg.quad(fr.p(dx + dw / 2 + 0.06, 6.6, dzf - 3), fr.r, UP, 1.8 * hex.aspect, 1.8, hex, 1.2, FX.NONE, this.seed, false);
    // Rooftop units.
    for (const [ux, uz] of [[8, -6], [15, 2]]) this.box(fr, ux, 7.8, uz, 2.6, 1.4, 2, '#b4b4ae', { fx: FX.METAL });
    this.roadhousePylon(hwy, new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize());
    // White three-rail vinyl fence along the highway, broken for the two driveways.
    const base = fr.p(0, 0, 0).y;
    const fz = hwy.d - 9;
    for (const [a, b] of [[-46, -30], [-17, 22], [34, 46]]) {
      const n = Math.round((b - a) / 2.4);
      const ys: number[] = [];
      for (let i = 0; i <= n; i++) {
        const px = a + ((b - a) * i) / n;
        const p = fr.p(px, 0, fz);
        ys.push(this.hf.height(p.x, p.z) - base);
        this.box(fr, px, ys[i] - 0.4, fz, 0.14, 1.65, 0.14, '#f2f0ea');
      }
      for (let i = 0; i < n; i++) {
        const px = a + ((b - a) * (i + 0.5)) / n;
        const y = (ys[i] + ys[i + 1]) / 2;
        for (const ry of [0.35, 0.72, 1.1]) this.box(fr, px, y + ry, fz + 0.09, (b - a) / n, 0.12, 0.05, '#f2f0ea');
      }
    }
    for (const [lx, lz] of [[-22, 26], [6, 30], [24, 24], [-30, 8]]) this.lotLight(fr, lx, lz);
    this.light(fr.p(dx, 3.3, dzf + 1.5), 1, 0.8, 0.5, 4);
    this.light(fr.p(-18, 3.8, zf + 1.5), 1, 0.8, 0.5, 3);
  }

  private palm(fr: Frame, x: number, z: number, h: number) {
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, h, 6).translate(0, h / 2, 0);
    this.s.add(trunk, fr.at(x, -0.3, z), '#8a7458', { rough: 0.95 }, this.seed);
    this.s.add(new THREE.CylinderGeometry(0.7, 0.4, 1.4, 7).translate(0, -0.7, 0), fr.at(x, h - 0.2, z), '#9a8a62', { rough: 1 }, this.seed);
    const frond = new THREE.ConeGeometry(0.5, 3, 4, 1).rotateX(Math.PI / 2).translate(0, 0, 1.5).scale(1, 0.25, 1);
    for (let i = 0; i < 10; i++) {
      const m = fr.at(x, h, z, (i / 10) * Math.PI * 2).multiply(new THREE.Matrix4().makeRotationX(0.2 + (i % 3) * 0.12));
      this.s.add(frond, m, i % 3 ? '#4f6a2c' : '#5e7a34', { rough: 0.85 }, this.seed);
    }
  }

  /** Terrible's roadside sign: one timber post, Denny's hex, LED board, the bulb-ringed Road House board and a wagon wheel. */
  private roadhousePylon(hwy: { px: number; pz: number; tx: number; tz: number }, side: THREE.Vector3) {
    const x = hwy.px + side.x * 14;
    const z = hwy.pz + side.z * 14;
    const fr = new Frame(x, this.hf.height(x, z), z, hwy.tx, hwy.tz);
    const wood = '#6a4a30';
    const both = (name: string, px: number, y: number, h: number, t: number, glow: number, fx: number = FX.NONE) => {
      const r = this.rects[name];
      this.sg.quad(fr.p(px, y, t), fr.r, UP, h * r.aspect, h, r, glow, fx, this.seed, false);
      this.sg.quad(fr.p(-px, y, -t), fr.r.clone().negate(), UP, h * r.aspect, h, r, glow, fx, this.seed + 0.5, false);
    };
    this.box(fr, 0, -1, 0, 0.9, 17.8, 0.36, wood, { rough: 0.95 });
    this.box(fr, 0, -1, 0, 1.6, 1.6, 1.6, '#8a7a68', { rough: 1 });
    // Denny's hex.
    this.box(fr, 0, 2.6, 0, 3.6, 2, 0.4, '#ffd200');
    both('dennysHex', 0, 3.6, 2.4, 0.22, 1.3);
    // Message board with neon wagon-wheel halves hanging off its lower corners.
    const ledH = 3, ledW = ledH * this.rects.terriblesLED.aspect;
    this.box(fr, 0, 5.55, 0, ledW + 0.5, ledH + 0.5, 0.6, '#1c1a18', { rough: 0.6 });
    both('terriblesLED', 0, 7.2, ledH, 0.31, 1.5);
    const arc = new THREE.TorusGeometry(1.1, 0.07, 5, 14, Math.PI).rotateZ(Math.PI);
    const spoke = new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(0, -0.55, 0);
    for (const sx of [-1, 1]) {
      const m = fr.at(sx * (ledW / 2 - 0.6), 5.55, 0);
      this.s.add(arc, m, '#ff8a1c', { glow: 2 }, this.seed);
      for (let i = 1; i < 5; i++) this.s.add(spoke, m.clone().multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + (i / 5) * Math.PI)), '#ff8a1c', { glow: 2 }, this.seed);
    }
    this.light(fr.p(0, 6, 0), 1, 0.55, 0.12, 4);
    // Wood board inside the red chaser ring.
    const by = 12.4, bh = 3.6, bw = bh * this.rects.roadhouse.aspect;
    this.box(fr, 0, by - bh / 2 - 0.15, 0, bw + 0.3, bh + 0.3, 0.45, '#3e2416', { rough: 0.9 });
    both('roadhouse', 0, by, bh, 0.24, 1.1);
    const rh = 5.8, rw = rh * this.rects.roadhouseRing.aspect;
    both('roadhouseRing', rw * 0.04, by, rh, 0.3, 1.6, FX.CHASE);
    for (const [bx, bz] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      this.box(fr, bx * (bw / 2 + 0.5), by + bz * (bh / 2 + 0.3) - 0.06, 0, bz ? 0.12 : 1, bz ? 0.6 : 0.12, 0.12, '#3a3a3a', { fx: FX.METAL });
    }
    this.light(fr.p(0, by, 0), 1, 0.3, 0.15, 7);
    // Wagon wheel on top.
    const wy = by + rh / 2 + 1.5;
    const wm = fr.at(0, wy, 0);
    this.s.add(new THREE.TorusGeometry(1.4, 0.13, 6, 24), wm, wood, { rough: 0.9 }, this.seed);
    this.s.add(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10).rotateX(Math.PI / 2), wm, '#3a2a1c', {}, this.seed);
    const sp = new THREE.BoxGeometry(0.1, 1.4, 0.1).translate(0, 0.7, 0);
    for (let i = 0; i < 12; i++) this.s.add(sp, wm.clone().multiply(new THREE.Matrix4().makeRotationZ((i / 12) * Math.PI * 2)), wood, { rough: 0.9 }, this.seed);
  }

  private terriblesStore(x: number, z: number) {
    this.seed = 2;
    const { fr } = this.frameFacing(x, z, 30);
    const W = 38, D = 18, H = 5.6;
    this.box(fr, 0, -1.5, 0, W, H + 1.5, D, '#e2d6be');
    this.box(fr, 0, H - 1.6, D / 2 - 0.4, W + 0.6, 2, 1.4, '#ffc61a', { rough: 0.5 });
    this.box(fr, 0, H + 0.4, D / 2 - 0.4, W + 0.6, 0.35, 1.4, '#b30f16');
    this.sign(fr, 'terriblesStore', -4, H - 0.6, D / 2 + 0.31, 1.8, 1.1);
    this.storefront(fr, 0, D / 2 + 0.06, W - 6, 2.8, 0.9);
    // Ice chest and propane cage out front.
    this.box(fr, 14, -0.3, D / 2 + 1, 2.4, 1.6, 0.9, '#e8f0f8', { glow: 0.2 });
    this.box(fr, -15, -0.3, D / 2 + 1, 2, 1.8, 1, '#c8ccd0', { fx: FX.METAL });
    for (const [lx, lz] of [[-18, 20], [18, 20]]) this.lotLight(fr, lx, lz);
  }

  private mcdonalds(x: number, z: number) {
    this.seed = 3;
    const { fr, hwy } = this.frameFacing(x, z, 14);
    const W = 17, D = 13, H = 4.6;
    this.box(fr, 0, -1.5, 0, W, H + 1.5, D, '#c9bba6');
    this.box(fr, 0, H - 0.4, 0, W + 0.6, 1.2, D + 0.6, '#3c3a38', { rough: 0.6 });
    // Entry tower: tan stucco, white cornice, dark hipped cap, red panel with the arches.
    const tw = 4.6, th = 8.2, tz = D / 2 - 1.5;
    this.box(fr, -3, -1.5, tz, tw, th + 1.5, tw, '#cdb898');
    this.box(fr, -3, th - 0.1, tz, tw + 0.5, 0.45, tw + 0.5, '#f0ece4');
    const cap = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).scale((tw + 0.9) / Math.SQRT2, 2, (tw + 0.9) / Math.SQRT2).translate(0, 1, 0);
    this.s.add(cap, fr.at(-3, th + 0.35, tz), '#4c4440', { rough: 0.7 }, this.seed);
    this.sign(fr, 'mcdTower', -3, th - 2.3, tz + tw / 2 + 0.02, 2.9, 1.2);
    for (const sx of [-1, 1]) this.sign(fr, 'mcdTower', -3 + sx * (tw / 2 + 0.02), th - 2.3, tz, 2.9, 1.2, FX.NONE, sx * Math.PI / 2);
    this.storefront(fr, 3.5, D / 2 + 0.06, 8, 2.6, 0.9);
    // Drive-thru menu board.
    this.box(fr, W / 2 + 4, -0.5, -2, 0.4, 2.6, 2.4, '#2a2a2a');
    this.box(fr, W / 2 + 4.21, 0.4, -2, 0.02, 1.6, 2.1, '#ffe8b0', { glow: 0.8 });
    // The tall highway pole sign, visible for miles down US-95.
    const side = new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize();
    const py = this.pylon(hwy, side, 14, 1, [{ name: 'mcdonalds', h: 6, y: 25, glow: 1.5 }], '#d8d8d8');
    this.light(py.p(0, 25, 0), 1, 0.7, 0.08, 9);
  }

  private chevron(x: number, z: number) {
    this.seed = 4;
    const { fr, hwy } = this.frameFacing(x, z, 22);
    this.canopy(fr, 0, 2, 30, 12, 5.2, 'canopyChevron', '#f4f4f2');
    // Mini-mart behind the canopy.
    this.box(fr, 0, -1.5, -14, 16, 6, 10, '#e6e2d8');
    this.box(fr, 0, 3.6, -8.8, 16.4, 0.9, 0.5, '#0054a4');
    this.storefront(fr, 0, -8.94, 10, 2.4, 0.9);
    const side = new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize();
    const py = this.pylon(hwy, side, 13, 2, [
      { name: 'chevron', h: 4.8, y: 12.4, glow: 1.3 },
      { name: 'prices', h: 3.2, y: 8, glow: 1.4 },
    ], '#e8e8e8');
    this.light(py.p(0, 12.4, 0), 0.6, 0.75, 1, 5);
  }

  private diesel(x: number, z: number) {
    this.seed = 5;
    const { fr, hwy } = this.frameFacing(x, z, 16);
    // Tall truck canopy.
    this.canopy(fr, 0, 0, 22, 11, 6.6, 'canopyTerribles', '#b30f16');
    const side = new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize();
    const py = this.pylon(hwy, side, 18, 2, [{ name: 'terriblesDiesel', h: 3.6, y: 13, glow: 1.3 }], '#a8141a');
    this.light(py.p(0, 13, 0), 1, 0.6, 0.1, 6);
  }

  private rebel(x: number, z: number) {
    this.seed = 6;
    const { fr, hwy } = this.frameFacing(x, z, 12);
    this.canopy(fr, 0, 1, 14, 9, 4.8, 'canopyChevron', '#f6f6f6');
    this.box(fr, 0, -1.5, -9, 9, 5.5, 7, '#e8dcc4');
    this.storefront(fr, 0, -5.44, 6, 2.3, 0.8);
    const side = new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize();
    this.pylon(hwy, side, 12, 1, [{ name: 'rebel', h: 3, y: 7.5, glow: 1.2 }], '#d8d8d8');
  }

  private elRey(x: number, z: number) {
    this.seed = 7;
    const { fr, hwy } = this.frameFacing(x, z, 28);
    // L-shaped single-storey court: white stucco, red tile roofs, a door per room.
    const wings: [number, number, number, number][] = [[0, -4, 36, 9], [-13.5, -18, 9, 22]];
    for (const [cx, cz, w, d] of wings) {
      this.box(fr, cx, -1.5, cz, w, 4.9, d, '#efe6d6');
      this.box(fr, cx, 3.4, cz, w + 1.6, 0.5, d + 1.6, '#a64a2c', { rough: 0.7 });
    }
    for (let i = 0; i < 9; i++) {
      const dx = -15 + i * 3.8;
      this.box(fr, dx, 0, 0.52, 1, 2.1, 0.06, i % 2 ? '#2e6a6a' : '#7a2a22');
      // Porch light by each door.
      this.box(fr, dx + 0.9, 2.3, 0.55, 0.18, 0.25, 0.1, '#ffe0a0', { glow: 1.5 });
      this.box(fr, dx + 1.7, 0.9, 0.52, 1, 1, 0.06, '#40342a', { rough: 0.2, glow: i % 3 ? 0.6 : 0 });
      if (i % 2 === 0) this.light(fr.p(dx + 0.9, 2.4, 0.8), 1, 0.7, 0.35, 0.7);
    }
    this.box(fr, 9, -1.5, 3, 7, 4.4, 5, '#efe6d6');
    this.storefront(fr, 9, 5.55, 5, 2.2, 0.8);
    // Vintage neon pole sign with buzzing VACANCY.
    const side = new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize();
    const py = this.pylon(hwy, side, 11, 1, [{ name: 'elrey', h: 6, y: 7.5, glow: 1.6, fx: FX.NEON }], '#2e6a6a');
    this.light(py.p(0, 8.5, 0), 1, 0.25, 0.3, 5);
    this.light(py.p(0, 6, 0), 0.3, 1, 0.5, 3);
  }

  private bvMotel(x: number, z: number) {
    this.seed = 8;
    const { fr, hwy } = this.frameFacing(x, z, 14);
    this.box(fr, 0, -1.5, 0, 22, 4.8, 9, '#ece2c8');
    this.box(fr, 0, 3.3, 0, 23.4, 0.4, 10.6, '#4a5a6a', { rough: 0.5, fx: FX.METAL });
    for (let i = 0; i < 6; i++) {
      this.box(fr, -9 + i * 3.6, 0, 4.52, 1, 2.1, 0.06, '#1c5a8a');
      this.box(fr, -8 + i * 3.6, 2.3, 4.55, 0.18, 0.25, 0.1, '#ffe0a0', { glow: 1.4 });
    }
    const side = new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize();
    this.pylon(hwy, side, 15, 1, [{ name: 'bvmotel', h: 2.6, y: 5.2, glow: 1.2 }], '#1c5a8a');
  }

  private townCountry(x: number, z: number) {
    this.seed = 9;
    const { fr } = this.frameFacing(x, z, 12);
    this.box(fr, 0, -1.5, 0, 20, 6, 13, '#b89a74');
    // Western false front.
    this.box(fr, 0, 4.5, 6.3, 21, 2.8, 0.5, '#8a5a3a');
    this.sign(fr, 'townCountry', 0, 5.6, 6.56, 1.7, 0.9);
    this.box(fr, 0, 3.1, 8.3, 20, 0.2, 4, '#6e4a30');
    for (const px of [-9.5, -3, 3, 9.5]) this.box(fr, px, -0.5, 10.1, 0.25, 3.6, 0.25, '#6e4a30');
    this.storefront(fr, 0, 6.56, 12, 2.4, 0.7);
  }

  private postOffice(x: number, z: number) {
    this.seed = 10;
    const { fr } = this.frameFacing(x, z, 13);
    // Red-brown board walls under a low hipped roof with deep eaves.
    this.box(fr, 0, -1.5, 0, 20, 5.6, 13, '#7a4434', { rough: 0.9 });
    this.box(fr, 0, 3.9, 0, 21.4, 0.35, 14.4, '#5a2a1c');
    const roof = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).scale(23.6 / Math.SQRT2, 2.4, 16.6 / Math.SQRT2).translate(0, 0.5 * 2.4, 0);
    this.s.add(roof, fr.at(0, 4.2, 0), '#a8885e', { rough: 0.95 }, this.seed);
    this.sign(fr, 'postOffice', -2, 2.9, 6.51, 0.9, 0.3);
    this.box(fr, 6.5, -0.5, 7.4, 0.6, 1.3, 0.5, '#1f3f8f', { fx: FX.METAL });
    this.storefront(fr, 0, 6.56, 6, 2.4, 0.4);
    // Flagpole and flag.
    this.cyl(fr, 8, -0.5, 10, 0.08, 0.05, 10.5, '#d8d8d8', { fx: FX.METAL }, 6);
    this.box(fr, 9.1, 8.6, 10, 2.2, 1.2, 0.02, '#b22234');
    this.box(fr, 8.55, 9.15, 10, 1.1, 0.65, 0.03, '#3c3b6e');
  }

  private fireStation(x: number, z: number) {
    this.seed = 11;
    const { fr } = this.frameFacing(x, z, 14);
    this.box(fr, 0, -1.5, 0, 22, 7.5, 14, '#e6dccb');
    this.box(fr, 0, 5.7, 0, 22.6, 0.4, 14.6, '#a01818');
    for (const bx of [-5, 1]) this.box(fr, bx, 0, 7.02, 4.4, 4.4, 0.05, '#c8c8c4', { fx: FX.METAL });
    this.sign(fr, 'fireStation', 0, 5.1, 7.06, 0.9, 0.3);
    this.light(fr.p(-2, 5, 7.6), 1, 0.12, 0.08, 1.4, 0);
  }

  /** Weathered timber headframe over the Duplex shaft, with ore bin and tailings. */
  private headframe(x: number, z: number) {
    this.seed = 12;
    const fr = new Frame(x, this.hf.height(x, z), z, 1, 0.3);
    this.sites.push({ x, z, radius: 10 });
    const wood = '#5e4a36';
    const H = 17;
    const sb = (a: THREE.Vector3, b: THREE.Vector3, r: number, col = wood) => {
      const d = b.clone().sub(a);
      const len = d.length();
      const g = new THREE.BoxGeometry(r, len, r).translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
      const m = new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1));
      this.s.add(g, fr.basis.clone().multiply(m), col, { rough: 0.95 }, this.seed);
    };
    const V = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
    for (const sx of [-1.6, 1.6]) {
      for (const sz of [-1.6, 1.6]) sb(V(sx, -0.5, sz), V(sx * 0.6, H, sz * 0.6), 0.35);
      // Back legs bracing toward the hoist house.
      sb(V(sx, -0.5, -9), V(sx * 0.6, H - 1, -0.9), 0.32);
    }
    for (let y = 2.5; y < H; y += 3) {
      const k = 1.6 - (y / H) * 1.0;
      sb(V(-k, y, -k), V(k, y, -k), 0.2);
      sb(V(-k, y, k), V(k, y, k), 0.2);
      sb(V(-k, y, -k), V(-k, y, k), 0.2);
      sb(V(k, y, -k), V(k, y, k), 0.2);
      sb(V(-k, y, k), V(k, y + 3, k), 0.14);
    }
    // Sheave wheel.
    const wheel = new THREE.TorusGeometry(1.1, 0.09, 6, 20);
    this.s.add(wheel, fr.at(0, H + 0.6, 0), '#3a2a20', { rough: 0.5, fx: FX.METAL }, this.seed);
    this.box(fr, 0, H - 0.3, 0, 2.2, 0.4, 2.2, wood);
    // Plank ore house boxing in the foot of the tower, with a chute out the front.
    this.box(fr, 0.6, -0.5, 0, 5.2, 5.6, 4.6, '#54402c', { rough: 1 });
    this.box(fr, 0.6, 5.1, 0, 5.8, 0.3, 5.2, '#3e3024', { rough: 1 });
    for (let i = 0; i < 6; i++) this.box(fr, -1.95 + i * 1.02, -0.5, 2.32, 0.08, 5.6, 0.06, '#3e3024');
    const chute = new THREE.BoxGeometry(1.2, 0.5, 3).translate(0, 0, 1.5).rotateX(0.5);
    this.s.add(chute, fr.at(3.5, 2.6, 0, Math.PI / 2), '#4a3826', { rough: 1 }, this.seed);
    this.box(fr, 0, -0.5, -11, 6, 4, 5, '#8a7a68', { fx: FX.METAL });
    // Tailings dump: pale yellow-grey cone spilling downslope.
    const dump = new THREE.ConeGeometry(14, 6, 18, 1).scale(1, 1, 0.7);
    this.s.add(dump, fr.at(-6, 0.5, 12), '#c8b890', { rough: 1 }, this.seed);
  }

  private colton(x: number, z: number) {
    this.seed = 13;
    const fr = new Frame(x, this.hf.height(x, z), z, 1, 0);
    this.box(fr, 0, -0.5, 0, 1.6, 2, 0.9, '#8a7a6a', { rough: 1 });
    this.box(fr, 0, 1.0, 0.46, 1.1, 0.6, 0.04, '#6a5420', { fx: FX.METAL });
  }

  /** The Navy P-3A Orion on its pedestal by the community centre. */
  private orion(x: number, z: number) {
    this.seed = 14;
    const fr = new Frame(x, this.hf.height(x, z) + 2.2, z, 0.6, 0.8);
    this.sites.push({ x, z, radius: 20 });
    const grey = '#c8ccd0';
    const white = '#eef0f2';
    const L = 35.6;
    // Fuselage along local z, nose toward +z.
    const body = new THREE.CylinderGeometry(1.7, 1.7, L * 0.7, 16).rotateX(Math.PI / 2);
    this.s.add(body, fr.at(0, 1.7, 0), white, { rough: 0.4 }, this.seed);
    const nose = new THREE.SphereGeometry(1.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1, 2).rotateX(Math.PI / 2);
    this.s.add(nose, fr.at(0, 1.7, L * 0.35), white, { rough: 0.4 }, this.seed);
    const tail = new THREE.CylinderGeometry(1.7, 0.4, L * 0.28, 16).rotateX(-Math.PI / 2);
    this.s.add(tail, fr.at(0, 2.2, -L * 0.35 - L * 0.13), grey, { rough: 0.4 }, this.seed);
    // MAD boom sticking out the tail.
    const boom = new THREE.CylinderGeometry(0.2, 0.3, 4, 8).rotateX(-Math.PI / 2);
    this.s.add(boom, fr.at(0, 2.6, -L * 0.62 - 2), grey, { rough: 0.4 }, this.seed);
    // Wings, fin and tailplane.
    this.box(fr, 0, 1.0, 2, 30.4, 0.5, 4.2, grey, { rough: 0.45 });
    this.box(fr, 0, 2.6, -L * 0.55, 13, 0.3, 2.6, grey, { rough: 0.45 });
    const fin = new THREE.BoxGeometry(0.35, 6, 4).translate(0, 3, 0);
    fin.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, -0.35, 0, 0));
    this.s.add(fin, fr.at(0, 3, -L * 0.56), grey, { rough: 0.45 }, this.seed);
    // Four turboprop nacelles with prop discs.
    for (const ex of [-9.6, -4.8, 4.8, 9.6]) {
      const nac = new THREE.CylinderGeometry(0.6, 0.5, 5, 10).rotateX(Math.PI / 2);
      this.s.add(nac, fr.at(ex, 0.9, 3.2), grey, { rough: 0.4 }, this.seed);
      const prop = new THREE.CylinderGeometry(2.1, 2.1, 0.06, 18).rotateX(Math.PI / 2);
      this.s.add(prop, fr.at(ex, 0.9, 5.8), '#3a3a3a', { rough: 0.6 }, this.seed);
    }
    // Dark cockpit glazing and the pedestals.
    this.box(fr, 0, 2.4, L * 0.36, 2.2, 0.7, 1.6, '#1a2228', { rough: 0.1 });
    for (const pz of [-6, 6]) this.box(fr, 0, -3.2, pz, 1.2, 4.2, 1.2, '#b0a898');
  }

  private museum(x: number, z: number) {
    this.seed = 15;
    const fr = new Frame(x + 18, this.hf.height(x + 18, z + 30), z + 30, 0.3, 1);
    for (const px of [-2.6, 2.6]) this.box(fr, px, -0.5, 0, 0.25, 3.4, 0.25, '#5e4028');
    this.box(fr, 0, 1.6, 0, 6.4, 1.6, 0.18, '#3a2a1a');
    this.sign(fr, 'museum', 0, 2.4, 0.1, 1.3, 0.2, FX.NONE, 0, true);
    // An old ore cart on a stub of track.
    this.box(fr, 5, -0.2, 2, 1.4, 1, 0.9, '#5a4a3a', { fx: FX.METAL });
    this.box(fr, 5, -0.4, 2, 5, 0.12, 1.1, '#4a3a2a');
  }

  /** The welcome monument beside US-95: a tan boulder slab with a green slate panel, on a rock mound. */
  private welcome(x: number, z: number, dir: number) {
    this.seed = 16;
    const h = this.nearestHighway(x, z);
    const side = new THREE.Vector3(-h.tz, 0, h.tx).multiplyScalar(dir);
    const px = h.px + side.x * 15;
    const pz = h.pz + side.z * 15;
    // Face oncoming traffic: southbound drivers see the north sign, and vice versa.
    const fr = new Frame(px, this.hf.height(px, pz), pz, -h.tx * dir, -h.tz * dir);
    const rock = new THREE.Shape([
      new THREE.Vector2(-2.9, 0), new THREE.Vector2(2.9, 0), new THREE.Vector2(3.15, 1.7), new THREE.Vector2(2.5, 3.3),
      new THREE.Vector2(-2.3, 3.55), new THREE.Vector2(-3.05, 2.5), new THREE.Vector2(-2.75, 0.9),
    ]);
    const slab = new THREE.ExtrudeGeometry(rock, { depth: 1.1, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1 }).translate(0, 0, -0.55);
    this.s.add(slab, fr.at(0, 0.7, 0), '#c2a47c', { rough: 1, fx: FX.WASH, glow: 0.9 }, -16);
    this.sign(fr, 'welcome', 0, 2.42, 0.69, 2.9, 0.6);
    // Rubble mound the slab is bedded in.
    const stone = new THREE.DodecahedronGeometry(0.75, 0);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const r = (i % 2 ? 3.3 : 2.4) + Math.sin(i * 3.7) * 0.4;
      const m = fr.at(Math.cos(a) * r, i % 2 ? -0.1 : 0.35, Math.sin(a) * r * 0.5, i).multiply(new THREE.Matrix4().makeScale(1 + (i % 3) * 0.25, 0.75, 1));
      this.s.add(stone, m, ['#8a6e52', '#9a826a', '#7a6450'][i % 3], { rough: 1 }, this.seed);
    }
    const mound = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(3.6, 0.9, 1.8);
    this.s.add(mound, fr.at(0, -0.2, 0), '#8e765c', { rough: 1 }, this.seed);
    // The floodlight perched on top.
    this.box(fr, 0.6, 4.35, 0.2, 0.7, 0.45, 0.5, '#2a2a2a', { fx: FX.METAL });
    this.light(fr.p(0.6, 4.3, 0.8), 1, 0.85, 0.6, 1.2);
  }
}
