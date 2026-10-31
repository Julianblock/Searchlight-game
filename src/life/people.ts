import * as THREE from 'three';
import { G } from '../render/globals';
import { lightingCommon } from '../render/shaders/lighting';
import type { Heightfield } from '../world/heightfield';

/** Where people walk (open polylines, world x/z pairs) and where they gather. */
export interface Crowd {
  walks: number[][];
  spots: { x: number; z: number; r: number; n: number; yaw?: number }[];
  /** People out at noon vs. after dark (0..1 of the full count). */
  day: number;
  night: number;
  /** Bounding centre and radius: nobody is drawn when the camera is far away. */
  cx: number;
  cz: number;
  radius: number;
}

const BONE = { BODY: 0, L_THIGH: 1, L_SHIN: 2, R_THIGH: 3, R_SHIN: 4, L_ARM: 5, L_FORE: 6, R_ARM: 7, R_FORE: 8, HEAD: 9 } as const;
const MAT = { SKIN: 0, SHIRT: 1, PANTS: 2, SHOES: 3, HAIR: 4 } as const;

/** A 1.75 m adult in metres, facing +z, with per-vertex bone and material ids. */
function bodyGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const bone: number[] = [];
  const mat: number[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Matrix4, b: number, k: number) => {
    const gg = g.index ? g.toNonIndexed() : g;
    gg.applyMatrix4(m);
    gg.computeVertexNormals();
    const p = gg.attributes.position, n = gg.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      bone.push(b);
      mat.push(k);
    }
  };
  const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  /** Tapered limb hanging from (x, y0) down to y1. */
  const seg = (x: number, y0: number, y1: number, r0: number, r1: number, b: number, k: number, sides = 7) =>
    add(new THREE.CylinderGeometry(r0, r1, y0 - y1, sides), at(x, (y0 + y1) / 2, 0), b, k);

  // Torso: chest wider than waist, flattened front to back; hips in trouser colour.
  add(new THREE.CylinderGeometry(0.19, 0.155, 0.5, 10), at(0, 1.2, 0, 1, 1, 0.62), BONE.BODY, MAT.SHIRT);
  add(new THREE.SphereGeometry(0.19, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), at(0, 1.44, 0, 1, 0.35, 0.62), BONE.BODY, MAT.SHIRT);
  add(new THREE.CylinderGeometry(0.158, 0.165, 0.2, 10), at(0, 0.88, 0, 1, 1, 0.68), BONE.BODY, MAT.PANTS);
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 6), at(0, 1.5, 0), BONE.BODY, MAT.SKIN);
  // Head with a cap of hair, a nose and ears so it reads from the side.
  add(new THREE.SphereGeometry(0.1, 12, 9), at(0, 1.62, 0.005, 0.92, 1.12, 1), BONE.HEAD, MAT.SKIN);
  add(new THREE.SphereGeometry(0.106, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), at(0, 1.64, -0.012, 0.95, 1.08, 1.04), BONE.HEAD, MAT.HAIR);
  add(new THREE.ConeGeometry(0.018, 0.04, 4).rotateX(Math.PI / 2), at(0, 1.6, 0.105), BONE.HEAD, MAT.SKIN);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.022, 5, 4), at(s * 0.092, 1.615, 0, 0.5, 1, 1), BONE.HEAD, MAT.SKIN);
  for (const s of [-1, 1]) {
    const x = s * 0.09;
    seg(x, 0.92, 0.5, 0.078, 0.058, s < 0 ? BONE.L_THIGH : BONE.R_THIGH, MAT.PANTS);
    seg(x, 0.5, 0.08, 0.056, 0.042, s < 0 ? BONE.L_SHIN : BONE.R_SHIN, MAT.PANTS);
    add(new THREE.BoxGeometry(0.1, 0.075, 0.25), at(x, 0.04, 0.045), s < 0 ? BONE.L_SHIN : BONE.R_SHIN, MAT.SHOES);
    const ax = s * 0.215;
    seg(ax, 1.43, 1.13, 0.052, 0.045, s < 0 ? BONE.L_ARM : BONE.R_ARM, MAT.SHIRT);
    seg(ax, 1.13, 0.87, 0.042, 0.034, s < 0 ? BONE.L_FORE : BONE.R_FORE, MAT.SKIN);
    add(new THREE.SphereGeometry(0.045, 6, 5), at(ax, 0.83, 0.01, 0.75, 1.1, 1), s < 0 ? BONE.L_FORE : BONE.R_FORE, MAT.SKIN);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aBone', new THREE.Float32BufferAttribute(bone, 1));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(mat, 1));
  return g;
}

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCamPos;
in float aBone;
in float aMat;
in vec4 aT0; // x, y, z, yaw
in vec4 aT1; // walk phase, stride (0 = standing), height scale, idle pose
in vec4 aC0; // shirt rgb, skin tone
in vec4 aC1; // trousers rgb, hair colour
out vec3 vWorld;
out vec3 vNormal;
flat out float vMat;
flat out vec4 vC0;
flat out vec4 vC1;

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

