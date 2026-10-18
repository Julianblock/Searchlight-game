import * as THREE from 'three';
import { G } from '../render/globals';
import { FLOCK_SPECIES, flockFragment, flockVertex } from '../render/shaders/flockShader';
import type { Heightfield } from '../world/heightfield';
import { LC } from '../world/meta';

export const SP = { PELICAN: 0, VULTURE: 1, RAVEN: 2, SWIFT: 3, GOOSE: 4, CORMORANT: 5, DOVE: 6, BLACKBIRD: 7 } as const;

/** Wingspan (m) and wingbeat frequency (Hz) per species. */
const INFO = [
  { span: 2.7, hz: 2.2 },
  { span: 1.75, hz: 1.6 },
  { span: 1.25, hz: 3.4 },
  { span: 0.38, hz: 9 },
  { span: 1.6, hz: 3.0 },
  { span: 1.25, hz: 4.2 },
  { span: 0.46, hz: 8 },
  { span: 0.36, hz: 11 },
];

const CAP = 1600;

function birdGeometry() {
  const pos: number[] = [];
  const nrm: number[] = [];
  const span: number[] = [];
  const wing: number[] = [];
  const tri = (a: number[], b: number[], c: number[], s: number[], w: number, n = [0, 1, 0]) => {
    for (const [v, sv] of [
      [a, s[0]],
      [b, s[1]],
      [c, s[2]],
    ] as [number[], number][]) {
      pos.push(v[0], v[1], v[2]);
      nrm.push(n[0], n[1], n[2]);
      span.push(sv);
      wing.push(w);
    }
  };
  // Body: a slim diamond-section spindle with a neck and tail.
  const ring = (z: number, rx: number, ry: number) => [
    [rx, 0, z],
    [0, ry, z],
    [-rx, 0, z],
    [0, -ry * 0.8, z],
  ];
  const rings = [ring(0.42, 0.012, 0.012), ring(0.28, 0.035, 0.035), ring(0.1, 0.07, 0.065), ring(-0.1, 0.06, 0.055), ring(-0.26, 0.03, 0.012)];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < 4; k++) {
      const a = rings[r][k];
      const b = rings[r][(k + 1) % 4];
      const c = rings[r + 1][k];
      const d = rings[r + 1][(k + 1) % 4];
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const l = Math.hypot(mx, my) || 1;
      const n = [mx / l, my / l, 0];
      tri(a, c, b, [0, 0, 0], 0, n);
      tri(b, c, d, [0, 0, 0], 0, n);
    }
  }
  // Tail fan.
  tri([0.05, 0, -0.22], [-0.05, 0, -0.22], [0, 0, -0.36], [0.05, -0.05, 0], 0);
  // Wings: four span segments, tapering chord, slight sweep.
  const N = 5;
  for (const side of [1, -1]) {
    for (let k = 0; k < N; k++) {
      const s0 = 0.06 + (k / N) * 0.94;
      const s1 = 0.06 + ((k + 1) / N) * 0.94;
      const edge = (s: number) => {
        const chord = 0.24 * (1 - Math.pow(s, 1.8) * 0.65);
        const sweep = -s * s * 0.06;
        return { x: side * s * 0.5, le: 0.07 + sweep, te: 0.07 + sweep - chord };
      };
      const e0 = edge(s0);
      const e1 = edge(s1);
      const a = [e0.x, 0, e0.le];
      const b = [e0.x, 0, e0.te];
      const c = [e1.x, 0, e1.le];
      const d = [e1.x, 0, e1.te];
      tri(a, b, c, [side * s0, side * s0, side * s1], 1);
      tri(c, b, d, [side * s1, side * s0, side * s1], 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  return g;
}

type Kind = 'vee' | 'swirl' | 'kettle';

interface Flock {
  kind: Kind;
  species: number;
  n: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  t: number;
  seed: number;
  radius: number;
  /** Height kept above the ground (m) for low flyers following the terrain. */
  clear: number;
}

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/**
 * Birds passing through Searchlight: white pelicans riding thermals along the
 * Colorado River flyway, vulture kettles, raven pairs, swifts at the cliffs,
 * winter Canada geese, cormorants over Lake Mohave, doves and a winter
 * blackbird murmuration over town.
 */
export class Flocks {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private aP: Float32Array;
  private aO: Float32Array;
  private aF: Float32Array;
  private flocks: Flock[] = [];
  private month = 1;
  private prev = new Map<number, [number, number, number]>();

  constructor(private hf: Heightfield) {
    const c = (h: string) => new THREE.Color(h);
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: flockVertex,
      fragmentShader: flockFragment,
      side: THREE.DoubleSide,
      uniforms: {
        ...G,
        // Pelican (black flight feathers), vulture (silvery), raven, swift, Canada goose,
        // cormorant, mourning dove, Brewer's blackbird.
        uBody: { value: [c('#ecebe4'), c('#1c1612'), c('#0e0e10'), c('#2a2622'), c('#5a5048'), c('#141210'), c('#9a8a7a'), c('#141414')] },
        uWingC: { value: [c('#f0efe8'), c('#231c17'), c('#111114'), c('#2e2a26'), c('#6a5e54'), c('#1a1816'), c('#8e8478'), c('#161616')] },
        uTip: { value: [c('#16140f'), c('#6b6862'), c('#111114'), c('#2e2a26'), c('#2a2420'), c('#1a1816'), c('#4a4440'), c('#161616')] },
        uTipStart: { value: [0.45, 0.55, 2.0, 2.0, 0.7, 2.0, 0.8, 2.0] },
      },
    });
    if (FLOCK_SPECIES !== INFO.length) throw new Error('species mismatch');
    const base = birdGeometry();
    const g = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    this.aP = new Float32Array(CAP * 4);
    this.aO = new Float32Array(CAP * 4);
    this.aF = new Float32Array(CAP * 2);
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(this.aP, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aO', new THREE.InstancedBufferAttribute(this.aO, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aF', new THREE.InstancedBufferAttribute(this.aF, 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
  }

  setMonth(m: number) {
    if (Math.round(m) === Math.round(this.month)) return;
    this.month = m;
    this.flocks.length = 0;
  }

  /** Desired flock mix for the season and light. */
  private wanted(day: boolean): { kind: Kind; species: number; count: number }[] {
    const m = ((Math.round(this.month) - 1 + 12) % 12) + 1;
    const winter = m >= 11 || m <= 2;
    const migration = (m >= 3 && m <= 5) || (m >= 9 && m <= 11);
    const summer = m >= 5 && m <= 9;
    const out: { kind: Kind; species: number; count: number }[] = [];
    if (winter) out.push({ kind: 'vee', species: SP.GOOSE, count: 2 });
    if (migration) out.push({ kind: 'vee', species: SP.PELICAN, count: 1 });
    out.push({ kind: 'vee', species: SP.CORMORANT, count: 2 });
    if (day) {
      if (migration) out.push({ kind: 'kettle', species: SP.PELICAN, count: 1 });
      out.push({ kind: 'kettle', species: SP.VULTURE, count: winter ? 0 : migration ? 3 : 2 });
      out.push({ kind: 'kettle', species: SP.RAVEN, count: 2 });
      if (m >= 3 && m <= 10) out.push({ kind: 'swirl', species: SP.SWIFT, count: summer ? 2 : 1 });
      out.push({ kind: 'vee', species: SP.DOVE, count: 2 });
      if (winter || m === 3 || m === 10) out.push({ kind: 'swirl', species: SP.BLACKBIRD, count: 1 });
    }
    return out;
  }

  private spawn(kind: Kind, species: number, cam: THREE.Vector3): Flock | null {
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = species === SP.SWIFT || species === SP.DOVE ? rnd(200, 1400) : rnd(600, 3200);
      const x = cam.x + Math.cos(a) * r;
      const z = cam.z + Math.sin(a) * r;
      const ground = this.hf.height(x, z);
      const lc = this.hf.landcover(x, z);
      // Cormorants commute low over Lake Mohave; blackbirds gather over town;
      // swifts scream along the cliffs.
      if (species === SP.CORMORANT && x < 17000) continue;
      if (species === SP.BLACKBIRD && (lc < LC.URBAN_OPEN || lc > LC.URBAN_HIGH)) continue;
      if (species === SP.SWIFT && lc !== LC.ROCK && Math.random() < 0.8) continue;
      const f: Flock = {
        kind,
        species,
        n: 0,
        x,
        y: 0,
        z,
        heading: Math.random() * Math.PI * 2,
        speed: 0,
        t: Math.random() * 100,
        seed: Math.random() * 1000,
        radius: 0,
        clear: 0,
      };
      if (kind === 'vee') {
        if (species === SP.GOOSE) (f.n = Math.floor(rnd(14, 45))), (f.clear = rnd(150, 450)), (f.speed = rnd(15, 19));
        else if (species === SP.PELICAN) (f.n = Math.floor(rnd(12, 40))), (f.clear = rnd(200, 600)), (f.speed = rnd(11, 14));
        else if (species === SP.CORMORANT) (f.n = Math.floor(rnd(4, 14))), (f.clear = rnd(6, 25)), (f.speed = rnd(13, 16));
        else (f.n = Math.floor(rnd(3, 10))), (f.clear = rnd(8, 30)), (f.speed = rnd(14, 18));
        // Pelicans and geese follow the river, roughly north-south.
        if (species === SP.GOOSE || species === SP.PELICAN) f.heading = (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.4, 0.4);
        f.y = ground + f.clear;
      } else if (kind === 'swirl') {
        if (species === SP.SWIFT) (f.n = Math.floor(rnd(12, 30))), (f.radius = rnd(25, 60)), (f.speed = 16), (f.y = ground + rnd(20, 70));
        else (f.n = Math.floor(rnd(200, 420))), (f.radius = rnd(35, 60)), (f.speed = 12), (f.y = ground + rnd(25, 60));
      } else if (species === SP.PELICAN) {
        // A wheeling white cloud of pelicans, flashing as they turn.
        (f.n = Math.floor(rnd(25, 70))), (f.y = ground + rnd(250, 600)), (f.radius = rnd(70, 130)), (f.speed = 12);
      } else if (species === SP.RAVEN) {
        (f.n = Math.floor(rnd(2, 4))), (f.y = ground + rnd(40, 160)), (f.radius = rnd(20, 45)), (f.speed = 10);
      } else {
        (f.n = Math.floor(rnd(5, 16))), (f.y = ground + rnd(150, 350)), (f.radius = rnd(35, 70)), (f.speed = 11);
      }
      return f;
    }
    return null;
  }

  update(dt: number, cam: THREE.Vector3, wind: { x: number; z: number }) {
    dt = Math.min(dt, 0.1);
    const day = G.uSunDir.value.y > 0.04;
    // Retire far or out-of-season flocks, then top up.
    const want = this.wanted(day);
    this.flocks = this.flocks.filter((f) => {
      const d = Math.hypot(f.x - cam.x, f.z - cam.z);
      const ok = want.some((w) => w.kind === f.kind && w.species === f.species && w.count > 0);
      return ok && d < 4500;
    });
    for (const w of want) {
      const have = this.flocks.filter((f) => f.kind === w.kind && f.species === w.species).length;
      if (have < w.count) {
        const f = this.spawn(w.kind, w.species, cam);
        if (f) this.flocks.push(f);
      }
    }

    let i = 0;
    const write = (x: number, y: number, z: number, yaw: number, pitch: number, bank: number, sp: number, flapPhase: number, flapAmt: number, scale: number) => {
      if (i >= CAP) return;
      this.aP.set([x, y, z, scale], i * 4);
      this.aO.set([yaw, pitch, bank, sp], i * 4);
      this.aF.set([flapPhase, flapAmt], i * 2);
      i++;
    };

    for (const f of this.flocks) {
      f.t += dt;
      const info = INFO[f.species];
      if (f.kind === 'vee') {
        // Leader flies a gently meandering course; followers hold V slots.
        f.heading += Math.sin(f.t * 0.05 + f.seed) * 0.02 * dt;
        f.x += Math.sin(f.heading) * f.speed * dt + wind.x * dt;
        f.z += Math.cos(f.heading) * f.speed * dt + wind.z * dt;
        // Climb over ridges ahead rather than through them.
        const ahead = Math.max(this.hf.height(f.x, f.z), this.hf.height(f.x + Math.sin(f.heading) * 150, f.z + Math.cos(f.heading) * 150));
        const floor = ahead + f.clear;
        f.y += (floor - f.y) * Math.min(1, dt * (f.y < floor ? 0.8 : 0.1));
        const fx = Math.sin(f.heading);
        const fz = Math.cos(f.heading);
        const spacing = info.span * 1.25;
        for (let k = 0; k < f.n; k++) {
          const rank = Math.ceil(k / 2);
          const side = k % 2 === 0 ? 1 : -1;
          // Uneven arms and a little station-keeping wobble, like real skeins.
          const armBias = side > 0 ? 1 : 0.8 + 0.2 * Math.sin(f.seed);
          const back = rank * spacing * 0.9 * armBias + Math.sin(f.t * 0.7 + k * 1.3) * 0.6;
          const lat = rank * spacing * 0.65 * side + Math.sin(f.t * 0.5 + k) * 0.4;
          const x = f.x - fx * back - fz * lat;
          const z = f.z - fz * back + fx * lat;
          const y = f.y + Math.sin(f.t * 0.4 + k * 0.7) * 1.2 - rank * 0.15;
          const phase = f.t * info.hz * Math.PI * 2 + k * 0.9;
          write(x, y, z, f.heading, 0, Math.sin(f.t * 0.3 + k) * 0.05, f.species, phase, 0.85, info.span);
        }
      } else if (f.kind === 'kettle') {
        // Vultures circle a drifting thermal, climbing, then peel off and reset.
        f.x += wind.x * dt * 0.8;
        f.z += wind.z * dt * 0.8;
        f.y += (f.species === SP.RAVEN ? 0.2 : 0.9) * dt;
        if (f.y - this.hf.height(f.x, f.z) > 1100) f.y -= 800;
        if (f.species === SP.RAVEN && f.y - this.hf.height(f.x, f.z) > 260) f.y -= 150;
        for (let k = 0; k < f.n; k++) {
          const r = f.radius * (0.6 + 0.5 * Math.sin(k * 2.1 + f.seed));
          const w = f.speed / r;
          const dir = k % 5 === 0 ? -1 : 1;
          const a = f.t * w * dir + k * 2.4;
          const x = f.x + Math.cos(a) * r;
          const z = f.z + Math.sin(a) * r;
          const stack = f.species === SP.PELICAN ? 4 : f.species === SP.RAVEN ? 6 : 9;
          const y = f.y + k * stack - f.n * stack * 0.45 + Math.sin(f.t * 0.2 + k) * 4;
          const yaw = dir > 0 ? Math.atan2(-Math.sin(a), Math.cos(a)) : Math.atan2(Math.sin(a), -Math.cos(a));
          // Teetering glide: vultures rock side to side on a V dihedral; pelicans
          // soar flat and steady; ravens tumble and flap in bursts.
          const teeter = Math.sin(f.t * 1.3 + k * 1.7) * (f.species === SP.VULTURE ? 0.12 : 0.04);
          const roll = f.species === SP.RAVEN ? Math.PI * 2 * Math.max(0, (Math.sin(f.t * 0.37 + k * 4.1) - 0.92) / 0.08) : 0;
          const flap = f.species === SP.RAVEN ? Math.max(0, Math.sin(f.t * 0.6 + k * 2)) * 0.8 : 0;
          write(x, y, z, yaw, -0.03, 0.38 * dir + teeter + roll, f.species, f.t * info.hz * Math.PI * 2, flap, info.span);
        }
      } else {
        // Murmuration / rising goose cloud: birds orbit a breathing, drifting centre.
        f.x += Math.sin(f.t * 0.11 + f.seed) * 4 * dt + wind.x * dt * 0.5;
        f.z += Math.cos(f.t * 0.09 + f.seed) * 4 * dt + wind.z * dt * 0.5;
        const breathe = 0.75 + 0.25 * Math.sin(f.t * 0.35);
        for (let k = 0; k < f.n; k++) {
          const u = (k * 0.618034 + f.seed) % 1;
          const v = (k * 0.414214) % 1;
          const a = f.t * (f.speed / f.radius) * (0.8 + 0.4 * v) + u * Math.PI * 2;
          const r = f.radius * breathe * (0.35 + 0.65 * Math.sqrt(v));
          const tilt = Math.sin(f.t * 0.23 + u * 6) * 0.5;
          const x = f.x + Math.cos(a) * r + Math.sin(f.t * 0.7 + k) * 6;
          const z = f.z + Math.sin(a) * r * (0.6 + 0.4 * Math.cos(f.t * 0.2));
          const y = f.y + Math.sin(a) * r * tilt + Math.sin(f.t * 0.5 + v * 9) * 8;
          const key = f.seed * 10000 + k;
          const p = this.prev.get(key);
          let yaw = 0;
          let pitch = 0;
          if (p) {
            const dx = x - p[0];
            const dy = y - p[1];
            const dz = z - p[2];
            yaw = Math.atan2(dx, dz);
            pitch = Math.atan2(dy, Math.hypot(dx, dz) + 1e-4);
          }
          this.prev.set(key, [x, y, z]);
          const phase = f.t * info.hz * Math.PI * 2 + k * 2.3;
          write(x, y, z, yaw, pitch, Math.sin(a) * 0.4, f.species, phase, 0.9, info.span);
        }
      }
    }
    if (this.prev.size > 6000) this.prev.clear();
    this.geo.instanceCount = i;
    for (const k of ['aP', 'aO', 'aF']) (this.geo.attributes[k] as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  get count() {
    return this.geo.instanceCount;
  }

  /** Distance from p to the nearest flock centre of a species (Infinity if none). */
  nearest(p: THREE.Vector3, species: number) {
    let best = Infinity;
    for (const f of this.flocks) {
      if (f.species !== species) continue;
      best = Math.min(best, Math.hypot(f.x - p.x, f.y - p.y, f.z - p.z) - f.radius);
    }
    return Math.max(0, best);
  }
}
