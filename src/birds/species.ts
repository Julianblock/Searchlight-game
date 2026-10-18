// Birds that really work the skies over Searchlight, the Joshua tree flats of
// Avi Kwa Ame and the shores of Lake Mohave. Dimensions from Cornell / Sibley.

export type TailShape = 'fan' | 'square' | 'wedge' | 'notched' | 'short';
export type BeakType = 'hook' | 'falcon' | 'goose' | 'spear' | 'pelican' | 'owl' | 'vulture' | 'corvid' | 'seed' | 'needle' | 'gape';
export type WingTip = 'slotted' | 'pointed' | 'rounded';

export interface Palette {
  name: string;
  head: string;
  throat: string;
  breast: string;
  belly: string;
  back: string;
  coverts: string;
  secondaries: string;
  primaries: string;
  underCoverts: string;
  underFlight: string;
  tail: string;
  tailUnder: string;
  beak: string;
  cere: string;
  legs: string;
  eye: string;
  skin: string; // bare head / crown patch / gorget
  bellyBand?: number;
  barring?: number;
  tailBands?: number;
  tailBandColor?: string;
  wingtipDark?: number;
  trailingEdge?: number;
  patagial?: number;
  carpal?: number;
  rump?: number;
  mottle?: number;
  helmet?: number; // falcon moustache / dark hood / osprey eye-stripe
  skinHead?: number; // fraction of head that is bare skin
  crown?: number; // coloured crown patch
  wingPanel?: number; // pale panel in the primaries (nighthawk bar, juv. eagle)
  gloss?: number; // iridescent blue-violet sheen (raven, hummingbird gorget)
}

export interface Shape {
  wingspan: number;
  length: number;
  bodyWidth: number;
  bodyDepth: number;
  neckLen: number;
  headSize: number;
  chord: number; // root chord as a fraction of semi-span
  taper: number; // 0 broad .. 1 pointed
  sweep: number; // radians of tip sweep-back
  tip: WingTip;
  fingers: number;
  fingerLen: number;
  tailLen: number;
  tailWidth: number;
  tail: TailShape;
  beak: BeakType;
  beakLen: number;
  legs: 'tucked' | 'trailing';
  legLen: number;
  dihedral: number; // radians at glide
  disk?: boolean; // owl facial disk
  tufts?: number; // owl "ear" tufts, length as a fraction of head size
  crest?: number; // shaggy crest (roadrunner) or teardrop topknot (quail)
}

export interface FlightTraits {
  massKg: number;
  cruise: number; // m/s best glide speed
  stall: number;
  maxDive: number;
  glideRatio: number;
  flapHz: number;
  flapPower: number; // m/s^2 of thrust when flapping at cruise
  climb: number; // agility factor
  hover?: boolean;
  soarer?: boolean;
  nocturnal?: boolean;
  swimmer?: boolean;
}

export type Call =
  | 'scream'
  | 'kek'
  | 'honk'
  | 'bugle'
  | 'croak'
  | 'hiss'
  | 'whistle'
  | 'screech'
  | 'chitter'
  | 'grunt'
  | 'hoot'
  | 'peent'
  | 'trill'
  | 'coo'
  | 'quail'
  | 'squawk';

export interface Species {
  id: string;
  name: string;
  latin: string;
  blurb: string;
  facts: string[];
  call: Call;
  shape: Shape;
  flight: FlightTraits;
  palettes: Palette[];
}

const base = {
  eye: '#2a1a0c',
  legs: '#e8c23a',
  cere: '#e3b93c',
  skin: '#c43a2c',
};