void main() {
  int b = int(aBone + 0.5);
  float ph = aT1.x;
  float amp = aT1.y;
  float idle = aT1.w;
  vec3 p = position;
  vec3 n = normal;
  // Walk cycle: thighs swing opposite, knees fold on the back swing, arms counter-swing.
  float side = (b == 1 || b == 2 || b == 5 || b == 6) ? 1.0 : -1.0;
  float swing = sin(ph) * side;
  if (b >= 1 && b <= 4) {
    vec3 hip = vec3(position.x > 0.0 ? 0.09 : -0.09, 0.92, 0.0);
    vec3 knee = vec3(hip.x, 0.5, 0.0);
    float thigh = -swing * 0.48 * amp;
    float bend = amp * (0.1 + 0.85 * max(0.0, cos(ph) * side)) + (1.0 - amp) * 0.03;
    if (b == 2 || b == 4) {
      mat3 k = rotX(bend);
      p = k * (p - knee) + knee;
      n = k * n;
    }
    mat3 h = rotX(thigh);
    p = h * (p - hip) + hip;
    n = h * n;
  } else if (b >= 5 && b <= 8) {
    vec3 sh = vec3(position.x > 0.0 ? 0.215 : -0.215, 1.43, 0.0);
    vec3 el = vec3(sh.x, 1.13, 0.0);
    float arm = swing * 0.42 * amp;
    float fore = -0.18 - 0.25 * amp;
    // Idle poses: one hand up to the ear (phone), or arms folded.
    bool right = position.x < 0.0;
    if (idle > 0.66 && right) { arm = -0.35; fore = -2.2; }
    else if (idle > 0.33 && idle <= 0.66) { arm = -0.25; fore = -1.45; }
    if (b == 6 || b == 8) {
      mat3 f = rotX(fore);
      p = f * (p - el) + el;
      n = f * n;
    }
    mat3 a = rotX(arm);
    p = a * (p - sh) + sh;
    n = a * n;
  }
  // Bob on each step and a little sway while standing about.
  float t = ph;
  p.y += amp * 0.035 * abs(cos(t));
  p.x += (1.0 - amp) * 0.015 * sin(t * 0.3);
  p *= aT1.z;
  float c = cos(aT0.w), s = sin(aT0.w);
  mat2 R = mat2(c, -s, s, c);
  p.xz = R * p.xz;
  n.xz = R * n.xz;
  vec3 world = aT0.xyz + p;
  vWorld = world;
  vNormal = n;
  vMat = aMat;
  vC0 = aC0;
  vC1 = aC1;
  vec2 dc = world.xz - uCamPos.xz;
  world.y -= dot(dc, dc) / (2.0 * 7310000.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
${lightingCommon}
#include <logdepthbuf_pars_fragment>
uniform float uLit;
in vec3 vWorld;
in vec3 vNormal;
flat in float vMat;
flat in vec4 vC0;
flat in vec4 vC1;
out vec4 outColor;

const vec3 SKIN[5] = vec3[5](vec3(0.92, 0.72, 0.58), vec3(0.8, 0.58, 0.42), vec3(0.62, 0.42, 0.28), vec3(0.42, 0.27, 0.17), vec3(0.28, 0.17, 0.11));
const vec3 HAIR[5] = vec3[5](vec3(0.05, 0.04, 0.035), vec3(0.22, 0.13, 0.07), vec3(0.62, 0.5, 0.3), vec3(0.55, 0.55, 0.55), vec3(0.42, 0.18, 0.08));

void main() {
  #include <logdepthbuf_fragment>
  int m = int(vMat + 0.5);
  vec3 albedo;
  float rough = 0.8;
  if (m == 0) { albedo = SKIN[int(vC0.a + 0.5)]; rough = 0.55; }
  else if (m == 1) albedo = vC0.rgb;
  else if (m == 2) albedo = vC1.rgb;
  else if (m == 3) { albedo = vec3(0.06); rough = 0.5; }
  else { albedo = HAIR[int(vC1.a + 0.5)]; rough = 0.6; }
  albedo *= 0.55;
  vec3 n = normalize(vNormal);
  float shadow = shadowAt(vWorld + n * 0.2, 0.0012);
  vec3 col = shadeSurface(albedo, n, vWorld, 1.0, rough, shadow);
  // After dark the strip lights everyone from above: neon, porte-cochères, lamp globes.
  float up = 0.55 + 0.45 * n.y;
  col += albedo * vec3(1.0, 0.82, 0.62) * uNight * uLit * up * uInvExposure * 0.9;
  col = applyAtmosphere(col, vWorld);
  outColor = vec4(col, 1.0);
}
`;

const SHIRTS = ['#f2f2ee', '#1c1c1f', '#2a4a7a', '#a8281f', '#3c6e4a', '#d8b26a', '#7a4a8a', '#e8d4b0', '#4a90b8', '#d86a3a', '#8a8f96', '#f0c8c8', '#2e2a26', '#c8b090'];
const PANTS = ['#2a3a5a', '#1e2c48', '#1a1a1c', '#6a5a46', '#c8b898', '#3a3a3e', '#4a5a6a', '#8a7a62', '#f0ece2'];

interface Walker {
  path: number;
  s: number;
  dir: number;
  speed: number;
  ph: number;
  off: number;
  slot: number;
  crowd: number;
}

interface Path {
  pts: number[];
  cum: number[];
  len: number;
}

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Pedestrians: jointed, instanced figures strolling the Riverwalk and the
 * sidewalks, and loitering in small groups outside casino doors.
 */
export class People {
  readonly group = new THREE.Group();
  private geo: THREE.InstancedBufferGeometry;
  private t0: THREE.InstancedBufferAttribute;
  private t1: THREE.InstancedBufferAttribute;
  private paths: Path[] = [];
  private walkers: Walker[] = [];
  /** Standing people: fixed instance slots, revealed by time of day. */
  private standers: { slot: number; crowd: number; rank: number }[] = [];
  private material: THREE.ShaderMaterial;

  constructor(private crowds: Crowd[], private hf: Heightfield) {
    const base = bodyGeometry();
    let total = 0;
    const plan: { crowd: number; kind: 'walk' | 'stand'; path?: number; x?: number; z?: number; yaw?: number }[] = [];
    crowds.forEach((c, ci) => {
      for (const w of c.walks) {
        const pts = w;
        const cum = [0];
        for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
        const len = cum[cum.length - 1];
        if (len < 5) continue;
        const pi = this.paths.length;
        this.paths.push({ pts, cum, len });
        const n = Math.round(len / 9);
        for (let k = 0; k < n; k++) plan.push({ crowd: ci, kind: 'walk', path: pi });
      }
      for (const s of c.spots) {
        for (let k = 0; k < s.n; k++) {
          const a = (k / s.n) * Math.PI * 2 + hash(s.x + k) * 0.8;
          const r = s.r * (0.4 + 0.6 * hash(s.z + k * 3.1));
          const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
          // Face the middle of the group, give or take.
          plan.push({ crowd: ci, kind: 'stand', x, z, yaw: Math.atan2(s.x - x, s.z - z) + (hash(k * 7.7 + s.x) - 0.5) * 0.8 });
        }
      }
    });
    total = plan.length;
    this.geo = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(base.attributes)) this.geo.setAttribute(k, base.attributes[k]);
    this.t0 = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);
    this.t1 = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);
    this.t0.setUsage(THREE.DynamicDrawUsage);
    this.t1.setUsage(THREE.DynamicDrawUsage);
    const c0 = new Float32Array(total * 4);
    const c1 = new Float32Array(total * 4);
    const col = new THREE.Color();
    plan.forEach((p, i) => {
      const h = hash(i * 3.7 + 1.3);
      col.set(SHIRTS[Math.floor(hash(i * 1.9) * SHIRTS.length)]);
      c0.set([col.r, col.g, col.b, Math.floor(hash(i * 5.3) * 5)], i * 4);
      col.set(PANTS[Math.floor(hash(i * 2.3) * PANTS.length)]);
      c1.set([col.r, col.g, col.b, hash(i * 8.1) < 0.12 ? 3 : Math.floor(hash(i * 6.7) * 5)], i * 4);
      const height = 0.9 + h * 0.17;
      if (p.kind === 'walk') {
        const path = this.paths[p.path!];
        this.walkers.push({ path: p.path!, s: hash(i * 9.1) * path.len, dir: hash(i * 4.4) < 0.5 ? 1 : -1, speed: 1.1 + hash(i * 2.9) * 0.5, ph: hash(i) * 6.28, off: (hash(i * 6.1) - 0.5) * 2.4, slot: i, crowd: p.crowd });
        this.t1.setXYZW(i, 0, 1, height, 0);
      } else {
        this.standers.push({ slot: i, crowd: p.crowd, rank: hash(i * 12.7) });
        this.t0.setXYZW(i, p.x!, hf.height(p.x!, p.z!), p.z!, p.yaw!);
        this.t1.setXYZW(i, hash(i) * 6.28, 0, height, hash(i * 3.3));
      }
    });
    this.geo.setAttribute('aT0', this.t0);
    this.geo.setAttribute('aT1', this.t1);
    this.geo.setAttribute('aC0', new THREE.InstancedBufferAttribute(c0, 4));
    this.geo.setAttribute('aC1', new THREE.InstancedBufferAttribute(c1, 4));
    this.geo.instanceCount = total;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: { ...G, uLit: { value: 0.35 } },
    });
    const mesh = new THREE.Mesh(this.geo, this.material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  update(dt: number, cam: THREE.Vector3, night: number) {
    const near = this.crowds.map((c) => Math.hypot(cam.x - c.cx, cam.z - c.cz) < c.radius + 1500);
    this.group.visible = near.some(Boolean);
    if (!this.group.visible) return;
    const share = this.crowds.map((c) => c.day + (c.night - c.day) * night);
    for (const w of this.walkers) {
      const out = !near[w.crowd] || hash(w.slot * 1.37) > share[w.crowd];
      if (out) {
        this.t0.setY(w.slot, -1e4);
        continue;
      }
      const path = this.paths[w.path];
      w.s += w.dir * w.speed * dt;
      if (w.s > path.len) { w.s = path.len; w.dir = -1; }
      else if (w.s < 0) { w.s = 0; w.dir = 1; }
      w.ph += (w.speed / 1.45) * Math.PI * 2 * dt;
      let i = 1;
      while (i < path.cum.length - 1 && path.cum[i] < w.s) i++;
      const t = (w.s - path.cum[i - 1]) / Math.max(1e-3, path.cum[i] - path.cum[i - 1]);
      const ax = path.pts[(i - 1) * 2], az = path.pts[(i - 1) * 2 + 1];
      const bx = path.pts[i * 2], bz = path.pts[i * 2 + 1];
      const dx = (bx - ax) * w.dir, dz = (bz - az) * w.dir;
      const l = Math.hypot(dx, dz) || 1;
      // Keep to the right of the path, like people do.
      const x = ax + (bx - ax) * t + (dz / l) * -(w.off * 0.5 + 0.9);
      const z = az + (bz - az) * t - (dx / l) * -(w.off * 0.5 + 0.9);
      this.t0.setXYZW(w.slot, x, this.hf.height(x, z), z, Math.atan2(dx, dz));
      this.t1.setX(w.slot, w.ph);
    }
    for (const s of this.standers) {
      if (!near[s.crowd] || s.rank > share[s.crowd]) this.t0.setY(s.slot, -1e4);
      else {
        const x = this.t0.getX(s.slot), z = this.t0.getZ(s.slot);
        this.t0.setY(s.slot, this.hf.height(x, z));
        this.t1.setX(s.slot, this.t1.getX(s.slot) + dt);
      }
    }
    this.t0.needsUpdate = true;
    this.t1.needsUpdate = true;
  }
}
