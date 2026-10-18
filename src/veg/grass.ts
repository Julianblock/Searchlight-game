import * as THREE from 'three';
import { G } from '../render/globals';
import { grassFragment, grassVertex } from '../render/shaders/grassShader';
import { seasonUniforms } from '../render/terrain';
import type { Heightfield } from '../world/heightfield';
import { lowPower } from '../ui/device';

const BLADES = 7;

function clumpGeometry(): THREE.InstancedBufferGeometry {
  // Tapered blade: three segments narrowing to a point.
  const rows = [
    [0, 1],
    [0.3, 0.9],
    [0.58, 0.72],
    [0.82, 0.45],
  ];
  const pos: number[] = [];
  const blade: number[] = [];
  const index: number[] = [];
  for (let b = 0; b < BLADES; b++) {
    const o = pos.length / 3;
    for (const [y, w] of rows) {
      pos.push(-0.5 * w, y, 0, 0.5 * w, y, 0);
      blade.push(b, b);
    }
    pos.push(0, 1, 0);
    blade.push(b);
    for (let r = 0; r < rows.length - 1; r++) {
      const a = o + r * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const a = o + (rows.length - 1) * 2;
    index.push(a, a + 1, a + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 1));
  g.setIndex(index);
  return g;
}

/** Height of the annuals by month (m): brome sprouts after winter rain, cures by May, then wind and sun wear it down. */
const SWARD = [0.07, 0.1, 0.15, 0.2, 0.2, 0.17, 0.14, 0.12, 0.11, 0.09, 0.07, 0.06];
/** Share of grasses carrying seed heads by month (red brome, galleta, needlegrass). */
const SEED = [0, 0, 0.05, 0.35, 0.85, 1, 0.8, 0.6, 0.5, 0.3, 0.1, 0];

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  spacing: number;
  n: number;
}

/**
 * Desert ground cover between the shrubs: galleta tufts, red brome and spring
 * wildflowers, drawn in two camera-centred rings snapped to a world grid so
 * clumps stay put as the camera moves.
 */
export class Grass {
  readonly group = new THREE.Group();
  private rings: Ring[] = [];
  private hf: Heightfield;
  private car = { value: new THREE.Vector4() };
  maxAgl = 160;

  constructor(terrainUniforms: Record<string, THREE.IUniform>, hf: Heightfield) {
    this.hf = hf;
    const geo = clumpGeometry();
    const shared = {
      uHInner: terrainUniforms.uHInner,
      uHMid: terrainUniforms.uHMid,
      uHFar: terrainUniforms.uHFar,
      uImgInner: terrainUniforms.uImgInner,
      uImgMid: terrainUniforms.uImgMid,
      uMaskA: terrainUniforms.uMaskA,
      uMaskB: terrainUniforms.uMaskB,
      uRegionSize: terrainUniforms.uRegionSize,
      uLcSize: terrainUniforms.uLcSize,
      uVeg: seasonUniforms.uVeg,
      uDesert: seasonUniforms.uDesert,
      uCar: this.car,
    };
    // Inner: fine clumps to ~55 m. Outer: coarse, wider-bladed clumps to ~120 m.
    const specs = [
      ...(lowPower
        ? [
            { spacing: 0.5, n: 150, fadeIn: [-1, 0], fadeOut: [26, 36] },
            { spacing: 1.6, n: 110, fadeIn: [26, 36], fadeOut: [64, 86] },
          ]
        : [
            { spacing: 0.38, n: 250, fadeIn: [-1, 0], fadeOut: [35, 47] },
            { spacing: 1.25, n: 190, fadeIn: [35, 47], fadeOut: [88, 118] },
          ]),
    ];
    for (const s of specs) {
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: grassVertex,
        fragmentShader: grassFragment,
        uniforms: {
          ...G,
          ...shared,
          uOrigin: { value: new THREE.Vector2() },
          uSpacing: { value: s.spacing },
          uN: { value: s.n },
          uFadeIn: { value: new THREE.Vector2(...s.fadeIn) },
          uFadeOut: { value: new THREE.Vector2(...s.fadeOut) },
          uGrassH: { value: 0.12 },
          uSeedHead: { value: 0 },
        },
        side: THREE.DoubleSide,
      });
      const g = geo.clone() as THREE.InstancedBufferGeometry;
      g.instanceCount = s.n * s.n;
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, spacing: s.spacing, n: s.n });
    }
  }

  /** Flattens ground cover under the player's truck. */
  setCar(x: number, z: number, psi: number, on: boolean) {
    this.car.value.set(x, z, on ? Math.sin(psi) : 0, on ? Math.cos(psi) : 0);
  }

  update(cam: THREE.Vector3, month: number) {
    const agl = cam.y - this.hf.height(cam.x, cam.z);
    const on = agl < this.maxAgl;
    const m = ((month % 12) + 12) % 12;
    const i = Math.floor(m);
    const h = THREE.MathUtils.lerp(SWARD[i], SWARD[(i + 1) % 12], m - i);
    const seed = THREE.MathUtils.lerp(SEED[i], SEED[(i + 1) % 12], m - i);
    for (const r of this.rings) {
      r.mesh.visible = on;
      r.mat.uniforms.uOrigin.value.set(Math.floor(cam.x / r.spacing) * r.spacing, Math.floor(cam.z / r.spacing) * r.spacing);
      r.mat.uniforms.uGrassH.value = h;
      r.mat.uniforms.uSeedHead.value = seed;
    }
  }
}
