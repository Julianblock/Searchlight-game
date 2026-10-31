import type * as THREE from 'three';
import type { Discoveries, Discovery } from '../ui/discoveries';
import type { CemeteryPlan } from './cemetery';
import type { Heightfield } from './heightfield';
import type { VolcanoVision } from './volcano';
import type { WaterKind } from './water';

export interface LoreState {
  pos: THREE.Vector3;
  driving: boolean;
  /** Camera under the lake or a pond. */
  underwater: boolean;
  /** Truck cab below the surface. */
  truckUnder: boolean;
  water: { name: string; kind: WaterKind } | null;
  /** Height of the actor above the water or ground. */
  agl: number;
  night: number;
  snowCover: number;
}

const TOWN = { x: 50, z: 90 };

type Spot = Discovery & { test: (s: LoreState) => boolean };

/** Summits as mapped; the summit height comes from the terrain itself. */
const PEAKS = {
  highland: { x: -12760, z: -15040 },
  spirit: { x: 17758, z: 21102 },
  duplex: { x: -220, z: 701 },
};

const SITES = {
  terribles: { x: -25, z: -82 },
  mcdonalds: { x: 119, z: 476 },
  duplexMine: { x: -248, z: 604 },
  walkingBox: { x: -10700, z: -3700 },
  cove: { x: 21146, z: -2930 },
  christmasTree: { x: 15856, z: 22677 },
  calNevAri: { x: 3649, z: 18280 },
  riverside: { x: 31585, z: 33015 },
  belle: { x: 31540, z: 34092 },
  riverRick: { x: 31458, z: 34310 },
  davisDam: { x: 31600, z: 29600 },
};

/** An egg on the learn-mode map: where it is, how to find it, and how the tour frames it. */
export interface Egg extends Discovery {
  x: number;
  z: number;
  hint: string;
  /** Tour camera orbit radius and height above the ground (m). */
  r: number;
  h: number;
  night?: boolean;
}

type Guide = { at: { x: number; z: number }; hint: string; r: number; h: number; night?: boolean };

const LAKE = { x: 23550, z: 1700 };

const GUIDE: Record<string, Guide> = {
  searchlight: { at: TOWN, hint: 'Fly or drive into town.', r: 420, h: 170 },
  'duplex-mine': { at: SITES.duplexMine, hint: 'Fly low over the headframe on the hill behind Main Street.', r: 110, h: 35 },
  'duplex-hill': { at: PEAKS.duplex, hint: 'Touch down on the summit of Duplex Hill, just west of town.', r: 260, h: 90 },
  terribles: { at: SITES.terribles, hint: 'Drop below 40 m over the roadhouse at the north end of town.', r: 95, h: 28 },
  mcdonalds: { at: SITES.mcdonalds, hint: 'Visit the arches on US-95 after dark.', r: 85, h: 26, night: true },
  'harry-reid': { at: { x: 420, z: -420 }, hint: 'Fly low over the houses on the edge of town, on the wing rather than in the truck.', r: 240, h: 60 },
  cemetery: { at: { x: 0, z: 0 }, hint: 'Fly low over the cemetery east of town before nightfall.', r: 90, h: 28 },
  'joshua-forest': { at: { x: -6000, z: -2000 }, hint: 'Skim the Joshua trees west of town along SR-164.', r: 160, h: 26 },
  'walking-box': { at: SITES.walkingBox, hint: 'Find the ranch house out in the Piute Valley.', r: 260, h: 60 },
  'lake-mohave': { at: LAKE, hint: 'Skim the surface of Lake Mohave.', r: 420, h: 70 },
  laughlin: { at: { x: 31300, z: 34000 }, hint: 'Head down NV-163 to the river.', r: 950, h: 320, night: true },
  riverside: { at: SITES.riverside, hint: 'Circle the red R of the Riverside.', r: 230, h: 80, night: true },
  'colorado-belle': { at: SITES.belle, hint: 'Find the riverboat moored in its own moat.', r: 220, h: 70 },
  'river-rick': { at: SITES.riverRick, hint: 'Say hello to the neon cowboy outside the Pioneer.', r: 120, h: 40, night: true },
  'davis-dam': { at: SITES.davisDam, hint: 'Fly up the river from Laughlin to the dam.', r: 650, h: 220 },
  'cottonwood-cove': { at: SITES.cove, hint: 'Follow Cottonwood Cove Road all the way down to the lake.', r: 520, h: 160 },
  'spirit-mountain': { at: PEAKS.spirit, hint: 'Land on the summit of Spirit Mountain.', r: 650, h: 260 },
  'christmas-tree-pass': { at: SITES.christmasTree, hint: 'Drive the dirt pass below Spirit Mountain.', r: 420, h: 120 },
  'cal-nev-ari': { at: SITES.calNevAri, hint: 'Follow US-95 south to the town with a runway.', r: 750, h: 260 },
  'highland-summit': { at: PEAKS.highland, hint: 'Land on the highest crag of the Highland Range. Every visit replays the eruption.', r: 600, h: 220 },
  'vegas-glow': { at: TOWN, hint: 'Climb above 500 m on a clear night and look north.', r: 1600, h: 900, night: true },
  underwater: { at: { x: 24000, z: 0 }, hint: 'Dive below the surface of Lake Mohave.', r: 40, h: 14 },
  'truck-underwater': { at: SITES.cove, hint: 'Drive the truck off the beach at Cottonwood Cove and keep going.', r: 160, h: 40 },
  'snow-joshuas': { at: { x: -3500, z: -1500 }, hint: 'Choose snow in the Sky menu and fly over the Joshua trees.', r: 220, h: 50 },
};

