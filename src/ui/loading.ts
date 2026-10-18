const SILHOUETTE = `<svg class="silhouette" viewBox="0 0 120 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M60 18c-3-1-5-3-6-6-6-1-14-2-22-6-6-3-12-5-20-6 4 3 7 4 9 6-3 0-6 1-9 1 5 2 10 3 14 4 6 2 13 5 20 7l2 6 4-3 2 3 3-5c7-2 14-5 20-7 4-1 9-2 14-4-3 0-6-1-9-1 2-2 5-3 9-6-8 1-14 3-20 6-8 4-16 5-22 6-1 3-3 5-6 6z" fill="#ffb27a" opacity=".92"/>
<path d="M96 64V46m0 0c0-4-4-6-4-10m4 10c1-5 6-6 6-11m-6 1c0-3 1-4 1-6m-5 2 -3-3m3 3 1-4m8-2 3-3m-3 3 -1-4m-4 0 2-3m-2 3-2-3" stroke="#ffb27a" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
</svg>`;

/** Title card shown while terrain, imagery and land cover stream in. */
export class LoadingScreen {
  readonly root = document.createElement('div');
  private bar: HTMLElement;
  private status: HTMLElement;

  constructor() {
    this.root.className = 'loading';
    this.root.innerHTML = `<div class="inner">${SILHOUETTE}
      <div class="eyebrow">Searchlight · Nevada · Elev. 3,540 ft</div>
      <div class="title">Wings over the <em>Mojave</em></div>
      <p class="lede">An old gold camp on US-95, standing in a forest of Joshua trees between the Highland Range and the deep blue of Lake Mohave. Fill up at Terrible's, grab a Grand Slam, and take to the desert air.</p>
      <div class="bar"><i></i></div><div class="status">Preparing</div></div>`;
    this.bar = this.root.querySelector('.bar i')!;
    this.status = this.root.querySelector('.status')!;
  }

  progress(label: string, f: number) {
    this.bar.style.width = `${Math.round(f * 100)}%`;
    this.status.textContent = label;
  }

  done() {
    this.progress('Ready', 1);
    this.root.classList.add('done');
    setTimeout(() => this.root.remove(), 1600);
  }
}
