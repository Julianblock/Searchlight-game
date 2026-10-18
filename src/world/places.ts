import type { OsmData, OsmPoi } from './meta';

interface Area {
  name: string;
  x: number;
  z: number;
  r: number;
  note?: string;
}

// Local coordinates (m, x east / z south) of named landscapes without OSM points.
const AREAS: Area[] = [
  { name: 'Searchlight Airport', x: 890, z: 2310, r: 600, note: 'A lonely desert airstrip off Cottonwood Cove Road' },
  { name: 'Walking Box Ranch', x: -11100, z: -1050, r: 900, note: 'Clara Bow and Rex Bell\u2019s 1930s desert hideaway' },
  { name: 'Wee Thump Joshua Tree Wilderness', x: -10940, z: -7740, r: 3600, note: 'Some of the oldest, tallest Joshua trees on Earth' },
  { name: 'Highland Range', x: -8000, z: -16000, r: 5200, note: 'Volcanic crags and desert bighorn country' },
  { name: 'Eldorado Mountains', x: 8100, z: -24000, r: 5500, note: 'Tilted volcanic ranges above Lake Mohave' },
  { name: 'Newberry Mountains', x: 18100, z: 20500, r: 6000, note: 'Granite domes of Avi Kwa Ame, sacred to ten Yuman tribes' },
  { name: 'Grapevine Canyon', x: 20600, z: 27150, r: 900, note: 'Hundreds of petroglyphs pecked into the granite' },
  { name: 'Piute Valley', x: 5400, z: 15000, r: 7500, note: 'A sea of creosote between the Newberrys and the McCulloughs' },
  { name: 'Castle Mountains', x: -16400, z: 18300, r: 5000, note: 'Castle Mountains National Monument, California' },
  { name: 'Lake Mohave', x: 23550, z: 1700, r: 4600, note: 'Colorado River backed up behind Davis Dam' },
  { name: 'Eldorado Canyon', x: 19900, z: -26000, r: 2600, note: 'Old Nelson mining camp on the river' },
  { name: 'Searchlight Mining District', x: 900, z: -1400, r: 1300, note: 'Headframes and tailings of the 1897 gold rush' },
  { name: 'Laughlin', x: 31300, z: 34000, r: 2300, note: 'Casino row on the Colorado River' },
  { name: 'Davis Dam', x: 31600, z: 29620, r: 700, note: 'Holding back Lake Mohave since 1951' },
  { name: 'Bullhead City', x: 35100, z: 34000, r: 3300, note: 'Arizona, across the river from the casinos' },
];

const HIDDEN_ROADS = new Set([
  'Veterans Memorial Highway',
  'Cottonwood Cove Road',
  'Christmas Tree Pass Road',
  'Joshua Tree Highway',
  'Old Joshua Tree Highway',
  'Nelson Cutoff Road',
  'Main Street',
  'North Main Street',
  'Hobson Street',
  'Broadway Street',
  'Walking Box Ranch Road',
  'Crescent Peak Road',
  'Hart Mine Road',
  'Castle Mountain Mine Road',
  'Harry Reid Road',
  'Railroad Grade Road',
  'Empire Wash Road',
  'Quartette Road',
  'Cemetery Access Road',
  'Colorado River Highway',
  'South Casino Drive',
]);

const ROAD_LABEL: Record<string, string> = {
  'Veterans Memorial Highway': 'US-95 \u00b7 Veterans Memorial Highway',
  'Joshua Tree Highway': 'SR-164 \u00b7 Joshua Tree Highway',
  'Cottonwood Cove Road': 'SR-164 \u00b7 Cottonwood Cove Road',
  'Colorado River Highway': 'NV-163 \u00b7 Colorado River Highway',
  'South Casino Drive': 'Casino Drive \u00b7 the Laughlin strip',
};

const POI_KIND: Record<string, string> = {
  casino: 'Casino & roadhouse',
  restaurant: 'Open 24 hours',
  fast_food: 'Drive-thru on US-95',
  fuel: 'Gas station',
  shop: 'Gas & convenience',
  motel: 'Roadside motel',
  post_office: 'Post office',
  mineshaft: 'Historic gold mine',
  historic: 'Historical marker',
  fire_station: 'Fire station',
  school: 'School',
  community_centre: 'Community center',
  courthouse: 'Justice court',
  park: 'Park',
  viewpoint: 'Scenic viewpoint',
  saddle: 'Mountain pass',
  social_facility: 'Senior center',
};

