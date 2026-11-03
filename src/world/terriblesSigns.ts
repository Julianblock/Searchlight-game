import { BLACK, fitText, rounded, SANS, SERIF, type SignSpec } from './signKit';

const RED = '#d6201f';
const INK = '#1a1414';

/**
 * Terrible's sheriff: black hat, white handlebar moustache, red vest with a
 * gold star, arms flung out with a six-shooter in each hand. `flash` lights
 * the muzzle flames.
 */
export function drawCowboy(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, flash: boolean) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const shape = (fill: string, path: () => void, line = 6) => {
    g.beginPath();
    path();
    g.lineWidth = line;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = fill;
    g.fill();
  };
  // Arms: white sleeves out to gloved fists.
  for (const sx of [-1, 1]) {
    shape('#f4f2ee', () => {
      g.moveTo(sx * 40, -18);
      g.lineTo(sx * 175, -8);
      g.lineTo(sx * 178, 14);
      g.lineTo(sx * 40, 22);
      g.closePath();
    });
    // Six-shooter pointing outward and a little up.
    shape('#7c7f86', () => {
      g.moveTo(sx * 182, -8);
      g.lineTo(sx * 262, -18);
      g.lineTo(sx * 264, -4);
      g.lineTo(sx * 206, 6);
      g.lineTo(sx * 200, 26);
      g.lineTo(sx * 184, 26);
      g.closePath();
    }, 5);
    shape('#f4f2ee', () => g.arc(sx * 186, 4, 16, 0, Math.PI * 2), 5);
    if (flash) {
      g.save();
      g.translate(sx * 268, -12);
      g.shadowColor = '#ffb020';
      g.shadowBlur = 22;
      g.fillStyle = '#ff7a14';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = i % 2 ? 14 : sx * Math.cos(a) > 0.3 ? 46 : 26;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.75);
      }
      g.closePath();
      g.fill();
      g.fillStyle = '#ffe88a';
      g.beginPath();
      g.ellipse(sx * 8, 0, 16, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  // Torso: white shirt under a red vest, black belt and buckle.
  shape('#f4f2ee', () => rounded(g, -42, -30, 84, 128, 14));
  shape(RED, () => {
    g.moveTo(-44, -26);
    g.lineTo(-8, -26);
    g.lineTo(-4, 90);
    g.lineTo(-44, 90);
    g.closePath();
  });
  shape(RED, () => {
    g.moveTo(44, -26);
    g.lineTo(8, -26);
    g.lineTo(4, 90);
    g.lineTo(44, 90);
    g.closePath();
  });
  shape('#141414', () => rounded(g, -46, 84, 92, 20, 4), 4);
  shape('#c8c2b0', () => rounded(g, -12, 86, 24, 16, 3), 3);
  // Sheriff's star.
  shape('#ffd23a', () => {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7 : 17;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(26 + Math.cos(a) * r, 26 + Math.sin(a) * r);
    }
    g.closePath();
  }, 3);
  // Head, moustache, hat.
  shape('#f6efe4', () => g.ellipse(0, -66, 30, 36, 0, 0, Math.PI * 2));
  shape('#f8f8f6', () => {
    g.moveTo(0, -52);
    g.bezierCurveTo(-26, -62, -54, -40, -58, -18);
    g.bezierCurveTo(-40, -34, -20, -30, 0, -38);
    g.bezierCurveTo(20, -30, 40, -34, 58, -18);
    g.bezierCurveTo(54, -40, 26, -62, 0, -52);
  }, 4);
  // Beard and goatee below the moustache.
  shape('#f8f8f6', () => {
    g.moveTo(-16, -40);
    g.quadraticCurveTo(0, -4, 16, -40);
  }, 4);
  g.fillStyle = INK;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * 11, -74, 4, 0, Math.PI * 2);
    g.fill();
  }
  shape('#c83a2a', () => g.arc(0, -62, 6, 0, Math.PI * 2), 3);
  shape('#151515', () => {
    g.moveTo(-82, -96);
    g.quadraticCurveTo(0, -84, 82, -96);
    g.lineTo(78, -86);
    g.quadraticCurveTo(0, -74, -78, -86);
    g.closePath();
  }, 4);
  shape('#151515', () => {
    g.moveTo(-32, -92);
    g.lineTo(-28, -134);
    g.quadraticCurveTo(0, -142, 28, -134);
    g.lineTo(32, -92);
    g.closePath();
  }, 4);
  g.fillStyle = '#e8e2d4';
  g.fillRect(-31, -100, 62, 6);
  g.restore();
}

/** Bold western serif for TERRIBLE'S, slightly flared and leaning. */
function western(px: number) {
  return `900 ${px}px ${SERIF}`;
}

