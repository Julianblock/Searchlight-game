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
import { Heightfield } from './world/heightfield';
import { createWorldTextures } from './world/textures';
import { Environment } from './world/environment';
import { AirField } from './birds/air';
import { Player } from './birds/player';
import { ChaseCamera } from './birds/camera';
import { Controls } from './birds/input';
import { SPECIES, speciesById, type Palette } from './birds/species';
import { LoadingScreen } from './ui/loading';
import { Roads } from './world/roads';
import { RoadIndex } from './world/roadIndex';
import { loadSettings, type GameSettings } from './ui/settings';

function paletteFor(s: GameSettings): Palette {
  const sp = speciesById(s.bird) ?? SPECIES[0];
  const base = sp.palettes[s.palette] ?? sp.palettes[0];
  const c = s.custom;
  const p: Palette = { ...base };
  if (c.back) Object.assign(p, { back: c.back, coverts: c.back, secondaries: c.back });
  if (c.belly) Object.assign(p, { belly: c.belly, breast: c.belly, underCoverts: c.belly });
  if (c.head) p.head = c.head;
  if (c.tail) Object.assign(p, { tail: c.tail, tailUnder: c.tail });
  return p;
}

async function boot() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const loading = new LoadingScreen();
  document.body.append(loading.root);

  const engine = new Engine(canvas);
  const world = await loadWorld((label, f) => loading.progress(label, f * 0.9));
  loading.progress('Laying out the desert', 0.92);
  const heightfield = new Heightfield(world);
  const roadIndex = new RoadIndex(world.osm);
  const tex = createWorldTextures(world, engine.renderer);
  const regionSizes: [number, number, number] = [
    world.meta.regions.inner.size,
    world.meta.regions.mid.size,
    world.meta.regions.far.size,
  ];

  const settings = loadSettings(params);
  const env = new Environment();
  env.season = settings.season;
  env.setWeather(settings.weather);
  env.moon = settings.moon;
  env.timeFlow = settings.timeFlow;
  env.setPreset(settings.time);
  env.apply(0);

  const atmosphere = new Atmosphere(engine.renderer);
  const terrainShadow = new TerrainShadow(engine.renderer, tex, regionSizes);
  const terrain = new Terrain(tex, regionSizes, world.meta.landcover.size);
  const sky = new Sky();
  engine.scene.add(sky.mesh, terrain.mesh);

  const roads = new Roads(world.osm, heightfield);
  engine.scene.add(roads.group);

  const air = new AirField(heightfield);
  const species = speciesById(settings.bird) ?? SPECIES[0];
  const player = new Player(species, paletteFor(settings), heightfield, air);
  // Default spawn: north of town over US-95, heading south toward Terrible's.
  const sp = (params.get('spawn') || '-150,1150,-1600,0').split(',').map(Number);
  player.flight.spawn(sp[0], sp[1], sp[2], sp[3]);
  engine.scene.add(player.object);

  const cam = engine.camera;
  const controls = new Controls();
  controls.invertPitch = settings.invertPitch;
  const chase = new ChaseCamera(cam, heightfield, canvas);

  // Debug free camera (?free).
  const free = params.has('free');
  const c = (params.get('cam') || '0,1400,2600,0,-0.18').split(',').map(Number);
  let yaw = c[3];
  let pitch = c[4];
  if (free) cam.position.set(c[0], c[1], c[2]);
  canvas.addEventListener('mousemove', (e) => {
    if (free && e.buttons & 1) {
      yaw -= e.movementX * 0.003;
      pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.003));
    }
  });
  const freeLook = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    cam.position.set(x, y, z);
    yaw = Math.atan2(-(tx - x), -(tz - z));
    pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z));
  };
  function freeCam(dt: number) {
    const keys = controls.keys;
    const speed = keys.has('ShiftLeft') ? 800 : 120;
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (keys.has('KeyW')) cam.position.addScaledVector(fwd, speed * dt);
    if (keys.has('KeyS')) cam.position.addScaledVector(fwd, -speed * dt);
    if (keys.has('KeyD')) cam.position.addScaledVector(right, speed * dt);
    if (keys.has('KeyA')) cam.position.addScaledVector(right, -speed * dt);
    if (keys.has('KeyE')) cam.position.y += speed * dt;
    if (keys.has('KeyQ')) cam.position.y -= speed * dt;
    cam.position.y = Math.max(cam.position.y, heightfield.height(cam.position.x, cam.position.z) + 0.3);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }

  const clock = new THREE.Clock();
  let lastMie = -1;
  function step() {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    if (!params.has('timer')) engine.adapt(rawDt);
    G.uTime.value += dt;
    env.apply(dt);

    air.time += dt;
    const deck = Math.min(1, Math.max(G.uRain.value, G.uSnowFall.value) * 5);
    air.sun = Math.max(0, Math.sin(env.sunAltitude * THREE.MathUtils.DEG2RAD) * 1.2) * (1 - 0.6 * G.uCloudCover.value) * (1 - deck);
    air.rain = G.uRain.value;
    air.snow = G.uSnowFall.value;
    air.windX = G.uWind.value.x;
    air.windZ = G.uWind.value.y;

    if (free) {
      freeCam(dt);
    } else {
      const input = controls.update(dt);
      if (controls.consume('KeyC')) chase.cycle();
      player.step(dt, input);
      player.sync();
      cam.near = 0.25;
      chase.update(dt, player.flight, player.object);
    }

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
  // Background/headless tabs throttle rAF; ?timer keeps the loop alive for capture.
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
    heightfield,
    roads,
    roadIndex,
    G,
    player,
    chase,
    air,
    controls,
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
