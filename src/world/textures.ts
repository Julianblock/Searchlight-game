import * as THREE from 'three';
import type { HeightGrid, Pixels, WorldData } from './loader';
import { LC } from './meta';

export interface WorldTextures {
  /** Inner region heights in the top half, Laughlin in the bottom half. */
  heightDetail: THREE.DataTexture;
  heightMid: THREE.DataTexture;
  heightFar: THREE.DataTexture;
  /** Inner region photo on top, Laughlin below. */
  imgDetail: THREE.Texture;
  imgMid: THREE.Texture;
  imgFar: THREE.Texture;
  /** R creosote / galleta flats, G Joshua tree belt, B blackbrush & pinyon, A open water */
  maskA: THREE.DataTexture;
  /** R sandy wash, G bare rock, B town, A green (tamarisk shore, lawns, alfalfa) */
  maskB: THREE.DataTexture;
  canopy: THREE.DataTexture;
}

function heightTexture(...grids: HeightGrid[]): THREE.DataTexture {
  const res = grids[0].res;
  const n = res * res;
  const data = new Float32Array(n * 2 * grids.length);
  grids.forEach((g, k) => {
    if (g.res !== res) throw new Error('Stacked height grids must share a resolution');
    for (let i = 0; i < n; i++) {
      data[(k * n + i) * 2] = g.heights[i];
      data[(k * n + i) * 2 + 1] = g.ao[i];
    }
  });
  const t = new THREE.DataTexture(data, res, res * grids.length, THREE.RGFormat, THREE.FloatType);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Stacks equally sized photos top to bottom in one canvas. */
function stackImages(bmps: ImageBitmap[]): OffscreenCanvas {
  const { width, height } = bmps[0];
  const canvas = new OffscreenCanvas(width, height * bmps.length);
  const ctx = canvas.getContext('2d')!;
  bmps.forEach((b, k) => ctx.drawImage(b, 0, k * height, width, height));
  return canvas;
}

function imageTexture(bmp: ImageBitmap | OffscreenCanvas, anisotropy: number): THREE.Texture {
  const t = new THREE.Texture(bmp as unknown as HTMLImageElement);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = anisotropy;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

function maskTextures(lc: Pixels): [THREE.DataTexture, THREE.DataTexture] {
  const n = lc.width * lc.height;
  const a = new Uint8Array(n * 4);
  const b = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = lc.data[i * 4];
    const o = i * 4;
    a[o] = c === LC.CREOSOTE || c === LC.GRASS || c === LC.OTHER ? 255 : 0;
    a[o + 1] = c === LC.JOSHUA ? 255 : 0;
    a[o + 2] = c === LC.BLACKBRUSH || c === LC.PINYON ? 255 : 0;
    a[o + 3] = c === LC.WATER ? 255 : 0;
    b[o] = c === LC.WASH ? 255 : 0;
    b[o + 1] = c === LC.ROCK ? 255 : 0;
    b[o + 2] = c >= LC.URBAN_OPEN && c <= LC.URBAN_HIGH ? 255 : 0;
    b[o + 3] = c === LC.WETLAND || c === LC.FARM ? 255 : 0;
  }
  const make = (d: Uint8Array) => {
    const t = new THREE.DataTexture(d, lc.width, lc.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return [make(a), make(b)];
}

export function createWorldTextures(world: WorldData, renderer: THREE.WebGLRenderer): WorldTextures {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const [maskA, maskB] = maskTextures(world.landcover);
  const cd = new Uint8Array(world.canopy.width * world.canopy.height);
  for (let i = 0; i < cd.length; i++) cd[i] = world.canopy.data[i * 4];
  const canopy = new THREE.DataTexture(cd, world.canopy.width, world.canopy.height, THREE.RedFormat, THREE.UnsignedByteType);
  canopy.minFilter = canopy.magFilter = THREE.LinearFilter;
  canopy.needsUpdate = true;
  return {
    heightDetail: heightTexture(world.heights.inner, world.heights.laughlin),
    heightMid: heightTexture(world.heights.mid),
    heightFar: heightTexture(world.heights.far),
    imgDetail: imageTexture(stackImages([world.imagery.inner, world.imagery.laughlin]), aniso),
    imgMid: imageTexture(world.imagery.mid, aniso),
    imgFar: imageTexture(world.imagery.far, aniso),
    maskA,
    maskB,
    canopy,
  };
}