/** Letters that are stroked dark, filled, and given a pale inner edge like channel letters. */
function channel(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, font: (p: number) => string, px: number, fill: string, edge: string, skew = 0) {
  g.save();
  g.translate(x, y);
  g.transform(1, 0, skew, 1, 0, 0);
  g.font = font(px);
  const m = g.measureText(text).width;
  if (m > maxW) g.scale(maxW / m, 1);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = px * 0.16;
  g.strokeStyle = edge;
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.lineWidth = px * 0.025;
  g.strokeStyle = 'rgba(255,240,230,0.55)';
  g.strokeText(text, 0, 0);
  g.restore();
}

function arches(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.strokeStyle = '#ffc72c';
  g.lineWidth = w * 0.12;
  g.lineCap = 'butt';
  for (const cx of [x + w * 0.31, x + w * 0.69]) {
    const half = w * 0.19;
    g.beginPath();
    g.moveTo(cx - half, y + h);
    g.bezierCurveTo(cx - half, y - h * 0.08, cx + half, y - h * 0.08, cx + half, y + h);
    g.stroke();
  }
  g.restore();
}

export const TERRIBLES_SIGNS: SignSpec[] = [
  {
    // The gable figure; frame 1 fires both pistols.
    name: 'tcCowboy',
    w: 720,
    h: 380,
    frames: 2,
    cutout: true,
    draw(g, w, h, f) {
      drawCowboy(g, w / 2, h * 0.43, h / 290, f === 1);
    },
  },
  {
    name: 'tcTerribles',
    w: 900,
    h: 200,
    cutout: true,
    draw(g, w, h) {
      channel(g, "TERRIBLE'S", w / 2, h * 0.54, w * 0.96, western, h * 0.78, RED, '#5e0b0b', -0.08);
    },
  },
  {
    // White marquee letters full of bulbs, outlined in red.
    name: 'tcCasino',
    w: 900,
    h: 220,
    cutout: true,
    draw(g, w, h) {
      const px = h * 0.86;
      const font = (p: number) => `bold ${p}px ${SERIF}`;
      g.save();
      g.font = font(px);
      const m = g.measureText('CASINO').width;
      g.translate(w / 2, h * 0.53);
      if (m > w * 0.96) g.scale((w * 0.96) / m, 1);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = px * 0.16;
      g.strokeStyle = '#b81b1b';
      g.strokeText('CASINO', 0, 0);
      g.fillStyle = '#f2efe8';
      g.fillText('CASINO', 0, 0);
      g.globalCompositeOperation = 'source-atop';
      const step = px * 0.11;
      for (let yy = -px / 2; yy < px / 2; yy += step) {
        for (let xx = -m / 2; xx < m / 2; xx += step) {
          g.fillStyle = '#9a948a';
          g.beginPath();
          g.arc(xx, yy, step * 0.36, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff6d0';
          g.beginPath();
          g.arc(xx, yy, step * 0.24, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    },
  },
  {
    name: 'tcLiquor',
    w: 520,
    h: 120,
    cutout: true,
    draw(g, w, h) {
      channel(g, 'LIQUOR', w / 2, h * 0.54, w * 0.94, western, h * 0.78, RED, '#4a0808');
    },
  },
  {
    name: 'tcIce',
    w: 260,
    h: 120,
    cutout: true,
    draw(g, w, h) {
      channel(g, 'ICE', w / 2, h * 0.54, w * 0.9, western, h * 0.78, RED, '#4a0808');
    },
  },
  {
    name: 'tcRestrooms',
    w: 520,
    h: 200,
    cutout: true,
    draw(g, w, h) {
      channel(g, 'CLEAN', w / 2, h * 0.28, w * 0.6, western, h * 0.4, RED, '#4a0808');
      channel(g, 'RESTROOMS', w / 2, h * 0.74, w * 0.96, western, h * 0.4, RED, '#4a0808');
    },
  },
  {
    // Red box sign on the tower, white letters in a white keyline.
    name: 'tcTerrBox',
    w: 560,
    h: 130,
    draw(g, w, h) {
      g.fillStyle = '#1d3f8a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d0201c';
      g.fillRect(8, 8, w - 16, h - 16);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 5;
      g.strokeRect(16, 16, w - 32, h - 32);
      g.fillStyle = '#ffffff';
      fitText(g, "TERRIBLE'S", w / 2, h * 0.54, w * 0.84, (p) => `900 ${p}px ${BLACK}`, h * 0.56);
    },
  },
  {
    name: 'mcdM',
    w: 300,
    h: 240,
    cutout: true,
    draw(g, w, h) {
      arches(g, 0, h * 0.04, w, h * 0.94);
    },
  },
  {
    name: 'mcdWord',
    w: 760,
    h: 130,
    cutout: true,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      fitText(g, "McDonald's", w / 2, h * 0.55, w * 0.96, (p) => `bold ${p}px ${SANS}`, h * 0.86);
    },
  },
  {
    name: 'usFlag',
    w: 380,
    h: 200,
    draw(g, w, h) {
      for (let i = 0; i < 13; i++) {
        g.fillStyle = i % 2 ? '#f6f6f2' : '#b22234';
        g.fillRect(0, (i * h) / 13, w, h / 13 + 1);
      }
      g.fillStyle = '#3c3b6e';
      g.fillRect(0, 0, w * 0.4, (h * 7) / 13);
      g.fillStyle = '#ffffff';
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < (r % 2 ? 5 : 6); c++) {
          g.beginPath();
          g.arc(w * 0.4 * ((c + (r % 2 ? 1 : 0.5)) / 6), ((h * 7) / 13) * ((r + 0.5) / 9), 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
  },
  // --- the big pole sign by the highway, top to bottom ---
  {
    name: 'pyArches',
    w: 480,
    h: 330,
    cutout: true,
    draw(g, w, h) {
      arches(g, w * 0.06, h * 0.02, w * 0.88, h * 0.7);
      g.fillStyle = '#da291c';
      rounded(g, w * 0.02, h * 0.74, w * 0.96, h * 0.24, 10);
      g.fill();
      g.fillStyle = '#ffffff';
      fitText(g, "McDonald's", w / 2, h * 0.865, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.17);
    },
  },
  {
    name: 'pyOne9',
    w: 400,
    h: 220,
    draw(g, w, h) {
      g.fillStyle = '#e2261c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.font = `900 ${h * 0.46}px ${BLACK}`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText('ONE', w * 0.6, h * 0.42);
      g.fillStyle = '#141414';
      rounded(g, w * 0.63, h * 0.16, w * 0.24, h * 0.52, 12);
      g.fill();
      g.fillStyle = '#ffffff';
      fitText(g, '9', w * 0.75, h * 0.43, w * 0.2, (p) => `900 ${p}px ${BLACK}`, h * 0.46);
      fitText(g, 'FUEL NETWORK.', w / 2, h * 0.83, w * 0.6, (p) => `bold ${p}px ${SANS}`, h * 0.12);
    },
  },
  {
    name: 'pyDiesel',
    w: 400,
    h: 200,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8191c';
      g.fillRect(6, 6, w - 12, h * 0.34);
      g.fillStyle = '#1f9a49';
      g.fillRect(6, h * 0.4 + 6, w - 12, h * 0.6 - 12);
      g.fillStyle = '#ffffff';
      fitText(g, "TERRIBLE'S", w / 2, h * 0.21, w * 0.8, (p) => `900 ${p}px ${BLACK}`, h * 0.24);
      fitText(g, 'DIESEL#2', w / 2, h * 0.71, w * 0.9, (p) => `900 ${p}px ${BLACK}`, h * 0.38);
    },
  },
  {
    name: 'pyPrice',
    w: 400,
    h: 130,
    draw(g, w, h) {
      g.fillStyle = '#0a0a0a';
      g.fillRect(0, 0, w, h);
      g.save();
      g.shadowColor = '#ff2a1a';
      g.shadowBlur = 14;
      g.fillStyle = '#ff3522';
      g.font = `bold ${h * 0.8}px "Courier New", monospace`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText('4.09', w * 0.8, h * 0.54);
      g.font = `bold ${h * 0.34}px "Courier New", monospace`;
      g.textAlign = 'center';
      g.fillText('9', w * 0.89, h * 0.32);
      g.fillText('10', w * 0.89, h * 0.74);
      g.fillRect(w * 0.83, h * 0.52, w * 0.12, 3);
      g.restore();
    },
  },
  {
    name: 'pyRest',
    w: 400,
    h: 70,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c4fb0';
      g.fillRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#ffffff';
      g.save();
      g.translate(w / 2, h * 0.54);
      g.transform(1, 0, -0.2, 1, 0, 0);
      fitText(g, 'CLEAN RESTROOMS', 0, 0, w * 0.9, (p) => `900 ${p}px ${BLACK}`, h * 0.56);
      g.restore();
    },
  },
  {
    name: 'pyCasino',
    w: 400,
    h: 400,
    draw(g, w, h) {
      g.fillStyle = '#c8191c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe53a';
      g.fillRect(8, 8, w - 16, h - 16);
      drawCowboy(g, w / 2, h * 0.25, h / 1500, false);
      channel(g, "TERRIBLE'S", w / 2, h * 0.52, w * 0.86, western, h * 0.14, '#c8191c', '#7a0a0a');
      g.fillStyle = '#1a1a1a';
      fitText(g, 'CASINO', w / 2, h * 0.71, w * 0.84, (p) => `900 ${p}px ${BLACK}`, h * 0.2);
      g.fillStyle = '#c8191c';
      fitText(g, 'SEARCHLIGHT', w / 2, h * 0.88, w * 0.86, (p) => `900 ${p}px ${BLACK}`, h * 0.11);
    },
  },
];
