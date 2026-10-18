import { BLACK, dotMatrix, fitText, neon, rounded, SANS, SCRIPT, SERIF, type SignSpec } from './signKit';

/** Channel letters standing on a roof or a parapet: just the glyphs, outlined so they read by day. */
function letters(g: CanvasRenderingContext2D, text: string, w: number, h: number, font: (px: number) => string, face: string, edge: string, glowCol = '') {
  g.save();
  g.lineJoin = 'round';
  if (glowCol) {
    g.shadowColor = glowCol;
    g.shadowBlur = h * 0.08;
  }
  g.font = font(h * 0.78);
  const m = g.measureText(text).width;
  g.translate(w / 2, h * 0.53);
  if (m > w * 0.96) g.scale((w * 0.96) / m, 1);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = h * 0.07;
  g.strokeStyle = edge;
  g.strokeText(text, 0, 0);
  g.fillStyle = face;
  g.fillText(text, 0, 0);
  g.restore();
}

/** Don Laughlin's Riverside, Aquarius, Harrah's and friends: the Laughlin strip's signs. */
export const LAUGHLIN_SIGNS: SignSpec[] = [
  {
    // Red neon roof letters along the Riverside's north tower.
    name: 'riversideRoof',
    w: 1024,
    h: 150,
    cutout: true,
    draw(g, w, h) {
      letters(g, 'RIVERSIDE', w, h, (p) => `900 ${p}px ${SERIF}`, '#e8202a', '#7a0c10', '#ff3030');
    },
  },
  {
    // The crown logo on the slim south tower: a white R in a red badge.
    name: 'riversideR',
    w: 300,
    h: 300,
    draw(g, w, h) {
      g.fillStyle = '#c8141c';
      rounded(g, 0, 0, w, h, 26);
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 10;
      rounded(g, 16, 16, w - 32, h - 32, 18);
      g.stroke();
      g.fillStyle = '#ffffff';
      fitText(g, 'R', w * 0.5, h * 0.47, w * 0.7, (p) => `italic 900 ${p}px ${SERIF}`, h * 0.74);
      g.fillStyle = '#ffd7a0';
      fitText(g, 'RIVERSIDE', w / 2, h * 0.86, w * 0.7, (p) => `bold ${p}px ${SANS}`, h * 0.09);
    },
  },
  {
    name: 'riversideLED',
    w: 640,
    h: 320,
    frames: 4,
    draw(g, w, h, f) {
      const msgs = [
        ["DON LAUGHLIN'S", 'RIVERSIDE RESORT', 'HOTEL · CASINO'],
        ['LIVE MUSIC', "DON'S CELEBRITY", 'THEATRE'],
        ['BOWLING · BINGO', '6 CINEMAS', 'CLASSIC CARS'],
        ['LOOSE SLOTS', 'ON THE RIVER', 'SINCE 1966'],
      ];
      dotMatrix(g, w, h, msgs[f], f === 1 ? '#ff4040' : f === 2 ? '#40c8ff' : '#ffb030');
    },
  },
  {
    name: 'edgewater',
    w: 1024,
    h: 140,
    cutout: true,
    draw(g, w, h) {
      letters(g, 'EDGEWATER', w, h, (p) => `bold ${p}px ${SANS}`, '#1f4fa8', '#0d2a60', '#4a8cff');
    },
  },
  {
    // Copper glass, a wave and the zodiac water-bearer's colours.
    name: 'aquarius',
    w: 900,
    h: 260,
    draw(g, w, h) {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, '#1a0d36');
      grd.addColorStop(1, '#0a1838');
      g.fillStyle = grd;
      rounded(g, 0, 0, w, h, 30);
      g.fill();
      g.strokeStyle = '#22d8ff';
      g.lineWidth = 8;
      g.beginPath();
      for (let x = 30; x <= w - 30; x += 4) g.lineTo(x, h * 0.82 + Math.sin(x * 0.03) * h * 0.05);
      g.stroke();
      const cols = ['#ff3aa8', '#ff7a2a', '#ffd23a', '#3aff7a', '#22d8ff', '#7a5aff', '#ff3aa8', '#ffd23a'];
      g.save();
      g.font = `900 ${h * 0.5}px ${BLACK}`;
      const word = 'AQUARIUS';
      const total = g.measureText(word).width;
      const sc = Math.min(1, (w * 0.88) / total);
      let x = w / 2 - (total * sc) / 2;
      for (let i = 0; i < word.length; i++) {
        const cw = g.measureText(word[i]).width * sc;
        g.save();
        g.translate(x + cw / 2, h * 0.43);
        g.scale(sc, 1);
        g.shadowColor = cols[i];
        g.shadowBlur = 20;
        g.fillStyle = cols[i];
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(word[i], 0, 0);
        g.restore();
        x += cw;
      }
      g.restore();
    },
  },
  {
    name: 'aquariusLED',
    w: 640,
    h: 240,
    frames: 3,
    draw(g, w, h, f) {
      const msgs = [
        ['AQUARIUS', 'CASINO RESORT'],
        ['PAVILION', 'CONCERTS TONIGHT'],
        ['24 HR CAFE', '$9.99 STEAK & EGGS'],
      ];
      dotMatrix(g, w, h, msgs[f], f === 1 ? '#40e0ff' : '#ff60c0');
    },
  },
  {
    name: 'belle',
    w: 900,
    h: 200,
    draw(g, w, h) {
      g.fillStyle = '#fbf6ec';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#b81822';
      g.fillRect(0, 0, w, h * 0.1);
      g.fillRect(0, h * 0.9, w, h * 0.1);
      g.fillStyle = '#b81822';
      fitText(g, 'COLORADO BELLE', w / 2, h * 0.52, w * 0.92, (p) => `900 ${p}px ${SERIF}`, h * 0.55);
    },
  },
  {
    // Paddlewheel housing: white arch with red spokes and the name in the middle.
    name: 'belleWheel',
    w: 400,
    h: 400,
    draw(g, w, h) {
      g.fillStyle = '#fbf6ec';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c01822';
      g.lineWidth = 12;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.beginPath();
        g.moveTo(w / 2, h / 2);
        g.lineTo(w / 2 + Math.cos(a) * w * 0.47, h / 2 + Math.sin(a) * h * 0.47);
        g.stroke();
      }
      g.lineWidth = 16;
      g.beginPath();
      g.arc(w / 2, h / 2, w * 0.46, 0, 7);
      g.stroke();
      g.fillStyle = '#fbf6ec';
      g.beginPath();
      g.arc(w / 2, h / 2, w * 0.25, 0, 7);
      g.fill();
      g.fillStyle = '#c01822';
      fitText(g, 'COLORADO', w / 2, h * 0.45, w * 0.4, (p) => `900 ${p}px ${SERIF}`, h * 0.08);
      fitText(g, 'BELLE', w / 2, h * 0.56, w * 0.4, (p) => `900 ${p}px ${SERIF}`, h * 0.11);
    },
  },
  {
    name: 'tropicana',
    w: 1024,
    h: 150,
    cutout: true,
    draw(g, w, h) {
      letters(g, 'TROPICANA', w, h, (p) => `900 ${p}px ${SERIF}`, '#c8102e', '#5a0610', '#ff4050');
    },
  },
  {
    name: 'tropicanaLED',
    w: 640,
    h: 240,
    frames: 3,
    draw(g, w, h, f) {
      const msgs = [
        ['TROPICANA', 'LAUGHLIN'],
        ['CASINO · POOL', 'SHOWROOM'],
        ['CAESARS', 'REWARDS'],
      ];
      dotMatrix(g, w, h, msgs[f], '#50ff80');
    },
  },
  {
    name: 'nugget',
    w: 900,
    h: 220,
    draw(g, w, h) {
      g.fillStyle = '#1e140c';
      rounded(g, 0, 0, w, h, 20);
      g.fill();
      g.strokeStyle = '#d6a84a';
      g.lineWidth = 6;
      rounded(g, 10, 10, w - 20, h - 20, 14);
      g.stroke();
      const grd = g.createLinearGradient(0, h * 0.2, 0, h * 0.8);
      grd.addColorStop(0, '#fff0b0');
      grd.addColorStop(0.5, '#e8b440');
      grd.addColorStop(1, '#a8741c');
      g.fillStyle = grd;
      fitText(g, 'Golden Nugget', w / 2, h * 0.47, w * 0.88, (p) => `italic bold ${p}px ${SERIF}`, h * 0.52);
      g.fillStyle = '#d6a84a';
      fitText(g, 'L A U G H L I N', w / 2, h * 0.84, w * 0.5, (p) => `bold ${p}px ${SANS}`, h * 0.11);
    },
  },
  {
    name: 'riverLodge',
    w: 900,
    h: 150,
    cutout: true,
    draw(g, w, h) {
      letters(g, 'RIVER LODGE', w, h, (p) => `bold ${p}px ${SERIF}`, '#f4ece0', '#6a2a18', '#ffe0b0');
    },
  },
  {
    name: 'harrahs',
    w: 900,
    h: 260,
    draw(g, w, h) {
      g.fillStyle = '#f6efe2';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#18a8a0';
      g.fillRect(0, h * 0.78, w, h * 0.07);
      g.fillStyle = '#f08a28';
      g.fillRect(0, h * 0.88, w, h * 0.07);
      g.save();
      g.translate(w / 2, h * 0.42);
      g.transform(1, 0, -0.1, 1, 0, 0);
      g.fillStyle = '#c4186c';
      fitText(g, "Harrah's", 0, 0, w * 0.86, (p) => `italic bold ${p}px ${SERIF}`, h * 0.56);
      g.restore();
    },
  },
  {
    name: 'harrahsLED',
    w: 640,
    h: 240,
    frames: 3,
    draw(g, w, h, f) {
      const msgs = [
        ["HARRAH'S", 'BEACH RESORT'],
        ['RIVERSIDE BEACH', 'CANCUN LAGOON POOL'],
        ['THE RANGE', 'STEAKHOUSE'],
      ];
      dotMatrix(g, w, h, msgs[f], f === 1 ? '#ffb030' : '#ff50b0');
    },
  },
  {
    name: 'pioneer',
    w: 800,
    h: 260,
    draw(g, w, h) {
      g.fillStyle = '#4a2a16';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#e8c070';
      g.lineWidth = 6;
      g.strokeRect(10, 10, w - 20, h - 20);
      neon(g, 'PIONEER', w / 2, h * 0.42, w * 0.86, (p) => `900 ${p}px ${SERIF}`, h * 0.46, '#ffcc30');
      g.fillStyle = '#f8e6c0';
      fitText(g, 'HOTEL & GAMBLING HALL', w / 2, h * 0.8, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.13);
    },
  },
  {
    // River Rick, the Pioneer's waving neon cowboy, as a cut-out.
    name: 'riverRick',
    w: 360,
    h: 760,
    cutout: true,
    draw(g, w, h) {
      const s = w / 360;
      g.save();
      g.scale(s, h / 760);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const shape = (pts: number[], fill: string, stroke = '#1a1a1a', lw = 6) => {
        g.beginPath();
        for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = stroke;
        g.lineWidth = lw;
        g.stroke();
      };
      // Boots and jeans.
      shape([120, 700, 170, 700, 172, 745, 95, 745, 100, 725], '#5a3218');
      shape([200, 700, 250, 700, 275, 745, 198, 745], '#5a3218');
      shape([118, 420, 250, 420, 255, 705, 200, 705, 185, 500, 172, 705, 118, 705], '#2a5ab8');
      // Belt and buckle.
      shape([116, 410, 252, 410, 252, 432, 116, 432], '#3a2010');
      shape([172, 408, 198, 408, 198, 434, 172, 434], '#e8c040', '#7a5a10', 3);
      // Checkered shirt.
      shape([110, 230, 260, 230, 255, 415, 115, 415], '#e8e2d0');
      g.save();
      g.beginPath();
      g.rect(112, 232, 146, 182);
      g.clip();
      g.fillStyle = '#d0302a';
      for (let y = 230; y < 420; y += 22) for (let x = 110; x < 262; x += 22) if (((x - 110) / 22 + (y - 230) / 22) % 2 < 1) g.fillRect(x, y, 22, 22);
      g.restore();
      // Waving right arm up, left arm down at the hip.
      shape([255, 240, 300, 150, 330, 70, 352, 82, 322, 170, 280, 270], '#e8e2d0');
      shape([326, 30, 356, 32, 360, 80, 326, 78], '#f0c8a0');
      shape([112, 240, 70, 330, 88, 410, 110, 400, 100, 335, 130, 270], '#e8e2d0');
      // Bandana, face, grin and the big hat.
      shape([140, 220, 230, 220, 185, 262], '#e8b020');
      shape([140, 120, 230, 120, 228, 205, 185, 228, 142, 205], '#f0c8a0');
      g.fillStyle = '#1a1a1a';
      g.beginPath();
      g.arc(165, 160, 6, 0, 7);
      g.arc(205, 160, 6, 0, 7);
      g.fill();
      g.beginPath();
      g.arc(185, 185, 20, 0.2, Math.PI - 0.2);
      g.lineWidth = 5;
      g.stroke();
      shape([80, 118, 290, 118, 300, 100, 250, 92, 240, 40, 185, 52, 130, 40, 120, 92, 70, 100], '#c8a060');
      shape([122, 92, 248, 92, 248, 104, 122, 104], '#5a3218', '#1a1a1a', 3);
      g.restore();
    },
  },
  {
    name: 'seventySix',
    w: 300,
    h: 300,
    cutout: true,
    draw(g, w, h) {
      g.fillStyle = '#ff6a00';
      g.beginPath();
      g.arc(w / 2, h / 2, w * 0.47, 0, 7);
      g.fill();
      g.fillStyle = '#0057a8';
      fitText(g, '76', w / 2, h * 0.53, w * 0.7, (p) => `900 ${p}px ${BLACK}`, h * 0.5);
    },
  },
  {
    name: 'innout',
    w: 600,
    h: 260,
    draw(g, w, h) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8001d';
      fitText(g, 'IN-N-OUT', w / 2, h * 0.36, w * 0.9, (p) => `900 ${p}px ${BLACK}`, h * 0.4);
      fitText(g, 'BURGER', w / 2, h * 0.7, w * 0.5, (p) => `900 ${p}px ${BLACK}`, h * 0.2);
      // The yellow boomerang arrow.
      g.strokeStyle = '#ffd200';
      g.lineWidth = h * 0.06;
      g.beginPath();
      g.moveTo(w * 0.08, h * 0.92);
      g.quadraticCurveTo(w * 0.5, h * 0.75, w * 0.88, h * 0.9);
      g.stroke();
      g.fillStyle = '#ffd200';
      g.beginPath();
      g.moveTo(w * 0.96, h * 0.92);
      g.lineTo(w * 0.84, h * 0.8);
      g.lineTo(w * 0.84, h * 0.99);
      g.fill();
    },
  },
  {
    name: 'laughlinWelcome',
    w: 800,
    h: 360,
    draw(g, w, h) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#1a5aa8');
      grd.addColorStop(1, '#0a2a5a');
      g.fillStyle = grd;
      rounded(g, 0, 0, w, h, 30);
      g.fill();
      g.strokeStyle = '#ffd25a';
      g.lineWidth = 10;
      rounded(g, 12, 12, w - 24, h - 24, 22);
      g.stroke();
      g.fillStyle = '#ffffff';
      fitText(g, 'WELCOME TO', w / 2, h * 0.2, w * 0.5, (p) => `bold ${p}px ${SANS}`, h * 0.11);
      neon(g, 'Laughlin', w / 2, h * 0.47, w * 0.8, (p) => `italic bold ${p}px ${SCRIPT}`, h * 0.36, '#ffd25a');
      g.fillStyle = '#ffffff';
      fitText(g, 'NEVADA · ON THE COLORADO RIVER', w / 2, h * 0.79, w * 0.86, (p) => `bold ${p}px ${SANS}`, h * 0.09);
    },
  },
  {
    name: 'jetski',
    w: 600,
    h: 180,
    draw(g, w, h) {
      g.fillStyle = '#ffe23a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a3a8a';
      fitText(g, 'JET SKI RENTALS', w / 2, h * 0.4, w * 0.92, (p) => `900 ${p}px ${BLACK}`, h * 0.38);
      g.fillStyle = '#d0201a';
      fitText(g, 'HOURLY · DAILY · TOURS', w / 2, h * 0.8, w * 0.8, (p) => `bold ${p}px ${SANS}`, h * 0.16);
    },
  },
  {
    name: 'waterTaxi',
    w: 500,
    h: 110,
    draw(g, w, h) {
      g.fillStyle = '#0a5a8a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      fitText(g, 'WATER TAXI', w / 2, h / 2, w * 0.9, (p) => `900 ${p}px ${BLACK}`, h * 0.6);
    },
  },
];
