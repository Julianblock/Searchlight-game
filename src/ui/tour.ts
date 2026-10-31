import type { Egg } from '../world/lore';

/** Seconds at each stop: long enough to read the card while the camera circles. */
const BASE_HOLD = 9;

/**
 * Learn-mode tour: steps through every easter egg, telling its story while
 * the camera circles the spot. Arrow keys or the buttons skip, Esc leaves.
 */
export class Tour {
  readonly root = document.createElement('div');
  index = -1;
  /** Seconds spent at the current stop. */
  t = 0;
  paused = false;
  onStop?: (egg: Egg, index: number) => void;
  onExit?: () => void;

  constructor(readonly eggs: Egg[]) {
    this.root.className = 'tour hide';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  get active() {
    return this.index >= 0;
  }

  get egg(): Egg | null {
    return this.active ? this.eggs[this.index] : null;
  }

  private get hold() {
    return BASE_HOLD + (this.egg?.text.length ?? 0) * 0.04;
  }

  start(from = 0) {
    this.paused = false;
    this.go(from);
  }

  stop() {
    if (!this.active) return;
    this.index = -1;
    this.root.classList.add('hide');
    this.onExit?.();
  }

  go(i: number) {
    this.index = (i + this.eggs.length) % this.eggs.length;
    this.t = 0;
    const e = this.eggs[this.index];
    this.root.className = `tour ${e.kind}`;
    this.root.innerHTML = `
      <div class="k">Learn tour · ${this.index + 1} of ${this.eggs.length} · ${e.kicker}</div>
      <div class="t">${e.title}</div>
      <div class="x">${e.text}</div>
      <div class="how">To find it yourself: ${e.hint}</div>
      <div class="row">
        <button data-a="prev" title="Previous (←)">‹ Prev</button>
        <button data-a="pause" title="Pause (Space)">${this.paused ? 'Play' : 'Pause'}</button>
        <div class="bar"><i></i></div>
        <button data-a="next" title="Next (→)">Next ›</button>
        <button data-a="exit" title="Leave the tour (Esc)">Exit</button>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'prev') this.go(this.index - 1);
        else if (a === 'next') this.go(this.index + 1);
        else if (a === 'pause') this.togglePause();
        else this.stop();
      };
    });
    this.onStop?.(e, this.index);
  }

  togglePause() {
    this.paused = !this.paused;
    const b = this.root.querySelector<HTMLButtonElement>('[data-a="pause"]');
    if (b) b.textContent = this.paused ? 'Play' : 'Pause';
  }

  update(dt: number) {
    if (!this.active) return;
    if (!this.paused) this.t += dt;
    const bar = this.root.querySelector<HTMLElement>('.bar i');
    if (bar) bar.style.width = `${Math.min(100, (this.t / this.hold) * 100)}%`;
    if (this.t > this.hold) {
      if (this.index === this.eggs.length - 1) this.stop();
      else this.go(this.index + 1);
    }
  }

  /** Returns true when the key was a tour control. */
  key(code: string) {
    if (!this.active) return false;
    if (code === 'ArrowRight') this.go(this.index + 1);
    else if (code === 'ArrowLeft') this.go(this.index - 1);
    else if (code === 'Space') this.togglePause();
    else if (code === 'Escape') this.stop();
    else return false;
    return true;
  }
}
