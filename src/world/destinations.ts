import type { CemeteryPlan } from './cemetery';
import type { OsmData } from './meta';

export interface Destination {
  id: string;
  label: string;
  blurb: string;
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'town',
    label: 'US-95 into Searchlight',
    blurb: "Roll in from the north past the welcome sign, Terrible's Roadhouse and its Denny's, the McDonald's arches and the gas stations.",
  },
  { id: 'main', label: 'Main Street', blurb: 'The old mining-camp grid behind the highway: the post office, the El Rey Motel and the Duplex Mine headframe on the hill.' },
  {
    id: 'cove',
    label: 'Cottonwood Cove Road',
    blurb: 'Fourteen miles east, dropping 2,800 feet through Joshua trees and creosote to the shore of Lake Mohave.',
  },
  { id: 'lake', label: 'Cottonwood Cove', blurb: 'The marina at the bottom of the grade, with the canyon walls of Arizona across the water.' },
  { id: 'joshua', label: 'Joshua Tree Highway', blurb: 'NV-164 heads west through one of the densest Joshua tree forests anywhere, toward Nipton and Crescent Peak.' },
  { id: 'walkingbox', label: 'Walking Box Ranch', blurb: "Clara Bow and Rex Bell's 1930s ranch out on the Piute Valley, down a long dirt road." },
  {
    id: 'cemetery',
    label: 'Searchlight Cemetery',
    blurb: 'Rock-ringed miners\' graves under the Joshua trees east of town. Please respect our pioneers after dark.',
  },
  { id: 'calnevari', label: 'Cal-Nev-Ari', blurb: 'South on US-95: a 1960s fly-in town with its own runway, casino and wide-open valley views.' },
  {
    id: 'christmastree',
    label: 'Christmas Tree Pass',
    blurb: 'A rough dirt pass below Spirit Mountain, past Grapevine Canyon\'s petroglyphs and junipers hung with ornaments.',
  },
];

const ROAD_ANCHORS: Record<string, [string, number, number]> = {
  town: ['Veterans Memorial Highway', -392, -800],
  main: ['Main Street', 120, -150],
  cove: ['Cottonwood Cove Road', 600, -40],
  lake: ['Cottonwood Cove Road', 21058, -2957],
  joshua: ['Joshua Tree Highway', -2500, -200],
  walkingbox: ['Walking Box Ranch Road', -10700, -3700],
  calnevari: ['Veterans Memorial Highway', 3500, 17600],
  christmastree: ['Christmas Tree Pass Road', 15856, 22676],
};

/** Where each anchored drive should face: toward this point. */
const FACING: Record<string, [number, number]> = {
  town: [0, 300],
  main: [130, 400],
  cove: [21000, -2900],
  lake: [23000, -3000],
  joshua: [-20000, -4000],
  walkingbox: [-15000, 9000],
  calnevari: [3600, 25000],
  christmastree: [22000, 23000],
};

export interface Spot {
  x: number;
  z: number;
  psi: number;
  /** On a two-way road: keep right of the centreline. */
  road: boolean;
}

/** Point on the matching roads closest to (ax, az), with the segment heading. */
function nearestOn(osm: OsmData, match: (name: string, kind: string) => boolean, ax: number, az: number) {
  let best = Infinity;
  let spot: { x: number; z: number; dx: number; dz: number } | null = null;
  for (const r of osm.roads) {
    if (!match(r.name, r.kind)) continue;
    const p = r.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ex = p[i + 2] - p[i], ez = p[i + 3] - p[i + 1];
      const l2 = ex * ex + ez * ez;
      if (l2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((ax - p[i]) * ex + (az - p[i + 1]) * ez) / l2));
      const x = p[i] + ex * t, z = p[i + 1] + ez * t;
      const d = Math.hypot(ax - x, az - z);
      if (d < best) {
        best = d;
        const l = Math.sqrt(l2);
        spot = { x, z, dx: ex / l, dz: ez / l };
      }
    }
  }
  return spot;
}

export function resolveDestination(id: string, osm: OsmData, cemeteries: CemeteryPlan[]): Spot | null {
  const anchor = ROAD_ANCHORS[id];
  if (anchor) {
    const s = nearestOn(osm, (n) => n === anchor[0], anchor[1], anchor[2]);
    if (!s) return null;
    const [fx, fz] = FACING[id];
    const sg = s.dx * (fx - s.x) + s.dz * (fz - s.z) >= 0 ? 1 : -1;
    return { x: s.x, z: s.z, psi: Math.atan2(s.dx * sg, s.dz * sg), road: true };
  }
  if (id === 'cemetery') {
    const c = cemeteries.find((p) => p.name === 'Searchlight Cemetery');
    if (!c?.gate) return null;
    const [ox, oz] = c.out;
    return { x: c.gate[0] + ox * 45, z: c.gate[1] + oz * 45, psi: Math.atan2(-ox, -oz), road: false };
  }
  return null;
}
