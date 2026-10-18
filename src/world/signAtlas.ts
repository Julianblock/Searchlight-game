import * as THREE from 'three';
import { BLACK, dotMatrix, fitText, neon, rounded, SANS, SCRIPT, SERIF, type SignSpec } from './signKit';

/** Atlas rectangle in UV space plus the number of stacked animation frames. */
export interface SignRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  frames: number;
  /** Width / height of one frame. */
  aspect: number;
}

const SIZE = 2048;

/** Terrible's script wordmark, red on the chain's sunny yellow. */
function terriblesMark(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = `italic 900 ${h * 0.62}px ${BLACK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const m = g.measureText("Terrible's").width;
  if (m > w * 0.9) g.scale((w * 0.9) / m, 1);
  g.lineJoin = 'round';
  g.lineWidth = h * 0.12;
  g.strokeStyle = '#fff8e0';
  g.strokeText("Terrible's", 0, 0);
  g.fillStyle = '#d0141c';
  g.fillText("Terrible's", 0, 0);
  g.restore();
}

const SIGNS: SignSpec[] = [
  {
    name: 'terribles',
    w: 640,
    h: 300,
    draw(g, w, h) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#ffd23a');
      grd.addColorStop(1, '#ffb000');
      g.fillStyle = '#b30f16';
      rounded(g, 0, 0, w, h, 40);
      g.fill();
      g.fillStyle = grd;
      rounded(g, 14, 14, w - 28, h - 28, 30);
      g.fill();
      terriblesMark(g, 20, 20, w - 40, h * 0.68);
      g.fillStyle = '#b30f16';
      fitText(g, 'ROADHOUSE  ·  CASINO', w / 2, h * 0.8, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.15);
    },
  },
  {
    name: 'terriblesLED',
    w: 640,
    h: 200,
    frames: 4,
    draw(g, w, h, f) {
      const msgs = [
        ['LOOSEST SLOTS', 'ON HIGHWAY 95'],
        ["DENNY'S", 'OPEN 24 HOURS'],
        ['WELCOME TO', 'SEARCHLIGHT'],
        ['VIDEO POKER', 'KENO · BAR'],
      ];
      dotMatrix(g, w, h, msgs[f], f === 1 ? '#ffd040' : '#ff8a1c');
    },
  },
  {
    name: 'casino',
    w: 512,
    h: 128,
    draw(g, w, h) {
      g.fillStyle = '#2a0c0c';
      g.fillRect(0, 0, w, h);
      neon(g, 'CASINO', w / 2, h / 2, w * 0.9, (p) => `900 ${p}px ${BLACK}`, h * 0.72, '#ff3b2a');
      // Chaser bulb border.
      g.fillStyle = '#ffe9a8';
      for (let x = 10; x < w; x += 22) {
        g.beginPath(); g.arc(x, 8, 5, 0, 7); g.fill();
        g.beginPath(); g.arc(x, h - 8, 5, 0, 7); g.fill();
      }
    },
  },
  {
    name: 'dennys',
    w: 512,
    h: 240,
    draw(g, w, h) {
      g.fillStyle = '#ffd200';
      rounded(g, 0, 0, w, h, h * 0.22);
      g.fill();
      g.fillStyle = '#e3001b';
      rounded(g, 12, 12, w - 24, h * 0.66, h * 0.16);
      g.fill();
      g.save();
      g.fillStyle = '#ffd200';
      g.translate(w / 2, h * 0.38);
      g.transform(1, 0, -0.12, 1, 0, 0);
      fitText(g, "Denny's", 0, 0, w * 0.82, (p) => `italic bold ${p}px ${SCRIPT}`, h * 0.56);
      g.restore();
      g.fillStyle = '#e3001b';
      fitText(g, 'OPEN 24 HOURS', w / 2, h * 0.85, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.16);
    },
  },
  {
    name: 'mcdonalds',
    w: 400,
    h: 400,
    draw(g, w, h) {
      g.fillStyle = '#da291c';
      g.fillRect(0, 0, w, h);
      // Golden arches: two parabolic humps.
      g.strokeStyle = '#ffc72c';
      g.lineWidth = w * 0.11;
      g.lineCap = 'butt';
      const base = h * 0.78;
      const top = h * 0.16;
      for (const cx of [w * 0.33, w * 0.67]) {
        g.beginPath();
        const half = w * 0.17;
        g.moveTo(cx - half, base);
        g.bezierCurveTo(cx - half, top - h * 0.05, cx + half, top - h * 0.05, cx + half, base);
        g.stroke();
      }
      g.fillStyle = '#fff';
      fitText(g, "McDonald's", w / 2, h * 0.9, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.11);
    },
  },
  {
    name: 'mcdArches',
    w: 400,
    h: 240,
    draw(g, w, h) {
      g.fillStyle = '#2a1a10';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffc72c';
      g.lineWidth = w * 0.09;
      for (const cx of [w * 0.33, w * 0.67]) {
        g.beginPath();
        const half = w * 0.16;
        g.moveTo(cx - half, h * 0.95);
        g.bezierCurveTo(cx - half, h * 0.0, cx + half, h * 0.0, cx + half, h * 0.95);
        g.stroke();
      }
    },
  },
  {
    name: 'chevron',
    w: 400,
    h: 440,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      const chev = (y: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(w * 0.14, y);
        g.lineTo(w * 0.5, y + h * 0.1);
        g.lineTo(w * 0.86, y);
        g.lineTo(w * 0.86, y + h * 0.14);
        g.lineTo(w * 0.5, y + h * 0.24);
        g.lineTo(w * 0.14, y + h * 0.14);
        g.closePath();
        g.fill();
      };
      chev(h * 0.1, '#0054a4');
      chev(h * 0.33, '#e31937');
      g.fillStyle = '#0054a4';
      fitText(g, 'Chevron', w / 2, h * 0.8, w * 0.84, (p) => `bold ${p}px ${SANS}`, h * 0.16);
    },
  },
  {
    name: 'prices',
    w: 400,
    h: 300,
    draw(g, w, h) {
      g.fillStyle = '#0a0a0c';
      g.fillRect(0, 0, w, h);
      const rows: [string, string, string][] = [
        ['UNLEADED', '4.29⁹', '#ff3020'],
        ['PREMIUM', '4.79⁹', '#ff3020'],
        ['DIESEL', '5.09⁹', '#28ff6a'],
      ];
      rows.forEach(([label, price, col], i) => {
        const y = h * (0.2 + i * 0.3);
        g.fillStyle = '#e8e8e8';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.font = `bold ${h * 0.09}px ${SANS}`;
        g.fillText(label, w * 0.05, y);
        g.save();
        g.shadowColor = col;
        g.shadowBlur = 10;
        g.fillStyle = col;
        g.textAlign = 'right';
        g.font = `bold ${h * 0.2}px "Courier New", monospace`;
        g.fillText(price, w * 0.96, y);
        g.restore();
      });
    },
  },
  {
    name: 'terriblesDiesel',
    w: 640,
    h: 260,
    draw(g, w, h) {
      g.fillStyle = '#ffc61a';
      g.fillRect(0, 0, w, h);
      terriblesMark(g, 10, 6, w - 20, h * 0.62);
      g.fillStyle = '#b30f16';
      g.fillRect(0, h * 0.68, w, h * 0.32);
      g.fillStyle = '#fff';
      fitText(g, 'DIESEL  ·  TRUCKS WELCOME', w / 2, h * 0.84, w * 0.9, (p) => `900 ${p}px ${BLACK}`, h * 0.17);
    },
  },
  {
    name: 'terriblesStore',
    w: 800,
    h: 160,
    draw(g, w, h) {
      g.fillStyle = '#ffc61a';
      g.fillRect(0, 0, w, h);
      terriblesMark(g, 0, 4, w * 0.62, h * 0.92);
      g.fillStyle = '#b30f16';
      fitText(g, 'GAS · FOOD · ICE', w * 0.81, h / 2, w * 0.34, (p) => `900 ${p}px ${BLACK}`, h * 0.3);
    },
  },
  {
    name: 'canopyChevron',
    w: 1024,
    h: 64,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0054a4';
      g.fillRect(0, h * 0.5, w, h * 0.2);
      g.fillStyle = '#e31937';
      g.fillRect(0, h * 0.74, w, h * 0.18);
    },
  },
  {
    name: 'canopyTerribles',
    w: 1024,
    h: 64,
    draw(g, w, h) {
      g.fillStyle = '#b30f16';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffc61a';
      g.fillRect(0, h * 0.12, w, h * 0.22);
      g.fillRect(0, h * 0.7, w, h * 0.12);
    },
  },
  {
    name: 'rebel',
    w: 400,
    h: 300,
    draw(g, w, h) {
      g.fillStyle = '#0d2d6c';
      rounded(g, 0, 0, w, h, 24);
      g.fill();
      g.fillStyle = '#ffffff';
      rounded(g, 10, 10, w - 20, h - 20, 18);
      g.fill();
      g.fillStyle = '#c8102e';
      rounded(g, 22, 22, w - 44, h * 0.5, 12);
      g.fill();
      // Star.
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? h * 0.06 : h * 0.15;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(w * 0.2 + Math.cos(a) * r, h * 0.29 + Math.sin(a) * r);
      }
      g.fill();
      fitText(g, 'REBEL', w * 0.6, h * 0.3, w * 0.55, (p) => `italic 900 ${p}px ${BLACK}`, h * 0.3);
      g.fillStyle = '#0d2d6c';
      fitText(g, 'GAS · SNACKS', w / 2, h * 0.76, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.15);
    },
  },
  {
    name: 'elrey',
    w: 480,
    h: 640,
    frames: 2,
    draw(g, w, h, f) {
      g.fillStyle = '#123a3a';
      rounded(g, 0, 0, w, h, 30);
      g.fill();
      g.strokeStyle = '#e8d8a0';
      g.lineWidth = 8;
      rounded(g, 10, 10, w - 20, h - 20, 24);
      g.stroke();
      // Crown outline in yellow neon.
      g.save();
      g.shadowColor = '#ffd84a';
      g.shadowBlur = 18;
      g.strokeStyle = '#ffe680';
      g.lineWidth = 9;
      g.lineJoin = 'round';
      g.beginPath();
      const cy = h * 0.17;
      const cw = w * 0.5;
      g.moveTo(w / 2 - cw / 2, cy + 50);
      g.lineTo(w / 2 - cw / 2, cy - 10);
      g.lineTo(w / 2 - cw / 4, cy + 20);
      g.lineTo(w / 2, cy - 40);
      g.lineTo(w / 2 + cw / 4, cy + 20);
      g.lineTo(w / 2 + cw / 2, cy - 10);
      g.lineTo(w / 2 + cw / 2, cy + 50);
      g.closePath();
      g.stroke();
      g.restore();
      neon(g, 'El Rey', w / 2, h * 0.41, w * 0.86, (p) => `italic bold ${p}px ${SCRIPT}`, h * 0.2, '#ff2a3a');
      neon(g, 'MOTEL', w / 2, h * 0.6, w * 0.8, (p) => `bold ${p}px ${SERIF}`, h * 0.12, '#3cff8a');
      // VACANCY flickers between frames.
      g.fillStyle = '#2a0a18';
      rounded(g, w * 0.12, h * 0.72, w * 0.76, h * 0.17, 14);
      g.fill();
      if (f === 0) neon(g, 'VACANCY', w / 2, h * 0.805, w * 0.7, (p) => `bold ${p}px ${SANS}`, h * 0.1, '#ff4fb0');
      else {
        g.fillStyle = '#4a2a38';
        fitText(g, 'VACANCY', w / 2, h * 0.805, w * 0.7, (p) => `bold ${p}px ${SANS}`, h * 0.1);
      }
    },
  },
  {
    name: 'bvmotel',
    w: 400,
    h: 240,
    draw(g, w, h) {
      g.fillStyle = '#f3ead8';
      rounded(g, 0, 0, w, h, 20);
      g.fill();
      g.fillStyle = '#1c5a8a';
      fitText(g, 'B·V', w / 2, h * 0.34, w * 0.6, (p) => `900 ${p}px ${BLACK}`, h * 0.36);
      g.fillStyle = '#c8282a';
      fitText(g, 'MOTEL', w / 2, h * 0.7, w * 0.8, (p) => `bold ${p}px ${SERIF}`, h * 0.24);
      g.fillStyle = '#1c5a8a';
      fitText(g, 'TV · A/C · WEEKLY', w / 2, h * 0.9, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.1);
    },
  },
  {
    name: 'townCountry',
    w: 800,
    h: 140,
    draw(g, w, h) {
      g.fillStyle = '#6a2a1a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f6e6c0';
      fitText(g, 'TOWN & COUNTRY STORE', w / 2, h * 0.42, w * 0.92, (p) => `bold ${p}px ${SERIF}`, h * 0.46);
      fitText(g, 'GROCERIES · BEER · BAIT', w / 2, h * 0.82, w * 0.6, (p) => `bold ${p}px ${SANS}`, h * 0.16);
    },
  },
  {
    name: 'postOffice',
    w: 800,
    h: 120,
    draw(g, w, h) {
      g.fillStyle = '#f2f2ee';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a2a5a';
      fitText(g, 'UNITED STATES POST OFFICE', w / 2, h * 0.38, w * 0.94, (p) => `bold ${p}px ${SERIF}`, h * 0.36);
      fitText(g, 'SEARCHLIGHT, NEVADA 89046', w / 2, h * 0.78, w * 0.6, (p) => `bold ${p}px ${SANS}`, h * 0.2);
    },
  },
  {
    name: 'welcome',
    w: 720,
    h: 360,
    draw(g, w, h) {
      // Weathered wooden sign with routed letters.
      g.fillStyle = '#6b4a2e';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 36) {
        g.fillStyle = y % 72 ? '#5e4028' : '#73502f';
        g.fillRect(0, y, w, 34);
      }
      g.fillStyle = '#f2e2b8';
      fitText(g, 'WELCOME TO', w / 2, h * 0.17, w * 0.6, (p) => `bold ${p}px ${SERIF}`, h * 0.12);
      fitText(g, 'SEARCHLIGHT', w / 2, h * 0.42, w * 0.9, (p) => `900 ${p}px ${SERIF}`, h * 0.26);
      fitText(g, 'NEVADA', w / 2, h * 0.64, w * 0.4, (p) => `bold ${p}px ${SERIF}`, h * 0.11);
      g.fillStyle = '#e8c870';
      fitText(g, 'GOLD CAMP · FOUNDED 1897 · ELEV 3,540', w / 2, h * 0.84, w * 0.9, (p) => `bold ${p}px ${SANS}`, h * 0.08);
    },
  },
  {
    name: 'fireStation',
    w: 640,
    h: 100,
    draw(g, w, h) {
      g.fillStyle = '#efe8dc';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#a01818';
      fitText(g, 'CLARK COUNTY FIRE STATION 75', w / 2, h / 2, w * 0.94, (p) => `bold ${p}px ${SANS}`, h * 0.5);
    },
  },
  {
    name: 'museum',
    w: 640,
    h: 140,
    draw(g, w, h) {
      g.fillStyle = '#3a2a1a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f0d890';
      fitText(g, 'SEARCHLIGHT HERITAGE MUSEUM', w / 2, h * 0.4, w * 0.94, (p) => `bold ${p}px ${SERIF}`, h * 0.34);
      fitText(g, 'MINING · RANCHING · RAILROAD', w / 2, h * 0.78, w * 0.7, (p) => `bold ${p}px ${SANS}`, h * 0.16);
    },
  },
];

/** Paints every storefront and highway sign into one texture atlas. */
export function buildSignAtlas(): { texture: THREE.Texture; rects: Record<string, SignRect> } {
  // Shelf packing with a small gutter so mip levels don't bleed between signs.
  const pad = 8;
  let x = pad;
  let y = pad;
  let shelf = 0;
  const sorted = [...SIGNS].sort((a, b) => b.h * (b.frames ?? 1) - a.h * (a.frames ?? 1));
  const placed: { s: SignSpec; x: number; y: number }[] = [];
  for (const s of sorted) {
    const th = s.h * (s.frames ?? 1);
    if (x + s.w + pad > SIZE) {
      x = pad;
      y += shelf + pad;
      shelf = 0;
    }
    placed.push({ s, x, y });
    x += s.w + pad;
    shelf = Math.max(shelf, th);
  }
  const height = Math.ceil((y + shelf + pad) / 256) * 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  const rects: Record<string, SignRect> = {};
  for (const { s, x, y } of placed) {
    const frames = s.frames ?? 1;
    for (let f = 0; f < frames; f++) {
      g.save();
      g.translate(x, y + f * s.h);
      g.beginPath();
      g.rect(0, 0, s.w, s.h);
      g.clip();
      if (!s.cutout) g.fillRect(0, 0, s.w, s.h);
      s.draw(g, s.w, s.h, f);
      g.restore();
    }
    rects[s.name] = { u0: x / SIZE, v0: y / height, u1: (x + s.w) / SIZE, v1: (y + s.h * frames) / height, frames, aspect: s.w / s.h };
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture, rects };
}
