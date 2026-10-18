import * as THREE from 'three';
import { G } from '../render/globals';
import { landmarkFragment, landmarkVertex } from '../render/shaders/landmarkShader';
import type { ShadowMap } from '../render/shadows';
import type { Heightfield } from './heightfield';
import type { OsmData } from './meta';
import { buildSignAtlas, type SignRect } from './signAtlas';

const UP = new THREE.Vector3(0, 1, 0);
const FX = { NONE: 0, NEON: 1, CHASE: 2, METAL: 3 } as const;

interface Mat {
  rough?: number;
  glow?: number;
  fx?: number;
}

/** Merged, vertex-coloured solids for every landmark. */
class SolidBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  private c = new THREE.Color();

  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: string, { rough = 0.8, glow = 0, fx = 0 }: Mat = {}, seed = 0) {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    this.c.set(color);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nrm.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.mat.push(rough, glow, fx, seed);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** Atlas-mapped sign faces. */
class SignBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  rect: number[] = [];
  frames: number[] = [];
  col: number[] = [];
  mat: number[] = [];

  /** Quad centred on `c`, text running along `r`, `u` up; optionally readable from behind too. */
  quad(c: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3, w: number, h: number, s: SignRect, glow: number, fx: number, seed: number, both = false) {
    const face = (rr: THREE.Vector3) => {
      const n = new THREE.Vector3().crossVectors(rr, u).normalize();
      const o = c.clone().addScaledVector(n, 0.03);
      const corner = (a: number, b: number) => o.clone().addScaledVector(rr, a * w * 0.5).addScaledVector(u, b * h * 0.5);
      const verts: [THREE.Vector3, number, number][] = [
        [corner(-1, 1), 0, 0], [corner(-1, -1), 0, 1], [corner(1, -1), 1, 1],
        [corner(-1, 1), 0, 0], [corner(1, -1), 1, 1], [corner(1, 1), 1, 0],
      ];
      for (const [v, a, b] of verts) {
        this.pos.push(v.x, v.y, v.z);
        this.nrm.push(n.x, n.y, n.z);
        this.uv.push(a, b);
        this.rect.push(s.u0, s.v0, s.u1, s.v1);
        this.frames.push(s.frames);
        this.col.push(1, 1, 1);
        this.mat.push(0.5, glow, fx, seed);
      }
    };
    face(r);
    if (both) face(r.clone().negate());
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aRect', new THREE.Float32BufferAttribute(this.rect, 4));
    g.setAttribute('aFrames', new THREE.Float32BufferAttribute(this.frames, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** A landmark's local frame: x along the frontage, z out toward the road, origin on the ground. */
class Frame {
  readonly o: THREE.Vector3;
  readonly f: THREE.Vector3;
  readonly r: THREE.Vector3;
  readonly basis: THREE.Matrix4;

  constructor(x: number, y: number, z: number, fx: number, fz: number) {
    this.o = new THREE.Vector3(x, y, z);
    this.f = new THREE.Vector3(fx, 0, fz).normalize();
    this.r = new THREE.Vector3().crossVectors(UP, this.f).normalize();
    this.basis = new THREE.Matrix4().makeBasis(this.r, UP, this.f).setPosition(this.o);
  }

  p(x: number, y: number, z: number) {
    return this.o.clone().addScaledVector(this.r, x).addScaledVector(UP, y).addScaledVector(this.f, z);
  }

  /** Matrix placing a geometry at local (x, y, z), turned `yaw` about the local vertical. */
  at(x: number, y: number, z: number, yaw = 0) {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    return this.basis.clone().multiply(m);
  }

  /** Local direction rotated by yaw, for sign faces. */
  dir(yaw: number) {
    const v = this.r.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(this.f, -Math.sin(yaw));
    return v.normalize();
  }
}

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
    const W = 46, D = 30, H = 7;
    const zf = D / 2;
    // Roadhouse: tan stucco with a red parapet and a gold stripe.
    this.box(fr, 0, -1.5, 0, W, H + 1.5, D, '#d6bf98');
    this.box(fr, 0, H - 0.2, 0, W + 0.4, 1.6, D + 0.4, '#a8141a', { rough: 0.6 });
    this.box(fr, 0, H - 0.5, zf + 0.21, W + 0.4, 0.3, 0.05, '#f0b020');
    this.box(fr, 0, H + 1.3, 0, W - 1, 0.1, D - 1, '#cfccc4');
    // Western false front over the entry, carrying the big wordmark.
    this.box(fr, -4, H, zf - 0.5, 18, 4.6, 1, '#a8141a');
    this.sign(fr, 'terribles', -4, H + 2.3, zf, 4.2, 1.2);
    // Porte-cochère with chasing CASINO marquee.
    this.box(fr, -4, 4.6, zf + 4.5, 16, 0.9, 9, '#a8141a');
    this.box(fr, -4, 4.56, zf + 4.5, 15, 0.05, 8, '#fff0d0', { glow: 1.2 });
    for (const sx of [-7, -1, 5]) this.box(fr, sx - 0.5 * Math.sign(sx), -1, zf + 8.4, 0.7, 5.7, 0.7, '#d6bf98');
    this.sign(fr, 'casino', -4, 5.05, zf + 9, 0.85, 1.4, FX.CHASE);
    this.storefront(fr, -4, zf + 0.06, 12, 3);
    // Denny's wing at the north end with its own sign and booths in the windows.
    this.box(fr, 15, H + 0.3, zf - 0.5, 12, 3.2, 1, '#ffd200');
    this.sign(fr, 'dennys', 15, H + 1.9, zf, 2.8, 1.2);
    this.storefront(fr, 15, zf + 0.06, 13, 2.6, 0.9);
    this.storefront(fr, -18, zf + 0.06, 6, 2.4, 0.5);
    // Rooftop units.
    for (const [ux, uz] of [[-12, -4], [6, 2], [14, -8]]) this.box(fr, ux, H + 1.3, uz, 2.6, 1.4, 2, '#b4b4ae', { fx: FX.METAL });
    // Highway pylon: Terrible's on top, the message board, then Denny's.
    const side = new THREE.Vector3(x - hwy.px, 0, z - hwy.pz).normalize();
    const py = this.pylon(hwy, side, 16, 2, [
      { name: 'terribles', h: 5, y: 19.5, glow: 1.3 },
      { name: 'terriblesLED', h: 3.2, y: 15.2, glow: 1.4 },
      { name: 'dennys', h: 3.2, y: 11.4, glow: 1.3 },
    ], '#a8141a');
    this.light(py.p(0, 19.5, 0), 1, 0.5, 0.12, 7);
    this.light(py.p(0, 11.4, 0), 1, 0.75, 0.1, 5);
    for (const [lx, lz] of [[-22, 26], [6, 30], [24, 24], [-30, 8]]) this.lotLight(fr, lx, lz);
    this.light(fr.p(-4, H + 2.3, zf + 1), 1, 0.45, 0.1, 5);
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
    // Golden "eyebrow" panel with the arches.
    this.box(fr, -3, 0, D / 2 + 0.05, 4.8, H + 1.6, 0.6, '#ffbc0d', { rough: 0.5 });
    this.sign(fr, 'mcdArches', -3, H - 0.2, D / 2 + 0.36, 2.2, 1.2);
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
    this.box(fr, 0, -1.5, 0, 20, 6, 13, '#c8a888');
    this.box(fr, 0, 4.3, 0, 20.6, 0.5, 13.6, '#ece6da');
    this.sign(fr, 'postOffice', 0, 3.6, 6.51, 1.1, 0.3);
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
    const wood = '#6a5238';
    const H = 14;
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
    // Ore bin and tin hoist house.
    this.box(fr, 4.5, -0.5, 0, 3.4, 5, 3.4, '#5e4a34');
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

  /** Routed-timber welcome sign beside US-95 facing traffic entering town. */
  private welcome(x: number, z: number, dir: number) {
    this.seed = 16;
    const h = this.nearestHighway(x, z);
    const side = new THREE.Vector3(-h.tz, 0, h.tx).multiplyScalar(dir);
    const px = h.px + side.x * 15;
    const pz = h.pz + side.z * 15;
    // Face oncoming traffic: southbound drivers see the north sign, and vice versa.
    const fr = new Frame(px, this.hf.height(px, pz), pz, -h.tx * dir, -h.tz * dir);
    for (const sx of [-3, 3]) this.box(fr, sx, -0.5, 0, 0.35, 5.2, 0.35, '#4a3420');
    this.box(fr, 0, 1.3, -0.1, 7.6, 3.8, 0.2, '#5e4028');
    this.sign(fr, 'welcome', 0, 3.2, 0, 3.6, 0.15);
    // Uplights so it reads at night.
    this.light(fr.p(-1.5, 0.3, 1.2), 1, 0.8, 0.5, 0.8);
    this.light(fr.p(1.5, 0.3, 1.2), 1, 0.8, 0.5, 0.8);
  }
}
