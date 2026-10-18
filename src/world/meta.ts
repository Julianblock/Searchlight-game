export interface RegionSpec {
  size: number;
  heightRes: number;
  imageRes: number;
}

export interface HeightEncoding {
  offset: number;
  scale: number;
}

export type RegionName = 'inner' | 'mid' | 'far';

export interface WorldMeta {
  center: { lat: number; lon: number };
  regions: Record<RegionName, RegionSpec>;
  heightEncoding: Record<RegionName, HeightEncoding>;
  landcover: { size: number; res: number; classes: Record<string, number> };
  trees?: { size: number; count: number };
}

export const LC = {
  OTHER: 0,
  CREOSOTE: 1,
  JOSHUA: 2,
  BLACKBRUSH: 3,
  WASH: 4,
  GRASS: 5,
  WETLAND: 6,
  WATER: 7,
  URBAN_OPEN: 8,
  URBAN_LOW: 9,
  URBAN_MED: 10,
  URBAN_HIGH: 11,
  PINYON: 12,
  ROCK: 13,
  FARM: 14,
} as const;

export interface OsmRoad {
  name: string;
  kind: string;
  lanes: number;
  oneway?: number;
  /** OSM tracktype 1 (solid gravel) … 5 (faint two-rut), 0 when untagged. */
  grade?: number;
  pts: number[];
}

export interface OsmData {
  roads: OsmRoad[];
  waterways: { name: string; kind: string; pts: number[] }[];
  waterAreas: { name: string; pts: number[] }[];
  buildings: [number, number, number, number, number][];
  power: { pts: number[] }[];
  peaks: { name: string; x: number; z: number; ele: number | null }[];
  places: { name: string; x: number; z: number; kind: string }[];
  masts: { name: string; x: number; z: number; height: number | null }[];
  cemeteries: { name: string; pts: number[] }[];
  pois: OsmPoi[];
}

/** A point of interest: a business, mine, spring, memorial or viewpoint. */
export interface OsmPoi {
  name: string;
  /** fuel, fast_food, restaurant, casino, motel, mineshaft, spring, historic, … */
  kind: string;
  brand: string;
  x: number;
  z: number;
  /** Building footprint when mapped: width, depth, angle. */
  fp?: [number, number, number];
}
