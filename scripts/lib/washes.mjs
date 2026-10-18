/**
 * Finds desert washes from the terrain: fills pits (priority flood), routes
 * every cell downhill to its steepest neighbour (D8) and accumulates the
 * upstream area. Returns the contributing area in m² per cell.
 */
export function flowAccumulation(h, N, cell) {
  const filled = Float32Array.from(h);
  const done = new Uint8Array(N * N);
  // Binary min-heap of cell indices keyed on filled height.
  const heap = new Int32Array(N * N);
  let size = 0;
  const less = (a, b) => filled[heap[a]] < filled[heap[b]];
  const push = (p) => {
    let i = size++;
    heap[i] = p;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!less(i, up)) break;
      [heap[i], heap[up]] = [heap[up], heap[i]];
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < size && less(l, m)) m = l;
      if (r < size && less(r, m)) m = r;
      if (m === i) break;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
    return top;
  };
  for (let i = 0; i < N; i++) {
    for (const p of [i, (N - 1) * N + i, i * N, i * N + N - 1]) {
      if (!done[p]) {
        done[p] = 1;
        push(p);
      }
    }
  }
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
  // A tiny epsilon keeps filled flats draining instead of pooling.
  while (size) {
    const p = pop();
    const x = p % N;
    const z = (p / N) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k];
      const nz = z + DZ[k];
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const q = nz * N + nx;
      if (done[q]) continue;
      done[q] = 1;
      filled[q] = Math.max(filled[q], filled[p] + 1e-3);
      push(q);
    }
  }

  const down = new Int32Array(N * N).fill(-1);
  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const p = z * N + x;
      let best = 0;
      for (let k = 0; k < 8; k++) {
        const q = (z + DZ[k]) * N + x + DX[k];
        const drop = (filled[p] - filled[q]) / (k < 4 ? 1 : Math.SQRT2);
        if (drop > best) {
          best = drop;
          down[p] = q;
        }
      }
    }
  }
  // Accumulate from the highest cells down.
  const order = Array.from({ length: N * N }, (_, i) => i).sort((a, b) => filled[b] - filled[a]);
  const acc = new Float32Array(N * N).fill(cell * cell);
  for (const p of order) if (down[p] >= 0) acc[down[p]] += acc[p];
  return acc;
}
