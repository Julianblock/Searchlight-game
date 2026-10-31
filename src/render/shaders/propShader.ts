import { lightingCommon } from './lighting';

/** Instanced buildings, water tanks and towers. */
export const propVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCamPos;
in float aPart;    // 0 wall, 1 roof, 2 metal, 3 boat hull
in vec4 aT0;       // x, y, z, angle
in vec4 aT1;       // sx, sy, sz, kind (0 house, 1 shed, 2 tank, 3 tower, 4 hut, 5 vehicle, 6 trailer, 7 stucco)
in vec4 aWall;     // rgb, lit
in vec4 aRoof;     // rgb, seed
#ifdef SHADOW_PASS
uniform mat4 uShadowMatrix;
out float vShadowZ;
#endif
out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
out vec3 vScale;
out vec3 vLocalN;
flat out float vPart;
flat out vec4 vWall;
flat out vec4 vRoof;
flat out float vKind;

void main() {
  vec3 p = position * aT1.xyz;
  vec3 n = normalize(normal / aT1.xyz);
  float c = cos(aT0.w), s = sin(aT0.w);
  mat2 R = mat2(c, s, -s, c);
  p.xz = R * p.xz;
  n.xz = R * n.xz;
  vec3 world = aT0.xyz + p;
  vWorld = world;
  vNormal = n;
  vLocal = position;
  vScale = aT1.xyz;
  vLocalN = normal;
  vPart = aPart;
  vWall = aWall;
  vRoof = aRoof;
  vKind = aT1.w;
#ifdef SHADOW_PASS
  vShadowZ = (uShadowMatrix * vec4(world, 1.0)).z;
#else
  vec2 dc = world.xz - uCamPos.xz;
  world.y -= dot(dc, dc) / (2.0 * 7310000.0);
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const propFragment = /* glsl */ `
${lightingCommon}
#include <logdepthbuf_pars_fragment>
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
in vec3 vScale;
in vec3 vLocalN;
flat in float vPart;
flat in vec4 vWall;
flat in vec4 vRoof;
flat in float vKind;
#ifdef SHADOW_PASS
in float vShadowZ;
#endif
out vec4 outColor;

void main() {
  #include <logdepthbuf_fragment>
#ifdef SHADOW_PASS
  outColor = vec4(vShadowZ, 0.0, 0.0, 1.0);
  return;
#endif
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  // Palette colours are display-referred; real stucco and paint sit near 0.4.
  vec3 albedo = (vPart > 0.5 ? vRoof.rgb : vWall.rgb) * 0.55;
  float rough = 0.85;
  vec3 emit = vec3(0.0);
  float kind = vKind;
  bool homey = kind < 0.5 || (kind > 3.5 && kind < 4.5) || (kind > 5.5 && kind < 7.5);
  if (kind > 4.5 && kind < 5.5) {
    // Vehicles: glossy paint, dark glass, rubber.
    if (vPart > 2.5) { albedo = vRoof.rgb * 0.7; rough = 0.25; }
    else if (vPart > 1.5) { albedo = vec3(0.025); rough = 0.9; }
    else if (vPart > 0.5) { albedo = vec3(0.02, 0.025, 0.03); rough = 0.08; }
    else { albedo = vWall.rgb * 0.7; rough = 0.22; }
  } else if (vPart > 2.5) {
    // Sun-greyed timber: porch posts, decks, vigas.
    albedo = vec3(0.34, 0.26, 0.19) * (0.8 + 0.4 * vnoise(vec2(vLocal.x * vScale.x * 0.5, vLocal.y * vScale.y * 6.0)));
    rough = 0.9;
  } else if (vPart > 1.5) {
    // Galvanised steel; weathered lattice towers are duller than new sheet.
    albedo = kind > 2.5 && kind < 3.5 ? vec3(0.36, 0.37, 0.38) : vec3(0.55, 0.56, 0.58);
    rough = 0.35;
  } else if (vPart > 0.5) {
    // Corrugated metal on sheds, tanks and trailers; flat roofs are tar and
    // gravel or a white elastomeric coat; shingles elsewhere.
    bool metal = (kind > 0.5 && kind < 2.5) || (kind > 5.5 && kind < 6.5);
    if (kind > 7.5) {
      // Parking lot asphalt with white stall lines; the aisle stays bare.
      vec3 pm = vLocal * vScale;
      albedo = vec3(0.12, 0.118, 0.115) * (0.8 + 0.4 * vnoise(pm.xz * 0.7)) * (0.9 + 0.2 * vnoise(pm.xz * 6.0));
      float sx = abs(fract((pm.x + 5.4) / 2.7 + 0.5) - 0.5) * 2.7;
      if (pm.z < 2.0 && sx < 0.06) albedo = vec3(0.62, 0.6, 0.55);
      rough = 0.9;
      metal = false;
    }
    rough = metal ? 0.38 : 0.8;
    if (metal) albedo *= 0.9 + 0.1 * sin((kind > 5.5 ? vLocal.z * vScale.z : vLocal.x * vScale.x) * 6.0);
    else if (kind < 7.5) albedo *= 0.85 + 0.3 * vnoise(vLocal.xz * vScale.xz * 1.5);
  } else if (abs(n.y) < 0.5 && homey) {
    vec3 sc0 = vLocal * vScale;
    if (kind > 5.5 && kind < 6.5) {
      // Manufactured home: ribbed siding over a darker skirting.
      albedo *= 0.92 + 0.08 * step(0.5, fract(sc0.y * 3.3));
      if (sc0.y < 0.7) albedo *= 0.55;
    } else if (kind > 6.5) {
      // Sand-finish stucco, stained where rain splashes the base.
      albedo *= 0.9 + 0.2 * vnoise(sc0.xy * 9.0 + sc0.zy * 9.0);
      albedo *= mix(0.8, 1.0, smoothstep(0.0, 0.5, sc0.y));
    }
    // Facade with windows: cells ~3 m wide, one storey high.
    vec3 sc = vLocal * vScale;
    float u = abs(vLocalN.x) > abs(vLocalN.z) ? sc.z : sc.x;
    vec2 cell = vec2(u / 3.2, sc.y / 2.9);
    vec2 f = fract(cell);
    vec2 id = floor(cell);
    bool lower = (id.y + 0.85) * 2.9 < vScale.y * 0.6;
    // Front door on the +z face, offset per house; no window in its cell.
    bool front = vLocalN.z > 0.5;
    float doorU = (hash12(vec2(vRoof.a * 17.0, 3.1)) - 0.5) * vScale.x * 0.4;
    bool doorCell = front && abs(sc.x - doorU) < 1.7;
    bool door = front && abs(sc.x - doorU) < 0.48 && sc.y < 2.55;
    bool doorTrim = front && abs(sc.x - doorU) < 0.6 && sc.y < 2.67 && !door;
    bool win = f.x > 0.3 && f.x < 0.72 && f.y > 0.35 && f.y < 0.8 && lower && !doorCell;
    bool trim = !win && f.x > 0.27 && f.x < 0.75 && f.y > 0.31 && f.y < 0.84 && lower && !doorCell;
    if (door) {
      vec3 paint = mix(vec3(0.32, 0.2, 0.12), vec3(0.18, 0.32, 0.34), step(0.6, hash12(vec2(vRoof.a, 9.0))));
      albedo = paint * (0.85 + 0.15 * step(0.5, fract(sc.y * 1.2)));
      rough = 0.6;
    } else if (doorTrim || trim) {
      albedo = vec3(0.62, 0.6, 0.56);
    }
    if (trim && f.y < 0.35) albedo *= 0.7;
    if (win) {
      // Glass with a mullion cross; drawn curtains or blinds in some rooms.
      vec2 wf = vec2((f.x - 0.3) / 0.42, (f.y - 0.35) / 0.45);
      float curtain = step(0.45, hash12(id + vRoof.a * 13.0));
      albedo = mix(vec3(0.07, 0.085, 0.1), vec3(0.42, 0.36, 0.28) * (0.8 + 0.2 * sin(wf.x * 40.0)), curtain * step(0.3, wf.y));
      rough = 0.12;
      if (abs(wf.x - 0.5) < 0.035 || abs(wf.y - 0.5) < 0.04) { albedo = vec3(0.6, 0.58, 0.54); rough = 0.7; }
      float lit = step(0.68, hash12(id + vRoof.a * 91.0)) * vWall.a;
      vec3 warm = mix(vec3(1.0, 0.42, 0.12), vec3(0.9, 0.62, 0.36), hash12(id + 3.7));
      // TV flicker in a few rooms.
      float tv = step(0.93, hash12(id + 7.1));
      warm = mix(warm, vec3(0.45, 0.6, 1.0) * (0.6 + 0.4 * sin(uTime * 9.0 + id.x * 4.0)), tv);
      emit = warm * warm * lit * uNight * 0.5 * uInvExposure;
      if (lit > 0.5) albedo = vec3(0.0);
    }
  } else if (kind > 1.5 && kind < 2.5) {
    // Water tank: ribbed welded steel.
    rough = 0.4;
    albedo *= 0.88 + 0.12 * sin(vLocal.y * vScale.y * 3.0);
  }
  float shadow = shadowAt(vWorld + n * 0.3, 0.0012);
  float ao = mix(0.6, 1.0, clamp(vLocal.y * 3.0, 0.0, 1.0));
  vec3 col = shadeSurface(albedo, n, vWorld, ao, rough, shadow) + emit;
  // Sodium floodlights over lit parking lots: pools of light on the asphalt and cars.
  if ((kind > 4.5 && kind < 5.5) || kind > 7.5) {
    float pool = 0.45 + 0.55 * smoothstep(0.25, 0.75, vnoise(vWorld.xz * 0.05));
    col += albedo * vec3(1.0, 0.7, 0.4) * uNight * vWall.a * pool * (0.5 + 0.5 * max(n.y, 0.0)) * 1.1 * uInvExposure;
  }
  col = applyAtmosphere(col, vWorld);
  outColor = vec4(col, 1.0);
}
`;
