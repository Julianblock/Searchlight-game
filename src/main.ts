import './style.css';
import './ui/ui.css';
import * as THREE from 'three';
import { Engine } from './render/engine';
import { Atmosphere } from './render/atmosphere';
import { G } from './render/globals';
import { Terrain } from './render/terrain';
import { TerrainShadow } from './render/terrainShadow';
import { Sky } from './sky/sky';
import { loadWorld } from './world/loader';
import { createWorldTextures } from './world/textures';
import { Environment, type Season, type TimePreset, type Weather } from './world/environment';
import { LoadingScreen } from './ui/loading';

async function boot() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const loading = new LoadingScreen();
  document.body.append(loading.root);

  const engine = new Engine(canvas);
  const world = await loadWorld((label, f) => loading.progress(label, f * 0.9));
  loading.progress('Laying out the desert', 0.92);
  const tex = createWorldTextures(world, engine.renderer);
  const regionSizes: [number, number, number] = [
    world.meta.regions.inner.size,
    world.meta.regions.mid.size,
    world.meta.regions.far.size,
  ];

  const env = new Environment();
  env.season = (params.get('season') as Season) || 'spring';
  env.setWeather((params.get('weather') as Weather) || 'clear');
  env.setPreset((params.get('time') as TimePreset) || 'golden');
  env.apply(0);

  const atmosphere = new Atmosphere(engine.renderer);
  const terrainShadow = new TerrainShadow(engine.renderer, tex, regionSizes);
  const terrain = new Terrain(tex, regionSizes, world.meta.landcover.size);
  const sky = new Sky();
  engine.scene.add(sky.mesh, terrain.mesh);

  // Debug free camera: drag to look, WASD/QE to move, Shift to hurry.
  const cam = engine.camera;
  const c = (params.get('cam') || '0,1400,2600,0,-0.18').split(',').map(Number);
  cam.position.set(c[0], c[1], c[2]);
  let yaw = c[3];
  let pitch = c[4];
  const keys = new Set<string>();
  addEventListener('keydown', (e) => keys.add(e.code));
  addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('mousemove', (e) => {
    if (!(e.buttons & 1)) return;
    yaw -= e.movementX * 0.003;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.003));
  });
  const freeLook = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    cam.position.set(x, y, z);
    yaw = Math.atan2(-(tx - x), -(tz - z));
    pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z));
  };

  const clock = new THREE.Clock();
  let lastMie = -1;
  function step() {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    engine.adapt(rawDt);
    G.uTime.value += dt;
    env.apply(dt);
    const speed = keys.has('ShiftLeft') ? 800 : 120;
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (keys.has('KeyW')) cam.position.addScaledVector(fwd, speed * dt);
    if (keys.has('KeyS')) cam.position.addScaledVector(fwd, -speed * dt);
    if (keys.has('KeyD')) cam.position.addScaledVector(right, speed * dt);
    if (keys.has('KeyA')) cam.position.addScaledVector(right, -speed * dt);
    if (keys.has('KeyE')) cam.position.y += speed * dt;
    if (keys.has('KeyQ')) cam.position.y -= speed * dt;
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    cam.updateMatrixWorld();

    if (G.uMieScale.value !== lastMie) {
      lastMie = G.uMieScale.value;
      atmosphere.rebuildTransmittance();
    }
    G.uCamPos.value.copy(cam.position);
    G.uCloudOffset.value.addScaledVector(G.uWind.value, dt * 4);
    atmosphere.update();
    terrainShadow.update();
    terrain.update(cam);
    G.uInvExposure.value = 1 / env.exposure;
    sky.update(cam, env.exposure);
    engine.render(env.exposure, G.uNight.value, G.uTime.value);
  }
  const schedule = params.has('timer') ? (f: () => void) => setTimeout(f, 16) : requestAnimationFrame;
  const frame = () => {
    step();
    schedule(frame);
  };
  frame();
  loading.done();
  Object.assign(window, {
    engine,
    env,
    terrain,
    G,
    freeLook,
    tick: (n = 1) => {
      for (let i = 0; i < n; i++) step();
    },
    /** Renders a frame and returns it as a JPEG data URL (debug capture). */
    snap: (w = 1100) => {
      engine.render(env.exposure, G.uNight.value, G.uTime.value);
      const src = engine.renderer.domElement;
      const o = document.createElement('canvas');
      o.width = w;
      o.height = Math.round((w * src.height) / src.width);
      o.getContext('2d')!.drawImage(src, 0, 0, o.width, o.height);
      return o.toDataURL('image/jpeg', 0.88);
    },
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:0;left:0;padding:20px">${err.stack || err}</pre>`);
});