export interface PlaceInfo {
  title: string;
  subtitle: string;
}

/** Names the landscape under the bird: businesses, peaks, ranges, towns and roads. */
export class Places {
  private roadGrid = new Map<string, { name: string; ax: number; az: number; bx: number; bz: number }[]>();
  private readonly cell = 250;
  private pois: OsmPoi[];

  constructor(private osm: OsmData) {
    for (const r of osm.roads) {
      if (!r.name || !HIDDEN_ROADS.has(r.name)) continue;
      const p = r.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const seg = { name: r.name, ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3] };
        const k = this.key((seg.ax + seg.bx) / 2, (seg.az + seg.bz) / 2);
        let list = this.roadGrid.get(k);
        if (!list) this.roadGrid.set(k, (list = []));
        list.push(seg);
      }
    }
    this.pois = osm.pois.filter((p) => p.name && POI_KIND[p.kind]);
  }

  private key(x: number, z: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  nearestRoad(x: number, z: number, maxDist: number): string | null {
    let best = maxDist;
    let name: string | null = null;
    const ci = Math.floor(x / this.cell);
    const cj = Math.floor(z / this.cell);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const list = this.roadGrid.get(`${ci + di},${cj + dj}`);
        if (!list) continue;
        for (const s of list) {
          const dx = s.bx - s.ax;
          const dz = s.bz - s.az;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz + 1e-6)));
          const d = Math.hypot(s.ax + dx * t - x, s.az + dz * t - z);
          if (d < best) {
            best = d;
            name = s.name;
          }
        }
      }
    }
    return name && (ROAD_LABEL[name] ?? name);
  }

  at(x: number, z: number, agl: number): PlaceInfo {
    // Low over town: name the business under the bird.
    if (agl < 160) {
      let best: OsmPoi | null = null;
      let bd = 55 + agl * 0.3;
      for (const p of this.pois) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) return { title: best.name, subtitle: POI_KIND[best.kind] };
    }

    let peak: { name: string; ele: number | null } | null = null;
    let pd = 650;
    for (const p of this.osm.peaks) {
      if (!p.name) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < pd) {
        pd = d;
        peak = p;
      }
    }
    if (peak) {
      const sub = peak.ele ? `${peak.ele} m \u00b7 ${Math.round(peak.ele * 3.281).toLocaleString()} ft summit` : 'Avi Kwa Ame';
      return { title: peak.name, subtitle: sub };
    }

    let town: { name: string; d: number } | null = null;
    for (const p of this.osm.places) {
      const reach = p.kind === 'village' ? 1700 : 900;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < reach && (!town || d < town.d)) town = { name: p.name, d };
    }
    const road = agl < 250 ? this.nearestRoad(x, z, 80) : null;
    if (town) return { title: town.name, subtitle: road ? `Above ${road}` : town.name === 'Searchlight' ? 'Pop. 500 \u00b7 Elev. 3,540 ft' : 'Mojave Desert' };

    let area: Area | null = null;
    for (const a of AREAS) {
      if (Math.hypot(a.x - x, a.z - z) < a.r && (!area || a.r < area.r)) area = a;
    }
    if (area) return { title: area.name, subtitle: road ? `Above ${road}` : area.note ?? 'Mojave Desert' };

    const dist = Math.hypot(x, z);
    const dir = compassWord(Math.atan2(x, -z));
    if (dist < 30000) {
      return { title: 'Avi Kwa Ame National Monument', subtitle: road ? `Above ${road}` : `${(dist / 1000).toFixed(0)} km ${dir} of Searchlight` };
    }
    return { title: 'Mojave Desert', subtitle: road ? `Above ${road}` : `${(dist / 1000).toFixed(0)} km ${dir} of Searchlight` };
  }
}

export function compassWord(rad: number): string {
  const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const i = Math.round(((rad / (Math.PI * 2)) * 8 + 8) % 8) % 8;
  return names[i];
}
