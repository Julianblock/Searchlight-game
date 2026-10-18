import * as THREE from 'three';
import type { SignRect } from './signAtlas';

export const UP = new THREE.Vector3(0, 1, 0);
export const FX = { NONE: 0, NEON: 1, CHASE: 2, METAL: 3 } as const;

export interface Mat {
  rough?: number;
  glow?: number;
  fx?: number;
}

/** Merged, vertex-coloured solids for every landmark. */
export class SolidBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  private c = new THREE.Color();

  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: string, { rough = 0.8, glow = 0, fx = 0 }: Mat = {}, seed = 0) {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    this.c.set(color);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nrm.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.mat.push(rough, glow, fx, seed);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** Atlas-mapped sign faces. */
export class SignBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  rect: number[] = [];
  frames: number[] = [];
  col: number[] = [];
  mat: number[] = [];

  /** Quad centred on `c`, text running along `r`, `u` up; optionally readable from behind too. */
  quad(c: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3, w: number, h: number, s: SignRect, glow: number, fx: number, seed: number, both = false) {
    const face = (rr: THREE.Vector3) => {
      const n = new THREE.Vector3().crossVectors(rr, u).normalize();
      const o = c.clone().addScaledVector(n, 0.03);
      const corner = (a: number, b: number) => o.clone().addScaledVector(rr, a * w * 0.5).addScaledVector(u, b * h * 0.5);
      const verts: [THREE.Vector3, number, number][] = [
        [corner(-1, 1), 0, 0], [corner(-1, -1), 0, 1], [corner(1, -1), 1, 1],
        [corner(-1, 1), 0, 0], [corner(1, -1), 1, 1], [corner(1, 1), 1, 0],
      ];
      for (const [v, a, b] of verts) {
        this.pos.push(v.x, v.y, v.z);
        this.nrm.push(n.x, n.y, n.z);
        this.uv.push(a, b);
        this.rect.push(s.u0, s.v0, s.u1, s.v1);
        this.frames.push(s.frames);
        this.col.push(1, 1, 1);
        this.mat.push(0.5, glow, fx, seed);
      }
    };
    face(r);
    if (both) face(r.clone().negate());
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aRect', new THREE.Float32BufferAttribute(this.rect, 4));
    g.setAttribute('aFrames', new THREE.Float32BufferAttribute(this.frames, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** A landmark's local frame: x along the frontage, z out toward the road, origin on the ground. */
export class Frame {
  readonly o: THREE.Vector3;
  readonly f: THREE.Vector3;
  readonly r: THREE.Vector3;
  readonly basis: THREE.Matrix4;

  constructor(x: number, y: number, z: number, fx: number, fz: number) {
    this.o = new THREE.Vector3(x, y, z);
    this.f = new THREE.Vector3(fx, 0, fz).normalize();
    this.r = new THREE.Vector3().crossVectors(UP, this.f).normalize();
    this.basis = new THREE.Matrix4().makeBasis(this.r, UP, this.f).setPosition(this.o);
  }

  p(x: number, y: number, z: number) {
    return this.o.clone().addScaledVector(this.r, x).addScaledVector(UP, y).addScaledVector(this.f, z);
  }

  /** Matrix placing a geometry at local (x, y, z), turned `yaw` about the local vertical. */
  at(x: number, y: number, z: number, yaw = 0) {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    return this.basis.clone().multiply(m);
  }

  /** Local direction rotated by yaw, for sign faces. */
  dir(yaw: number) {
    const v = this.r.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(this.f, -Math.sin(yaw));
    return v.normalize();
  }
}
