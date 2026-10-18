import type { HeightGrid, Pixels, WorldData } from './loader';
import { LC } from './meta';

function bilinear(g: HeightGrid, arr: Float32Array, x: number, z: number): number {
  const fx = ((x - g.cx) / g.size + 0.5) * g.res - 0.5;
  const fz = ((z - g.cz) / g.size + 0.5) * g.res - 0.5;
  const x0 = Math.max(0, Math.min(g.res - 2, Math.floor(fx)));
  const z0 = Math.max(0, Math.min(g.res - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - x0));
  const tz = Math.min(1, Math.max(0, fz - z0));
  const i = z0 * g.res + x0;
  const a = arr[i] + (arr[i + 1] - arr[i]) * tx;
  const b = arr[i + g.res] + (arr[i + g.res + 1] - arr[i + g.res]) * tx;
  return a + (b - a) * tz;
}

/** Weight of a region at (x,z): 1 well inside, fading to 0 across its outer margin. */
export function regionWeight(size: number, x: number, z: number, margin = 0.06, cx = 0, cz = 0): number {
  const e = Math.max(Math.abs(x - cx), Math.abs(z - cz)) / (size / 2);
  const t = (1 - e) / margin;
  return Math.min(1, Math.max(0, t));
}

/** CPU-side terrain queries that mirror the GPU terrain shader exactly. */
export class Heightfield {
  readonly inner: HeightGrid;
  readonly mid: HeightGrid;
  readonly far: HeightGrid;
  readonly laughlin: HeightGrid;
  private readonly lc: Pixels;
  private readonly lcSize: number;
  private readonly canopy: Pixels;
  /** Bridge decks the car and traffic drive over: ends, half width, deck heights at each end. */
  private readonly decks: { ax: number; az: number; bx: number; bz: number; half: number; ya: number; yb: number }[] = [];

  constructor(world: WorldData) {
    this.inner = world.heights.inner;
    this.mid = world.heights.mid;
    this.far = world.heights.far;
    this.laughlin = world.heights.laughlin;
    this.lc = world.landcover;
    this.lcSize = world.meta.landcover.size;
    this.canopy = world.canopy;
  }

  height(x: number, z: number): number {
    const wi = regionWeight(this.inner.size, x, z);
    const wm = regionWeight(this.mid.size, x, z);
    let h = bilinear(this.far, this.far.heights, x, z);
    if (wm > 0) h += (bilinear(this.mid, this.mid.heights, x, z) - h) * wm;
    const wl = this.lauWeight(x, z);
    if (wl > 0) h += (bilinear(this.laughlin, this.laughlin.heights, x, z) - h) * wl;
    if (wi > 0) h += (bilinear(this.inner, this.inner.heights, x, z) - h) * wi;
    return h;
  }

  /** Adds a bridge deck from a to b, `half` metres either side, rising from ya to yb. */
  addDeck(ax: number, az: number, bx: number, bz: number, half: number, ya: number, yb: number) {
    this.decks.push({ ax, az, bx, bz, half, ya, yb });
  }

  /** What wheels rest on: the ground, or a bridge deck above it. */
  surface(x: number, z: number): number {
    let h = this.height(x, z);
    for (const d of this.decks) {
      const dx = d.bx - d.ax;
      const dz = d.bz - d.az;
      const l2 = dx * dx + dz * dz;
      const t = ((x - d.ax) * dx + (z - d.az) * dz) / l2;
      if (t < 0 || t > 1) continue;
      if (Math.abs((x - d.ax) * dz - (z - d.az) * dx) / Math.sqrt(l2) > d.half) continue;
      h = Math.max(h, d.ya + (d.yb - d.ya) * t + Math.sin(t * Math.PI) * 1.2);
    }
    return h;
  }

  ao(x: number, z: number): number {
    const wi = regionWeight(this.inner.size, x, z);
    const wm = regionWeight(this.mid.size, x, z);
    let a = 1;
    if (wm > 0) a += (bilinear(this.mid, this.mid.ao, x, z) - a) * wm;
    const wl = this.lauWeight(x, z);
    if (wl > 0) a += (bilinear(this.laughlin, this.laughlin.ao, x, z) - a) * wl;
    if (wi > 0) a += (bilinear(this.inner, this.inner.ao, x, z) - a) * wi;
    return a;
  }

  lauWeight(x: number, z: number): number {
    const g = this.laughlin;
    return regionWeight(g.size, x, z, 0.06, g.cx, g.cz);
  }

  normal(x: number, z: number, out: { x: number; y: number; z: number }, e = 4) {
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / l;
    out.y = (2 * e) / l;
    out.z = -hz / l;
    return out;
  }

  landcover(x: number, z: number): number {
    const r = this.lc.width;
    const i = Math.floor((x / this.lcSize + 0.5) * r);
    const j = Math.floor((z / this.lcSize + 0.5) * r);
    if (i < 0 || j < 0 || i >= r || j >= r) return LC.OTHER;
    return this.lc.data[(j * r + i) * 4];
  }

  /** 0..1 fraction of desert plant cover detected in the aerial photo. */
  canopyDensity(x: number, z: number): number {
    const r = this.canopy.width;
    const s = this.inner.size;
    const i = Math.floor((x / s + 0.5) * r);
    const j = Math.floor((z / s + 0.5) * r);
    if (i < 0 || j < 0 || i >= r || j >= r) return 0;
    return this.canopy.data[(j * r + i) * 4] / 255;
  }
}
