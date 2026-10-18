/** Canvas helpers shared by the sign atlas painters. */
export type Draw = (g: CanvasRenderingContext2D, w: number, h: number, frame: number) => void;

export interface SignSpec {
  name: string;
  w: number;
  h: number;
  frames?: number;
  /** Drawn on transparency: the shader cuts away everything the sign doesn't paint. */
  cutout?: boolean;
  draw: Draw;
}

export const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
export const BLACK = '"Arial Black", "Helvetica Neue", Impact, sans-serif';
export const SCRIPT = '"Brush Script MT", "Snell Roundhand", "Segoe Script", cursive';
export const SERIF = 'Georgia, "Times New Roman", serif';

export function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Text squeezed to fit `maxW`, centred on (x, y). */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, font: (px: number) => string, px: number) {
  g.font = font(px);
  const m = g.measureText(text).width;
  g.save();
  g.translate(x, y);
  if (m > maxW) g.scale(maxW / m, 1);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/** Neon tube lettering: a soft coloured halo with a pale hot core. */
export function neon(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, font: (px: number) => string, px: number, color: string) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = px * 0.35;
  g.fillStyle = color;
  fitText(g, text, x, y, maxW, font, px);
  g.shadowBlur = px * 0.12;
  g.fillStyle = '#fff4ea';
  g.globalAlpha = 0.55;
  fitText(g, text, x, y, maxW, font, px * 0.98);
  g.restore();
}

/** Amber dot-matrix message board. */
export function dotMatrix(g: CanvasRenderingContext2D, w: number, h: number, lines: string[], color: string) {
  g.fillStyle = '#050403';
  g.fillRect(0, 0, w, h);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const o = off.getContext('2d')!;
  o.fillStyle = '#fff';
  const lh = h / lines.length;
  lines.forEach((t, i) => fitText(o, t, w / 2, lh * (i + 0.55), w * 0.92, (p) => `bold ${p}px ${SANS}`, lh * 0.7));
  const mask = o.getImageData(0, 0, w, h).data;
  const pitch = Math.max(4, Math.round(h / 22));
  for (let y = pitch / 2; y < h; y += pitch) {
    for (let x = pitch / 2; x < w; x += pitch) {
      const on = mask[(Math.floor(y) * w + Math.floor(x)) * 4] > 100;
      g.fillStyle = on ? color : '#1a120a';
      g.beginPath();
      g.arc(x, y, pitch * 0.38, 0, Math.PI * 2);
      g.fill();
    }
  }
}