export const SPECIES: Species[] = [
  {
    id: 'redtail',
    name: 'Red-tailed Hawk',
    latin: 'Buteo jamaicensis',
    blurb: 'Perches on the power poles along US-95, then rides ridge lift off the Highland Range over the Joshua tree flats.',
    facts: [
      'Its raspy keee-eeer scream is the "eagle" call Hollywood dubs into every movie.',
      'Hunts jackrabbits and ground squirrels from the tops of Joshua trees.',
      'Desert birds are paler than coastal ones, sun-bleached like everything else out here.',
    ],
    call: 'scream',
    shape: {
      wingspan: 1.24, length: 0.55, bodyWidth: 0.15, bodyDepth: 0.16, neckLen: 0.02, headSize: 0.07,
      chord: 0.42, taper: 0.25, sweep: 0.12, tip: 'slotted', fingers: 5, fingerLen: 0.24,
      tailLen: 0.22, tailWidth: 0.16, tail: 'fan', beak: 'hook', beakLen: 0.035, legs: 'tucked', legLen: 0.09, dihedral: 0.09,
    },
    flight: { massKg: 1.1, cruise: 13, stall: 6.5, maxDive: 55, glideRatio: 13, flapHz: 2.7, flapPower: 6, climb: 1, soarer: true },
    palettes: [
      { ...base, name: 'Light morph', head: '#7a5636', throat: '#f2ebdd', breast: '#f4ecdd', belly: '#f0e5d1', back: '#64452b', coverts: '#7a5636', secondaries: '#654b35', primaries: '#3d2c1f', underCoverts: '#f1e7d6', underFlight: '#ece6dd', tail: '#c0592e', tailUnder: '#ecceba', beak: '#2e2a28', bellyBand: 0.6, patagial: 0.9, trailingEdge: 0.7, wingtipDark: 0.25, mottle: 0.6, tailBands: 1, tailBandColor: '#2a1d14' },
      { ...base, name: 'Rufous morph', head: '#5a3520', throat: '#c78a5a', breast: '#b9703f', belly: '#a65e34', back: '#4a2e1c', coverts: '#5a3822', secondaries: '#4a3424', primaries: '#30231a', underCoverts: '#9c5a34', underFlight: '#dcd2c6', tail: '#b0502a', tailUnder: '#d9a587', beak: '#2e2a28', bellyBand: 0.5, patagial: 0.6, trailingEdge: 0.8, wingtipDark: 0.3, mottle: 0.4, tailBands: 1, tailBandColor: '#2a1d14' },
      { ...base, name: 'Juvenile', head: '#6e5136', throat: '#efe6d8', breast: '#efe5d3', belly: '#e9dcc5', back: '#5e4430', coverts: '#73563a', secondaries: '#6a5038', primaries: '#4a3726', underCoverts: '#eadfcc', underFlight: '#e2dcd2', tail: '#7a6248', tailUnder: '#d8cfc2', beak: '#2e2a28', eye: '#c9b26a', bellyBand: 0.9, patagial: 0.8, trailingEdge: 0.3, wingtipDark: 0.2, mottle: 0.8, tailBands: 6, tailBandColor: '#3a2a1c' },
    ],
  },
  {
    id: 'raven',
    name: 'Common Raven',
    latin: 'Corvus corax',
    blurb: 'The unofficial mayor of Searchlight. Works the dumpsters behind Terrible\u2019s and McDonald\u2019s, then tumbles for fun over Duplex Hill.',
    facts: [
      'Ravens barrel-roll and fly upside down purely for play.',
      'They follow the highway at dawn for roadkill, and remember which cars feed them.',
      'Wedge-shaped tail and a deep, croaking gronk tell it from a crow at a glance.',
    ],
    call: 'croak',
    shape: {
      wingspan: 1.2, length: 0.62, bodyWidth: 0.13, bodyDepth: 0.14, neckLen: 0.04, headSize: 0.07,
      chord: 0.36, taper: 0.3, sweep: 0.1, tip: 'slotted', fingers: 5, fingerLen: 0.2,
      tailLen: 0.25, tailWidth: 0.13, tail: 'wedge', beak: 'corvid', beakLen: 0.075, legs: 'tucked', legLen: 0.1, dihedral: 0.05,
    },
    flight: { massKg: 1.2, cruise: 12, stall: 5.5, maxDive: 50, glideRatio: 11, flapHz: 3.0, flapPower: 7, climb: 1.3, soarer: true },
    palettes: [
      { ...base, name: 'Adult', head: '#121216', throat: '#141418', breast: '#131317', belly: '#121216', back: '#14141a', coverts: '#15151c', secondaries: '#121218', primaries: '#0f0f13', underCoverts: '#111115', underFlight: '#2a2a2e', tail: '#121217', tailUnder: '#18181c', beak: '#0c0c0e', cere: '#0c0c0e', legs: '#141414', eye: '#140e0a', gloss: 1, mottle: 0.15 },
    ],
  },
  {
    id: 'goldeneagle',
    name: 'Golden Eagle',
    latin: 'Aquila chrysaetos',
    blurb: 'Patrols the crest of the Newberry Mountains and Spirit Mountain on two-metre wings, scanning for jackrabbits and bighorn lambs.',
    facts: [
      'Can dive at over 240 km/h onto jackrabbits in the creosote flats.',
      'The golden hackles on the nape catch low sun like burnished bronze.',
      'Nests on cliff ledges in the volcanic canyons of the Eldorado Mountains.',
    ],
    call: 'kek',
    shape: {
      wingspan: 2.05, length: 0.86, bodyWidth: 0.22, bodyDepth: 0.24, neckLen: 0.04, headSize: 0.1,
      chord: 0.4, taper: 0.2, sweep: 0.1, tip: 'slotted', fingers: 6, fingerLen: 0.26,
      tailLen: 0.34, tailWidth: 0.22, tail: 'square', beak: 'hook', beakLen: 0.06, legs: 'tucked', legLen: 0.14, dihedral: 0.06,
    },
    flight: { massKg: 4.5, cruise: 17, stall: 8, maxDive: 70, glideRatio: 15, flapHz: 1.9, flapPower: 5, climb: 0.8, soarer: true },
    palettes: [
      { ...base, name: 'Adult', head: '#c08a3e', throat: '#3a2618', breast: '#3a2718', belly: '#34231a', back: '#3e2a1c', coverts: '#6a4a2c', secondaries: '#3a2a1e', primaries: '#21170f', underCoverts: '#33241a', underFlight: '#4a3b30', tail: '#3e3024', tailUnder: '#5a4a3c', beak: '#3a3532', cere: '#e8c050', mottle: 0.5, tailBands: 3, tailBandColor: '#26190f', trailingEdge: 0.4 },
      { ...base, name: 'Juvenile (white patches)', head: '#b98238', throat: '#3a2618', breast: '#3a2718', belly: '#34231a', back: '#3a281b', coverts: '#4e3622', secondaries: '#3a2a1e', primaries: '#21170f', underCoverts: '#30211a', underFlight: '#3e3128', tail: '#f0ebe2', tailUnder: '#f0ebe2', beak: '#3a3532', cere: '#e8c050', wingPanel: 0.9, tailBands: 1, tailBandColor: '#1e150e', mottle: 0.2 },
    ],
  },
  {
    id: 'vulture',
    name: 'Turkey Vulture',
    latin: 'Cathartes aura',
    blurb: 'Teeters in a deep V over US-95 for hours without a single wingbeat, riding the heat off the asphalt.',
    facts: [
      'One of the few birds with a keen sense of smell; it can find carrion hidden under a creosote bush.',
      'Leaves the Mojave in October and streams south in kettles of hundreds.',
      'Spreads its wings to the morning sun on the Searchlight water tower to warm up.',
    ],
    call: 'hiss',
    shape: {
      wingspan: 1.75, length: 0.7, bodyWidth: 0.17, bodyDepth: 0.17, neckLen: 0.05, headSize: 0.06,
      chord: 0.36, taper: 0.15, sweep: 0.06, tip: 'slotted', fingers: 6, fingerLen: 0.25,
      tailLen: 0.27, tailWidth: 0.15, tail: 'fan', beak: 'vulture', beakLen: 0.04, legs: 'tucked', legLen: 0.1, dihedral: 0.26,
    },
    flight: { massKg: 1.6, cruise: 12, stall: 5.5, maxDive: 40, glideRatio: 16, flapHz: 1.8, flapPower: 4, climb: 0.7, soarer: true },
    palettes: [
      { ...base, name: 'Adult', head: '#b8362a', throat: '#2a2220', breast: '#251d19', belly: '#221b18', back: '#2b211c', coverts: '#3a2c22', secondaries: '#2b231f', primaries: '#221c19', underCoverts: '#1e1816', underFlight: '#b9b4ae', tail: '#26201c', tailUnder: '#a8a29b', beak: '#efe6d6', cere: '#d9c9b4', legs: '#d8c3b0', skin: '#b8362a', skinHead: 1, mottle: 0.4 },
      { ...base, name: 'Juvenile (grey head)', head: '#4b4440', throat: '#2a2220', breast: '#251d19', belly: '#221b18', back: '#2b211c', coverts: '#33271f', secondaries: '#2b231f', primaries: '#221c19', underCoverts: '#1e1816', underFlight: '#aca69f', tail: '#26201c', tailUnder: '#9c968f', beak: '#3a3532', cere: '#3a3532', legs: '#d8c3b0', skin: '#4b4440', skinHead: 1, mottle: 0.6 },
    ],
  },
  {
    id: 'prairiefalcon',
    name: 'Prairie Falcon',
    latin: 'Falco mexicanus',
    blurb: 'A pale, sand-coloured falcon that nests in the cliffs of the Highland Range and screams low across the bajada after doves.',
    facts: [
      'Black "armpits" give it away from below.',
      'Hugs the ground on the attack, using every wash and rise for cover.',
      'Its colour is a near-perfect match for Mojave caliche and granite.',
    ],
    call: 'kek',
    shape: {
      wingspan: 1.0, length: 0.42, bodyWidth: 0.11, bodyDepth: 0.12, neckLen: 0.01, headSize: 0.055,
      chord: 0.32, taper: 0.85, sweep: 0.38, tip: 'pointed', fingers: 0, fingerLen: 0,
      tailLen: 0.18, tailWidth: 0.1, tail: 'square', beak: 'falcon', beakLen: 0.025, legs: 'tucked', legLen: 0.06, dihedral: 0.02,
    },
    flight: { massKg: 0.7, cruise: 16, stall: 8, maxDive: 85, glideRatio: 11, flapHz: 4.2, flapPower: 9, climb: 1.4 },
    palettes: [
      { ...base, name: 'Adult', head: '#a3825e', throat: '#f2ebe0', breast: '#efe4d4', belly: '#ece0cd', back: '#957656', coverts: '#a08262', secondaries: '#8e7054', primaries: '#6a5440', underCoverts: '#2e241c', underFlight: '#ddd2c4', tail: '#a08466', tailUnder: '#e2d6c6', beak: '#4c5058', cere: '#e8c84a', barring: 0.45, helmet: 0.5, mottle: 0.5, tailBands: 5, tailBandColor: '#6a5440' },
    ],
  },
  {
    id: 'kestrel',
    name: 'American Kestrel',
    latin: 'Falco sparverius',
    blurb: 'A jewel of a falcon that hovers over the roadside on US-95 and perches on the wires along Cottonwood Cove Road.',
    facts: [
      'North America\u2019s smallest falcon, barely heavier than a robin.',
      'Can see ultraviolet light, so it tracks rodents by the glow of their urine trails.',
      'Bobs its tail nervously whenever it lands on a wire.',
    ],
    call: 'kek',
    shape: {
      wingspan: 0.56, length: 0.26, bodyWidth: 0.07, bodyDepth: 0.075, neckLen: 0.01, headSize: 0.04,
      chord: 0.32, taper: 0.8, sweep: 0.32, tip: 'pointed', fingers: 0, fingerLen: 0,
      tailLen: 0.12, tailWidth: 0.065, tail: 'square', beak: 'falcon', beakLen: 0.015, legs: 'tucked', legLen: 0.04, dihedral: 0.04,
    },
    flight: { massKg: 0.12, cruise: 10, stall: 4.2, maxDive: 50, glideRatio: 9, flapHz: 6, flapPower: 10, climb: 1.6, hover: true },
    palettes: [
      { ...base, name: 'Male', head: '#7c8aa6', throat: '#f4eee4', breast: '#f0d6b4', belly: '#f3e6d2', back: '#c4673a', coverts: '#7d8cab', secondaries: '#6f7d99', primaries: '#2a2a30', underCoverts: '#f2e6d4', underFlight: '#e6e0d8', tail: '#c9673a', tailUnder: '#e4b48e', beak: '#3c4250', cere: '#f0c440', helmet: 0.7, wingtipDark: 0.3, tailBands: 1, tailBandColor: '#1a1a1c', mottle: 0.35, crown: 0.8, skin: '#c4673a' },
      { ...base, name: 'Female', head: '#8c94a4', throat: '#f4eee4', breast: '#e8c7a4', belly: '#efdcc2', back: '#b8673e', coverts: '#b4663e', secondaries: '#a45d38', primaries: '#3a2e28', underCoverts: '#efdcc2', underFlight: '#e2dad0', tail: '#b8673e', tailUnder: '#dcb08e', beak: '#3c4250', cere: '#f0c440', helmet: 0.7, barring: 0.5, tailBands: 8, tailBandColor: '#2c2420', mottle: 0.6 },
    ],
  },
  {
    id: 'roadrunner',
    name: 'Greater Roadrunner',
    latin: 'Geococcyx californianus',
    blurb: 'Sprints across Main Street and the dirt lots behind the motels at 30 km/h. Flies only when it must, in short, low glides.',
    facts: [
      'Fast enough to catch and eat rattlesnakes, slamming them against rocks.',
      'Warms up on cold desert mornings by turning a patch of black skin on its back to the sun.',
      'Real roadrunners coo like a dove; the cartoon "meep meep" is pure Hollywood.',
    ],
    call: 'coo',
    shape: {
      wingspan: 0.56, length: 0.56, bodyWidth: 0.08, bodyDepth: 0.085, neckLen: 0.05, headSize: 0.05,
      chord: 0.44, taper: 0.2, sweep: 0.04, tip: 'rounded', fingers: 0, fingerLen: 0,
      tailLen: 0.28, tailWidth: 0.08, tail: 'wedge', beak: 'corvid', beakLen: 0.05, legs: 'trailing', legLen: 0.16, dihedral: 0.02, crest: 0.9,
    },
    flight: { massKg: 0.33, cruise: 9, stall: 5, maxDive: 30, glideRatio: 5, flapHz: 5, flapPower: 7, climb: 1.2 },
    palettes: [
      { ...base, name: 'Adult', head: '#3a3026', throat: '#e8dcc6', breast: '#c9b28c', belly: '#ece2cf', back: '#5a4732', coverts: '#5e4a34', secondaries: '#4e3d2c', primaries: '#2e251c', underCoverts: '#d6c7ac', underFlight: '#b9ab96', tail: '#3e3a36', tailUnder: '#6a6056', beak: '#2a2622', cere: '#2a2622', legs: '#7a8a96', eye: '#e8c88a', skin: '#3a7ac4', mottle: 1, barring: 0.25, tailBands: 1, tailBandColor: '#f0ebe2' },
    ],
  },
  {
    id: 'quail',
    name: 'Gambel\u2019s Quail',
    latin: 'Callipepla gambelii',
    blurb: 'Coveys scurry under the creosote at the edge of town, then burst into flight with a whirr of wings and glide to cover.',
    facts: [
      'The bobbing teardrop topknot is made of six overlapping feathers.',
      'Its "chi-CA-go-go" rally call gathers a scattered covey back together.',
      'Can survive the summer on the moisture in seeds and green plants alone.',
    ],
    call: 'quail',
    shape: {
      wingspan: 0.36, length: 0.26, bodyWidth: 0.1, bodyDepth: 0.1, neckLen: 0.01, headSize: 0.045,
      chord: 0.5, taper: 0.2, sweep: 0.04, tip: 'rounded', fingers: 0, fingerLen: 0,
      tailLen: 0.08, tailWidth: 0.07, tail: 'fan', beak: 'seed', beakLen: 0.012, legs: 'tucked', legLen: 0.05, dihedral: 0.05, crest: 1,
    },
    flight: { massKg: 0.17, cruise: 11, stall: 6, maxDive: 30, glideRatio: 4, flapHz: 14, flapPower: 12, climb: 1.4 },
    palettes: [
      { ...base, name: 'Male', head: '#7a3a24', throat: '#1a1714', breast: '#8c8e92', belly: '#efe2c4', back: '#8a8a8e', coverts: '#86878b', secondaries: '#7c7a78', primaries: '#6a645e', underCoverts: '#cfc7b8', underFlight: '#b0aaa2', tail: '#7c7c80', tailUnder: '#8c8a88', beak: '#1e1c1a', cere: '#1e1c1a', legs: '#6e6a62', skin: '#7a3a24', crown: 1, helmet: 0.6, bellyBand: 0.7, mottle: 0.4 },
      { ...base, name: 'Female', head: '#8c8a88', throat: '#b8b0a2', breast: '#8e8e90', belly: '#e6dcc6', back: '#8c8a8a', coverts: '#86858a', secondaries: '#7c7a78', primaries: '#6a645e', underCoverts: '#cfc7b8', underFlight: '#b0aaa2', tail: '#7c7c80', tailUnder: '#8c8a88', beak: '#1e1c1a', cere: '#1e1c1a', legs: '#6e6a62', mottle: 0.5 },
    ],
  },
  {
    id: 'hornedowl',
    name: 'Great Horned Owl',
    latin: 'Bubo virginianus',
    blurb: 'Hoots from the old headframes of the Searchlight mines at dusk and hunts the washes under the stars and the glow of Vegas.',
    facts: [
      'The "horns" are just feather tufts; its hearing comes from offset ears hidden under the disk.',
      'Strong enough to take skunks, rabbits and even other owls.',
      'Often nests in abandoned mine shafts and old raven nests.',
    ],
    call: 'hoot',
    shape: {
      wingspan: 1.25, length: 0.55, bodyWidth: 0.18, bodyDepth: 0.19, neckLen: 0.01, headSize: 0.1,
      chord: 0.44, taper: 0.3, sweep: 0.06, tip: 'rounded', fingers: 0, fingerLen: 0,
      tailLen: 0.2, tailWidth: 0.15, tail: 'fan', beak: 'owl', beakLen: 0.022, legs: 'tucked', legLen: 0.11, dihedral: 0.03, disk: true, tufts: 0.75,
    },
    flight: { massKg: 1.4, cruise: 10, stall: 4.5, maxDive: 35, glideRatio: 10, flapHz: 2.4, flapPower: 7, climb: 1, nocturnal: true },
    palettes: [
      { ...base, name: 'Desert pale', head: '#8a7258', throat: '#efe8da', breast: '#c4ae8e', belly: '#d8c8ac', back: '#7a6450', coverts: '#86705a', secondaries: '#806a54', primaries: '#6e5a48', underCoverts: '#d4c2a2', underFlight: '#c8b8a0', tail: '#806a54', tailUnder: '#c4b49c', beak: '#2a2622', cere: '#2a2622', legs: '#d4c4a8', eye: '#f0b828', mottle: 0.9, barring: 0.7, tailBands: 6, tailBandColor: '#4a3c30' },
    ],
  },
  {
    id: 'burrowingowl',
    name: 'Burrowing Owl',
    latin: 'Athene cunicularia',
    blurb: 'A long-legged little owl that bobs at the mouth of an old tortoise burrow by the airstrip and hunts beetles under the streetlights.',
    facts: [
      'Lines its burrow with dung to attract dung beetles, its favourite snack.',
      'Mimics a rattlesnake\u2019s buzz to scare off anything poking into its burrow.',
      'Active by day as well as night, unlike most owls.',
    ],
    call: 'coo',
    shape: {
      wingspan: 0.55, length: 0.24, bodyWidth: 0.09, bodyDepth: 0.1, neckLen: 0.01, headSize: 0.06,
      chord: 0.42, taper: 0.3, sweep: 0.06, tip: 'rounded', fingers: 0, fingerLen: 0,
      tailLen: 0.08, tailWidth: 0.08, tail: 'square', beak: 'owl', beakLen: 0.012, legs: 'trailing', legLen: 0.09, dihedral: 0.03, disk: true,
    },
    flight: { massKg: 0.16, cruise: 8, stall: 3.6, maxDive: 28, glideRatio: 8, flapHz: 5, flapPower: 9, climb: 1.3, hover: true },
    palettes: [
      { ...base, name: 'Adult', head: '#8e7458', throat: '#f2ebdd', breast: '#a68a6a', belly: '#efe4d2', back: '#866c52', coverts: '#8c7258', secondaries: '#806850', primaries: '#6c5844', underCoverts: '#e6dac4', underFlight: '#d8ccb8', tail: '#806850', tailUnder: '#d6cab4', beak: '#d8cfa8', cere: '#d8cfa8', legs: '#b8b0a0', eye: '#f2d22a', mottle: 1, barring: 0.6, tailBands: 4, tailBandColor: '#efe4d2' },
    ],
  },
  {
    id: 'nighthawk',
    name: 'Lesser Nighthawk',
    latin: 'Chordeiles acutipennis',
    blurb: 'Flutters moth-like over the parking lot lights at Terrible\u2019s on summer nights, scooping insects with an enormous gape.',
    facts: [
      'Not a hawk at all but a nightjar, kin to the whip-poor-will.',
      'Rests flat on the warm desert pavement by day, all but invisible.',
      'Its soft trilling purr rolls out of the dusk all summer long.',
    ],
    call: 'trill',
    shape: {
      wingspan: 0.56, length: 0.22, bodyWidth: 0.06, bodyDepth: 0.06, neckLen: 0.0, headSize: 0.04,
      chord: 0.3, taper: 0.88, sweep: 0.3, tip: 'pointed', fingers: 0, fingerLen: 0,
      tailLen: 0.1, tailWidth: 0.07, tail: 'notched', beak: 'gape', beakLen: 0.006, legs: 'tucked', legLen: 0.015, dihedral: 0.12,
    },
    flight: { massKg: 0.05, cruise: 8, stall: 3.5, maxDive: 30, glideRatio: 8, flapHz: 5.5, flapPower: 10, climb: 1.9, nocturnal: true },
    palettes: [
      { ...base, name: 'Adult', head: '#7a6a58', throat: '#efe6d6', breast: '#8a7864', belly: '#c8b89e', back: '#6e5e4e', coverts: '#7c6c5a', secondaries: '#5e5044', primaries: '#3e342c', underCoverts: '#a8987e', underFlight: '#6a5e52', tail: '#6a5a4a', tailUnder: '#8a7a68', beak: '#2a2622', cere: '#2a2622', legs: '#5a4e44', mottle: 1, barring: 0.6, wingPanel: 0.9, tailBands: 5, tailBandColor: '#3a3028' },
    ],
  },
  {
    id: 'swift',
    name: 'White-throated Swift',
    latin: 'Aeronautes saxatalis',
    blurb: 'Screams in tight packs along the cliffs of Eldorado Canyon and through the narrows of Christmas Tree Pass.',
    facts: [
      'Among the fastest small birds on the continent, clocked near 300 km/h in display.',
      'Mates in mid-air, tumbling together for hundreds of metres.',
      'Roosts in deep rock crevices, clinging to the vertical stone.',
    ],
    call: 'trill',
    shape: {
      wingspan: 0.36, length: 0.17, bodyWidth: 0.045, bodyDepth: 0.045, neckLen: 0.0, headSize: 0.03,
      chord: 0.26, taper: 0.92, sweep: 0.6, tip: 'pointed', fingers: 0, fingerLen: 0,
      tailLen: 0.07, tailWidth: 0.045, tail: 'notched', beak: 'gape', beakLen: 0.004, legs: 'tucked', legLen: 0.01, dihedral: 0.02,
    },
    flight: { massKg: 0.032, cruise: 15, stall: 6, maxDive: 75, glideRatio: 9, flapHz: 9, flapPower: 14, climb: 2.1 },
    palettes: [
      { ...base, name: 'Adult', head: '#2a2622', throat: '#f2efe8', breast: '#efece4', belly: '#f0ede6', back: '#26221e', coverts: '#2a2622', secondaries: '#24201c', primaries: '#1c1a18', underCoverts: '#26221e', underFlight: '#3a3632', tail: '#24201c', tailUnder: '#2e2a26', beak: '#1a1816', cere: '#1a1816', legs: '#1a1816', rump: 0.0 },
    ],
  },
  {
    id: 'hummingbird',
    name: 'Costa\u2019s Hummingbird',
    latin: 'Calypte costae',
    blurb: 'A tiny desert hummer with a flared violet gorget, zipping between the ocotillo blooms and the feeders in Searchlight backyards.',
    facts: [
      'Wings beat around 50 times a second; it can fly backwards and upside down.',
      'Drops into torpor on cold nights, cooling its body to save energy.',
      'The male dives in a looping U-shaped display, whistling at the bottom.',
    ],
    call: 'trill',
    shape: {
      wingspan: 0.115, length: 0.085, bodyWidth: 0.022, bodyDepth: 0.022, neckLen: 0.0, headSize: 0.016,
      chord: 0.28, taper: 0.8, sweep: 0.3, tip: 'pointed', fingers: 0, fingerLen: 0,
      tailLen: 0.025, tailWidth: 0.02, tail: 'fan', beak: 'needle', beakLen: 0.018, legs: 'tucked', legLen: 0.004, dihedral: 0.02,
    },
    flight: { massKg: 0.003, cruise: 9, stall: 2, maxDive: 26, glideRatio: 3, flapHz: 40, flapPower: 16, climb: 2.4, hover: true },
    palettes: [
      { ...base, name: 'Male', head: '#4a1e6e', throat: '#5a1c8a', breast: '#d8d6cc', belly: '#c8ccb8', back: '#4e6a3a', coverts: '#4e6a3a', secondaries: '#2e2e2a', primaries: '#262624', underCoverts: '#8a9070', underFlight: '#3a3a36', tail: '#3a4a2e', tailUnder: '#4a4a40', beak: '#141414', cere: '#141414', legs: '#141414', skin: '#6a1ea0', gloss: 0.9, helmet: 0.0, crown: 1 },
    ],
  },
  {
    id: 'osprey',
    name: 'Osprey',
    latin: 'Pandion haliaetus',
    blurb: 'Hovers over the coves of Lake Mohave below Cottonwood Cove, then plunges feet-first for striped bass.',
    facts: [
      'The only hawk that dives fully underwater after fish.',
      'Reversible outer toes and spiny foot pads let it grip slippery prey.',
      'Carries its catch head-first, streamlined like a torpedo.',
    ],
    call: 'chitter',
    shape: {
      wingspan: 1.6, length: 0.58, bodyWidth: 0.15, bodyDepth: 0.16, neckLen: 0.02, headSize: 0.07,
      chord: 0.3, taper: 0.4, sweep: 0.25, tip: 'slotted', fingers: 4, fingerLen: 0.2,
      tailLen: 0.21, tailWidth: 0.13, tail: 'square', beak: 'hook', beakLen: 0.04, legs: 'tucked', legLen: 0.11, dihedral: 0.08,
    },
    flight: { massKg: 1.6, cruise: 14, stall: 6.5, maxDive: 60, glideRatio: 13, flapHz: 2.6, flapPower: 6, climb: 1, soarer: true, swimmer: true, hover: true },
    palettes: [
      { ...base, name: 'Adult', head: '#f2efe8', throat: '#f5f2ec', breast: '#efe9de', belly: '#f6f3ee', back: '#3a2e24', coverts: '#40342a', secondaries: '#3a3028', primaries: '#221c18', underCoverts: '#f3efe8', underFlight: '#d8d2c8', tail: '#4a3e34', tailUnder: '#dcd4c8', beak: '#1e1e20', cere: '#5a6670', legs: '#c8d0cc', eye: '#e8d050', helmet: 0.8, carpal: 0.8, tailBands: 6, tailBandColor: '#3a2e24', barring: 0.15, wingtipDark: 0.3 },
    ],
  },
  {
    id: 'baldeagle',
    name: 'Bald Eagle',
    latin: 'Haliaeetus leucocephalus',
    blurb: 'A winter visitor to Lake Mohave, perching on the canyon walls above the coves and fishing the open water.',
    facts: [
      'Wintering bald eagles often steal fish from ospreys mid-air.',
      'Takes five years to grow the iconic white head and tail.',
      'Lake Mohave\u2019s cold, clear water below Hoover Dam keeps fish near the surface all winter.',
    ],
    call: 'chitter',
    shape: {
      wingspan: 2.03, length: 0.9, bodyWidth: 0.23, bodyDepth: 0.25, neckLen: 0.06, headSize: 0.1,
      chord: 0.42, taper: 0.15, sweep: 0.06, tip: 'slotted', fingers: 6, fingerLen: 0.24,
      tailLen: 0.3, tailWidth: 0.2, tail: 'wedge', beak: 'hook', beakLen: 0.075, legs: 'tucked', legLen: 0.14, dihedral: 0.03,
    },
    flight: { massKg: 4.7, cruise: 16, stall: 8, maxDive: 60, glideRatio: 14, flapHz: 2.0, flapPower: 5, climb: 0.8, soarer: true },
    palettes: [
      { ...base, name: 'Adult', head: '#f6f4ef', throat: '#f3f1ec', breast: '#2a1d14', belly: '#26190f', back: '#2c1f15', coverts: '#3a2a1c', secondaries: '#2a1f16', primaries: '#1c140e', underCoverts: '#24170f', underFlight: '#2c241e', tail: '#f5f3ee', tailUnder: '#f2f0eb', beak: '#f0c23a', cere: '#f0c23a', eye: '#e8d48a', mottle: 0.3 },
      { ...base, name: 'Immature (mottled)', head: '#3a2c20', throat: '#4a3a2c', breast: '#5c4632', belly: '#d8c8b0', back: '#4a3624', coverts: '#5c4530', secondaries: '#3a2c20', primaries: '#22180f', underCoverts: '#d6c6ae', underFlight: '#6a5a4a', tail: '#a69684', tailUnder: '#c8b8a2', beak: '#3a3532', cere: '#8a8274', eye: '#7a5a3a', mottle: 0.9, barring: 0.2 },
    ],
  },
  {
    id: 'heron',
    name: 'Great Blue Heron',
    latin: 'Ardea herodias',
    blurb: 'Stalks the tamarisk shallows of Lake Mohave and flaps slowly up the coves with its neck folded and legs trailing.',
    facts: [
      'Stands well over a metre tall but weighs barely two kilos.',
      'Hunts at night as well as day, thanks to eyes rich in rod cells.',
      'Its prehistoric croak echoes off the canyon walls at dawn.',
    ],
    call: 'squawk',
    shape: {
      wingspan: 1.8, length: 1.15, bodyWidth: 0.14, bodyDepth: 0.15, neckLen: 0.09, headSize: 0.055,
      chord: 0.38, taper: 0.2, sweep: 0.05, tip: 'rounded', fingers: 0, fingerLen: 0,
      tailLen: 0.15, tailWidth: 0.12, tail: 'fan', beak: 'spear', beakLen: 0.14, legs: 'trailing', legLen: 0.6, dihedral: 0.0,
    },
    flight: { massKg: 2.2, cruise: 11, stall: 5, maxDive: 35, glideRatio: 10, flapHz: 2.0, flapPower: 6, climb: 0.8, swimmer: true },
    palettes: [
      { ...base, name: 'Adult', head: '#f0ede6', throat: '#ece8e0', breast: '#9a9ea4', belly: '#6a6e74', back: '#7c8a98', coverts: '#8492a0', secondaries: '#5e6a78', primaries: '#2e3238', underCoverts: '#6c727a', underFlight: '#4e545c', tail: '#6e7884', tailUnder: '#5e6670', beak: '#d8b040', cere: '#a8a868', legs: '#6a5c48', eye: '#e8d040', helmet: 0.5, mottle: 0.3, wingtipDark: 0.35 },
    ],
  },
];

export function speciesById(id: string): Species {
  return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
}
