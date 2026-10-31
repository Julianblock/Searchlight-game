import type { Egg } from '../world/lore';

export interface MapSource {
  height: (x: number, z: number) => number;
  /** 0..1 open water at a point. */
  water: (x: number, z: number) => number;
  /** Polylines [x0, z0, x1, z1, …] of the main roads. */
  roads: number[][];
}

const RES = 360;

/**
 * Learn-mode map: shaded relief of the whole region with a pin for every
 * easter egg, found ones lit, and a card telling you where and how to find it.
 */
export class EggMap {
  readonly root = document.createElement('div');
  private canvas = document.createElement('canvas');
  private pins = document.createElement('div');
  private card = document.createElement('div');
  private list = document.createElement('div');
  private x0: number;
  private z0: number;
  private span: number;
  private selected = -1;
  onGo?: (egg: Egg) => void;
  onTour?: (from: number) => void;
  onClose?: () => void;

  constructor(
    readonly eggs: Egg[],
    private src: MapSource,
    private found: (id: string) => boolean,
  ) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const e of eggs) {
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x);
      minZ = Math.min(minZ, e.z);
      maxZ = Math.max(maxZ, e.z);
    }
    this.span = Math.max(maxX - minX, maxZ - minZ) + 6000;
    this.x0 = (minX + maxX) / 2 - this.span / 2;
    this.z0 = (minZ + maxZ) / 2 - this.span / 2;

    this.root.className = 'eggmap hide';
    this.root.innerHTML = `
      <div class="eggmap-panel">
        <div class="eggmap-head">
          <div><div class="k">Learn mode</div><div class="t">Easter eggs of the Mojave</div></div>
          <div class="eggmap-count"></div>
          <button class="eggmap-tour">Start the tour</button>
          <button class="eggmap-x" title="Close (J)">×</button>
        </div>
        <div class="eggmap-body"><div class="eggmap-map"></div><div class="eggmap-side"><div class="eggmap-card"></div><div class="eggmap-list"></div></div></div>
      </div>`;
    const mapEl = this.root.querySelector('.eggmap-map')!;
    this.canvas.width = this.canvas.height = RES;
    mapEl.append(this.canvas, this.pins);
    this.pins.className = 'eggmap-pins';
    this.card = this.root.querySelector('.eggmap-card')!;
    this.list = this.root.querySelector('.eggmap-list')!;
    this.root.querySelector<HTMLButtonElement>('.eggmap-x')!.onclick = () => this.onClose?.();
    this.root.querySelector<HTMLButtonElement>('.eggmap-tour')!.onclick = () => this.onTour?.(Math.max(0, this.selected));
    this.root.addEventListener('pointerdown', (e) => e.target === this.root && this.onClose?.());
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    this.drawRelief();
    const at = this.spread();
    this.eggs.forEach((e, i) => {
      const b = document.createElement('button');
      b.className = `pin ${e.kind}`;
      b.textContent = String(i + 1);
      b.title = e.title;
      b.style.left = `${at[i][0] * 100}%`;
      b.style.top = `${at[i][1] * 100}%`;
      b.onclick = () => this.select(i);
      this.pins.append(b);
      const li = document.createElement('button');
      li.className = `chip ${e.kind}`;
      li.innerHTML = `<b>${i + 1}</b>${e.title}`;
      li.onclick = () => this.select(i);
      this.list.append(li);
    });
  }

  /** Map positions (0..1) nudged apart so clustered pins stay clickable. */
  private spread() {
    const p = this.eggs.map((e) => [(e.x - this.x0) / this.span, (e.z - this.z0) / this.span]);
    const home = p.map((q) => [...q]);
    const gap = 0.045;
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) {
          let dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1];
          let d = Math.hypot(dx, dy);
          if (d >= gap) continue;
          if (d < 1e-6) (dx = Math.cos(i + j)), (dy = Math.sin(i + j)), (d = 1);
          const push = ((gap - d) / 2) * 0.6;
          p[i][0] -= (dx / d) * push;
          p[i][1] -= (dy / d) * push;
          p[j][0] += (dx / d) * push;
          p[j][1] += (dy / d) * push;
        }
      }
      for (let i = 0; i < p.length; i++) {
        p[i][0] += (home[i][0] - p[i][0]) * 0.02;
        p[i][1] += (home[i][1] - p[i][1]) * 0.02;
      }
    }
    return p.map(([x, y]) => [Math.min(0.97, Math.max(0.03, x)), Math.min(0.97, Math.max(0.03, y))]);
  }

  get open() {
    return !this.root.classList.contains('hide');
  }

  show(on: boolean) {
    this.root.classList.toggle('hide', !on);
    if (on) this.refresh();
  }

  private refresh() {
    let n = 0;
    this.eggs.forEach((e, i) => {
      const got = this.found(e.id);
      if (got) n++;
      this.pins.children[i].classList.toggle('got', got);
      this.list.children[i].classList.toggle('got', got);
    });
    this.root.querySelector('.eggmap-count')!.textContent = `${n} of ${this.eggs.length} found`;
    this.select(this.selected < 0 ? 0 : this.selected);
  }

  private select(i: number) {
    this.selected = i;
    [...this.pins.children].forEach((p, j) => p.classList.toggle('sel', j === i));
    [...this.list.children].forEach((p, j) => p.classList.toggle('sel', j === i));
    const e = this.eggs[i];
    const got = this.found(e.id);
    this.card.className = `eggmap-card ${e.kind}`;
    this.card.innerHTML = `
      <div class="k">${i + 1} · ${e.kicker}</div>
      <div class="t">${e.title}</div>
      <div class="how"><span>${got ? 'Found' : 'How to find it'}</span>${e.hint}</div>
      <div class="x">${e.text}</div>
      <div class="row"><button class="go">Fly here</button><button class="from">Tour from here</button></div>`;
    this.card.querySelector<HTMLButtonElement>('.go')!.onclick = () => this.onGo?.(e);
    this.card.querySelector<HTMLButtonElement>('.from')!.onclick = () => this.onTour?.(i);
  }

  private drawRelief() {
    const { height, water, roads } = this.src;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(RES, RES);
    const step = this.span / RES;
    const h = new Float32Array(RES * RES);
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) h[j * RES + i] = height(this.x0 + (i + 0.5) * step, this.z0 + (j + 0.5) * step);
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const k = j * RES + i;
        const dx = (h[j * RES + Math.min(RES - 1, i + 1)] - h[j * RES + Math.max(0, i - 1)]) / (2 * step);
        const dz = (h[Math.min(RES - 1, j + 1) * RES + i] - h[Math.max(0, j - 1) * RES + i]) / (2 * step);
        // Light from the northwest, as on a paper relief map.
        const shade = Math.max(0, Math.min(1, 0.62 + (-dx * 0.7 - dz * 0.7) * 2.2));
        const t = Math.max(0, Math.min(1, (h[k] - 150) / 1600));
        let r = 196 - t * 60, g = 172 - t * 66, b = 128 - t * 58;
        const w = water(this.x0 + (i + 0.5) * step, this.z0 + (j + 0.5) * step);
        r = r * shade * (1 - w) + 46 * w;
        g = g * shade * (1 - w) + 92 * w;
        b = b * shade * (1 - w) + 120 * w;
        img.data.set([r, g, b, 255], k * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(70, 40, 25, 0.55)';
    ctx.lineWidth = 1;
    for (const p of roads) {
      ctx.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const u = ((p[i] - this.x0) / this.span) * RES, v = ((p[i + 1] - this.z0) / this.span) * RES;
        if (i) ctx.lineTo(u, v);
        else ctx.moveTo(u, v);
      }
      ctx.stroke();
    }
  }
}