/**
 * Places and moments around Searchlight that tell a bit of its story when you
 * find them, plus the eruption vision from the top of the Highland Range.
 */
export class Lore {
  private spots: Spot[] = [];
  private visionArmed = true;
  readonly ids: string[];

  constructor(
    hf: Heightfield,
    private journal: Discoveries,
    private volcano: VolcanoVision,
    graveyard: CemeteryPlan | undefined,
  ) {
    const summit = (p: { x: number; z: number }) => {
      const h = hf.height(p.x, p.z);
      return (s: LoreState) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 150 && s.pos.y > h - 30 && s.pos.y < h + 220;
    };
    const near = (p: { x: number; z: number }, r: number, agl = 60) => (s: LoreState) =>
      Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < r && s.agl < agl;
    const fromTown = (s: LoreState) => Math.hypot(s.pos.x - TOWN.x, s.pos.z - TOWN.z);
    const onWater = (re: RegExp) => (s: LoreState) => !!s.water && re.test(s.water.name) && s.agl < 60;
    this.highlandSummit = summit(PEAKS.highland);
    this.spots = [
      {
        id: 'searchlight',
        kind: 'lore',
        kicker: 'Searchlight · founded 1897',
        title: 'You’d need a searchlight to find it',
        text: 'Prospector George Colton struck gold here in 1897. One story says the camp was named after a box of Searchlight matches; another, that someone grumbled you would need a searchlight to find any gold. By 1907 it was a boomtown bigger than Las Vegas.',
        test: (s) => fromTown(s) < 900 && s.agl < 250,
      },
      {
        id: 'duplex-mine',
        kind: 'lore',
        kicker: 'Duplex Mine',
        title: 'Colton’s strike',
        text: 'The Duplex was one of the first claims in the district. Headframes, tailings and fenced-off shafts still dot the hills around town; the Quartette, the richest mine, ran its own little railroad down to a mill on the Colorado River.',
        test: near(SITES.duplexMine, 120),
      },
      {
        id: 'duplex-hill',
        kind: 'lore',
        kicker: 'Summit · Duplex Hill',
        title: 'The whole town at your feet',
        text: 'From up here you can follow US-95 straight through town, from the welcome sign past Terrible’s and the McDonald’s to the gas stations at the south end, and east down Cottonwood Cove Road to the lake.',
        test: summit(PEAKS.duplex),
      },
      {
        id: 'terribles',
        kind: 'lore',
        kicker: 'Terrible’s Roadhouse',
        title: 'Grand Slams and slot machines',
        text: 'The roadhouse at the north end of town is part casino, part Denny’s, part truck stop, and the brightest thing on the highway between Boulder City and Laughlin. Its red sign is a beacon for night drivers on US-95.',
        test: near(SITES.terribles, 70, 40),
      },
      {
        id: 'mcdonalds',
        kind: 'lore',
        kicker: 'US-95 · after dark',
        title: 'Golden arches over the Mojave',
        text: 'The McDonald’s pole sign stands high over the highway so truckers can see it miles out across the desert. At night it glows alongside Terrible’s and the gas station canopies like a tiny Strip.',
        test: (s) => near(SITES.mcdonalds, 90, 40)(s) && s.night > 0.5,
      },
      {
        id: 'harry-reid',
        kind: 'lore',
        kicker: 'Searchlight · hometown',
        title: 'From a miner’s shack to the Senate',
        text: 'Harry Reid was born here in 1939, the son of a hard-rock miner, in a house without indoor plumbing. He went on to become Senate Majority Leader and came home to Searchlight, where the community museum tells the town’s story.',
        test: (s) => fromTown(s) < 1400 && fromTown(s) > 300 && s.agl < 40 && !s.driving,
      },
      {
        id: 'cemetery',
        kind: 'lore',
        kicker: 'Searchlight Cemetery',
        title: 'Please respect our pioneers',
        text: 'Miners and their families lie under rock rings and wooden crosses among the Joshua trees east of town. Some say the old miners still walk the graves at night, lanterns swinging. Come back after dark…',
        test: (s) => !!graveyard && s.night < 0.6 && Math.hypot(s.pos.x - graveyard.cx, s.pos.z - graveyard.cz) < 70 && s.agl < 40,
      },
      {
        id: 'joshua-forest',
        kind: 'lore',
        kicker: 'Joshua Tree Highway',
        title: 'A forest of Joshua trees',
        text: 'Some of the densest Joshua tree woodland anywhere grows around Searchlight. Each tree depends on a single partner, the yucca moth, to pollinate its spring blooms. The biggest here are several hundred years old.',
        test: (s) => s.pos.x < -2500 && s.pos.x > -12000 && Math.abs(s.pos.z + 2000) < 3500 && s.agl < 120,
      },
      {
        id: 'walking-box',
        kind: 'lore',
        kicker: 'Walking Box Ranch',
        title: 'The It Girl’s desert hideaway',
        text: 'Silent-film star Clara Bow and her husband, cowboy actor Rex Bell, bought this ranch in 1931 to escape Hollywood. Bell later became Lieutenant Governor of Nevada. The adobe ranch house still stands among the Joshua trees.',
        test: near(SITES.walkingBox, 500, 120),
      },
      {
        id: 'lake-mohave',
        kind: 'lore',
        kicker: 'Lake Mohave',
        title: 'The Colorado, held back',
        text: 'Davis Dam closed in 1951 and backed the Colorado River up 67 miles through Black Canyon and Eldorado Canyon. The water comes out of the bottom of Lake Mead, so it runs cold and clear, perfect for striped bass and rainbow trout.',
        test: onWater(/mohave/i),
      },
      {
        id: 'laughlin',
        kind: 'lore',
        kicker: 'Laughlin · founded 1966',
        title: 'Don Laughlin’s bait shop',
        text: 'In 1966 a Minnesota slot-machine operator named Don Laughlin bought a shuttered bait shop and eight motel rooms on this bend of the Colorado. The postal service named the town after him. Today a row of casinos lines the river, and the Riverwalk runs along the water beneath them.',
        test: near(SITES.riverside, 1400, 200),
      },
      {
        id: 'riverside',
        kind: 'lore',
        kicker: 'Don Laughlin’s Riverside',
        title: 'Where it started',
        text: 'The Riverside grew from that bait shop into two towers, a bowling alley, a movie theatre and a showroom of Don’s classic cars. He lived in the penthouse until he died in 2023, and built the Laughlin Bridge to Arizona with his own money in 1987.',
        test: near(SITES.riverside, 200, 120),
      },
      {
        id: 'colorado-belle',
        kind: 'lore',
        kicker: 'Colorado Belle',
        title: 'A riverboat that never sailed',
        text: 'A 600-foot Mississippi paddlewheeler built from concrete and steel in 1987, moored in its own moat with four black smokestacks. It closed in March 2020 and has sat dark on the river ever since.',
        test: near(SITES.belle, 180, 100),
      },
      {
        id: 'river-rick',
        kind: 'lore',
        kicker: 'The Pioneer',
        title: 'River Rick',
        text: 'The neon cowboy outside the Pioneer is Laughlin’s answer to Vegas Vic, tipping his hat to Casino Drive from the old western-themed casino.',
        test: near(SITES.riverRick, 120, 80),
      },
      {
        id: 'davis-dam',
        kind: 'lore',
        kicker: 'Davis Dam · 1951',
        title: 'The cork in Lake Mohave',
        text: 'A rock-and-earth dam 200 feet high across Pyramid Canyon. Its powerplant on the Arizona side feeds the Southwest grid, and the cold water it releases from the bottom of the lake makes the Colorado below Laughlin famous for trout.',
        test: near(SITES.davisDam, 600, 200),
      },
      {
        id: 'cottonwood-cove',
        kind: 'lore',
        kicker: 'Cottonwood Cove',
        title: 'Searchlight’s seaside',
        text: 'Fourteen miles and 2,800 feet down from town, the road ends at a marina, a motel and a sandy beach. Houseboats tie up in the coves, and bighorn sheep come down the canyon walls to drink.',
        test: near(SITES.cove, 600, 150),
      },
      {
        id: 'spirit-mountain',
        kind: 'lore',
        kicker: 'Summit · Spirit Mountain · 5,639 ft',
        title: 'Avi Kwa Ame',
        text: 'To the Mojave and other Yuman-speaking peoples this is Avi Kwa Ame, the place of creation. In 2023 the land around it, wrapping right around Searchlight, became Avi Kwa Ame National Monument.',
        test: summit(PEAKS.spirit),
      },
      {
        id: 'christmas-tree-pass',
        kind: 'lore',
        kicker: 'Christmas Tree Pass',
        title: 'Ornaments in the junipers',
        text: 'Travellers have been hanging decorations on the pinyons and junipers along this pass for decades. Down the road, the boulders of Grapevine Canyon are covered with petroglyphs pecked hundreds of years ago.',
        test: near(SITES.christmasTree, 700, 200),
      },
      {
        id: 'cal-nev-ari',
        kind: 'lore',
        kicker: 'Cal-Nev-Ari',
        title: 'A town built around a runway',
        text: 'Nancy and Slim Kidwell founded it in the 1960s on an old World War II airstrip and named it for the three states that meet nearby. Some homes still have hangars, with the runway right out the back.',
        test: near(SITES.calNevAri, 900, 300),
      },
      {
        id: 'highland-summit',
        kind: 'lore',
        kicker: 'Summit · Highland Range',
        title: 'A volcano, 16 million years ago',
        text: 'The dark crags of the Highland Range are piled lava and ash from a volcanic field that erupted here in the Miocene. Soon after, the Earth’s crust stretched apart, tilting the layers and opening the valley the Colorado River would follow.',
        test: this.highlandSummit,
      },
      {
        id: 'vegas-glow',
        kind: 'secret',
        kicker: 'High above the desert · night',
        title: 'A searchlight on the horizon',
        text: 'Sixty miles north, the glow of Las Vegas lights the clouds, and a single white beam stands straight up from the top of the Luxor pyramid. From up here the town of Searchlight finally lives up to its name.',
        test: (s) => s.night > 0.7 && s.agl > 500 && !s.driving,
      },
      {
        id: 'underwater',
        kind: 'secret',
        kicker: 'Under the surface',
        title: 'Cold, clear water',
        text: 'Lake Mohave is fed from the bottom of Lake Mead, so you can see a long way down. Look for the rare razorback sucker and bonytail, natives that survive almost nowhere else.',
        test: (s) => s.underwater && !s.driving,
      },
      {
        id: 'truck-underwater',
        kind: 'secret',
        kicker: 'Achievement',
        title: 'Warranty void',
        text: 'The truck is now a submarine. The rental desk at Cottonwood Cove would like a word.',
        test: (s) => s.truckUnder,
      },
      {
        id: 'snow-joshuas',
        kind: 'secret',
        kicker: 'Rare weather',
        title: 'Snow on the Joshua trees',
        text: 'At 3,500 feet, Searchlight gets snow only once every few winters. For a morning the Joshua trees wear white caps, and then the desert sun takes it all back.',
        test: (s) => s.snowCover > 0.3 && fromTown(s) < 12000,
      },
    ];
    this.ids = this.spots.map((s) => s.id);
    if (graveyard) GUIDE.cemetery.at = { x: graveyard.cx, z: graveyard.cz };
  }

  /** Every lore spot and secret with its map position and finding hint. */
  atlas(): Egg[] {
    return this.spots.map(({ test: _t, ...d }) => {
      const g = GUIDE[d.id];
      return { ...d, x: g.at.x, z: g.at.z, hint: g.hint, r: g.r, h: g.h, night: g.night };
    });
  }

  private highlandSummit: (s: LoreState) => boolean;

  update(s: LoreState) {
    for (const spot of this.spots) {
      if (this.journal.has(spot.id) || !spot.test(s)) continue;
      const { test: _t, ...d } = spot;
      this.journal.discover(d);
    }
    // Every visit to the Highland Range summit replays the vision.
    const atTop = this.highlandSummit(s);
    if (atTop && this.visionArmed && !this.volcano.active) {
      this.volcano.start();
      this.visionArmed = false;
      if (this.journal.has('highland-summit'))
        this.journal.whisper({ kind: 'lore', kicker: 'Highland Range', title: 'The range awakens', text: 'For a moment you see it as it was, 16 million years ago.' });
    }
    if (!atTop && !this.volcano.active) this.visionArmed = true;
  }
}
