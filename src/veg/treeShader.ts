import { lightingCommon } from '../render/shaders/lighting';
import { noiseCommon } from '../render/shaders/noise';
import { windCommon } from '../render/shaders/wind';

export const SPECIES_COUNT = 12;
/** First rosette species id: these are stiff and scaled uniformly. */
export const ROSETTE_FIRST = 8;

export const treeVertex = /* glsl */ `
${noiseCommon}
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCamPos;
uniform float uTime;
uniform vec2 uWind;
uniform float uLeafAmount[${SPECIES_COUNT}];
uniform float uBloom[${SPECIES_COUNT}];
in vec3 aCenter;
in float aPart;
in vec3 aCrownN;
in float aShell;
in vec4 aInst0; // x, y, z, rotation
in vec4 aInst1; // crown radius, height, species, seed
#ifdef SHADOW_PASS
uniform mat4 uShadowMatrix;
out float vShadowZ;
#endif
out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
out vec3 vC;
out float vAO;
out vec3 vClusterN;
flat out int vSpecies;
flat out float vSeed;
flat out float vPart;
flat out vec2 vSize;
out float vGust;
${windCommon}

void main() {
  vec3 local = position;
  int sp = int(aInst1.z + 0.5);
  float part = aPart;
  float amount = uLeafAmount[sp];
  bool rosette = sp >= ${ROSETTE_FIRST};
  vec3 c = aCenter;
  vec3 n = normal;
  vec3 nCluster = vec3(0.0, 1.0, 0.0);
  vAO = aShell;
  if (part > 0.5 && part < 2.5) {
    // Leafless shrubs: clusters contract into a twiggy core.
    local = c + (local - c) * mix(0.6, 1.0, amount);
    nCluster = normalize(local - c);
    n = normalize(mix(nCluster, aCrownN, 0.6));
  } else if (part > 3.5 && part < 4.5) {
    // Blossom panicles only open in season, and not on every plant.
    float open = uBloom[sp] * step(fract(aInst1.w * 13.7), 0.6);
    local = c + (local - c) * open;
  }
  float r = aInst1.x;
  float h = aInst1.y;
  float rot = aInst0.w;
  // Wind: trunk sway and a downwind lean that both swell as gusts pass, plus
  // leaf clusters bobbing on their twigs. Joshua trees and yuccas barely give.
  float wind = length(uWind);
  float gust = windGust(aInst0.xz);
  vGust = gust * smoothstep(0.5, 4.0, wind);
  float stiff = rosette ? 0.25 : 1.0;
  float ph = uTime * (1.1 + 0.4 * fract(aInst1.w * 7.0)) + aInst1.w * 6.2831 + aInst0.x * 0.03;
  float sway = (sin(ph) + 0.4 * sin(ph * 2.3 + 1.0)) * 0.012 * (0.4 + wind * 0.15) * (0.6 + 1.6 * gust);
  sway += 0.004 * wind * (0.3 + gust);
  sway *= local.y * local.y * stiff;
  if (part > 0.5 && part < 3.5) {
    float ch = fract(sin(dot(c, vec3(12.9, 78.2, 37.7))) * 43758.5);
    float bob = sin(uTime * (2.5 + 2.0 * ch) + ch * 6.28) * 0.012 * (0.3 + gust) * (0.4 + wind * 0.12) * (rosette ? 0.3 : 1.0);
    local += vec3(bob, bob * 0.5, -bob * 0.7);
  }
  vec3 p = vec3(local.x * r, local.y * h, local.z * r);
  p.xz += windDir() * sway * h;
  float cs = cos(rot), sn = sin(rot);
  p.xz = mat2(cs, -sn, sn, cs) * p.xz;
  n = normalize(vec3(n.x / r, n.y / h, n.z / r));
  n.xz = mat2(cs, -sn, sn, cs) * n.xz;
  nCluster = normalize(vec3(nCluster.x / r, nCluster.y / h, nCluster.z / r));
  nCluster.xz = mat2(cs, -sn, sn, cs) * nCluster.xz;
  vClusterN = nCluster;
  vec3 world = aInst0.xyz + p;
  vWorld = world;
  vNormal = n;
  vLocal = local;
  vC = c;
  vSpecies = sp;
  vSeed = aInst1.w;
  vPart = part;
  vSize = vec2(r, h);
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

export const treeFragment = /* glsl */ `
${lightingCommon}
#include <logdepthbuf_pars_fragment>
uniform vec3 uLeafColor[${SPECIES_COUNT}];
uniform vec3 uBarkColor[${SPECIES_COUNT}];
uniform vec3 uThatchColor[${SPECIES_COUNT}];
uniform vec3 uBloomColor[${SPECIES_COUNT}];
uniform float uLeafAmount[${SPECIES_COUNT}];
uniform float uBloom[${SPECIES_COUNT}];
uniform float uOpen[${SPECIES_COUNT}];
uniform vec3 uFallTint;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
in vec3 vC;
in float vAO;
in vec3 vClusterN;
flat in int vSpecies;
flat in float vSeed;
flat in float vPart;
flat in vec2 vSize;
in float vGust;
#ifdef SHADOW_PASS
in float vShadowZ;
#endif
out vec4 outColor;

/** Nearest elliptical leaf in a jittered 3D grid: x = distance, yzw = cell id. */
vec4 leafCells(vec3 q) {
  vec3 ci = floor(q);
  vec3 o = step(0.5, fract(q)) - 1.0;
  float best = 9.0;
  vec3 bestId = ci;
  for (int k = 0; k < 8; k++) {
    vec3 c = ci + o + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 dv = q - (c + vec3(hash13(c), hash13(c + 19.1), hash13(c + 47.7)));
    vec3 axis = normalize(vec3(hash13(c + 2.9), hash13(c + 6.1), hash13(c + 8.3)) - 0.5);
    float al = dot(dv, axis);
    float dd = sqrt(dot(dv, dv) + 2.2 * al * al) / (0.5 + 0.35 * hash13(c + 11.3));
    if (dd < best) { best = dd; bestId = c; }
  }
  return vec4(best, bestId);
}

void main() {
  #include <logdepthbuf_fragment>
  int part = int(vPart + 0.5);
  bool cluster = part == 1 || part == 2;
#ifdef SHADOW_PASS
  if (part == 2) discard;
  if (part == 1) {
    float amount = uLeafAmount[vSpecies];
    float nz = vnoise3(vLocal * 9.0 + vSeed * 13.0);
    float fine = vnoise3(vLocal * 31.0 + vSeed * 7.0);
    if (amount < 0.98 && fine * 0.6 + nz * 0.4 > mix(0.32, 1.05, amount)) discard;
    // Desert shrubs cast open, lacy shade.
    if (vnoise3(vLocal * 26.0 + vSeed * 5.0) < 0.3) discard;
  }
  outColor = vec4(vShadowZ, 0.0, 0.0, 1.0);
  return;
#endif
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(uCamPos - vWorld);
  float amount = uLeafAmount[vSpecies];
  vec3 albedo;
  float thin = 0.0;
  float glow = 0.0;
  if (cluster) {
    float nz = vnoise3(vLocal * 9.0 + vSeed * 13.0);
    float fine = vnoise3(vLocal * 31.0 + vSeed * 7.0);
    // Bare canopies: keep only a sparse lattice of twigs.
    if (amount < 0.98 && fine * 0.6 + nz * 0.4 > mix(0.32, 1.05, amount)) discard;
    // Ragged, leafy silhouettes where clusters turn edge-on to the viewer.
    float edge = 1.0 - abs(dot(normalize(vClusterN), V));
    float leafy = vnoise3(vLocal * 46.0 + vSeed * 3.0);
    bool inner = part == 2;
    float leafyScale = smoothstep(0.012, 0.004, length(fwidth(vLocal)));
    if (!inner && edge > 0.5 && leafy < (edge - 0.5) * 2.4 * leafyScale) discard;
    vec3 leafC = uLeafColor[vSpecies] * (0.82 + 0.36 * fract(vSeed * 91.7));
    leafC *= 0.8 + 0.4 * nz;
    vec3 pm = vLocal * vec3(vSize.x, vSize.y, vSize.x);
    float fp = length(fwidth(pm));
    float sFine = inner ? 0.0 : smoothstep(0.15, 0.045, fp);
    float sCoarse = inner ? 0.0 : smoothstep(0.7, 0.2, fp) * (1.0 - sFine);
    // Desert leaves are tiny: creosote leaflets, bursage, catclaw pinnae.
    float leafScale = vSize.y < 3.0 ? 0.06 : 0.1;
    if (sFine > 0.0) {
      vec4 c = leafCells(pm / leafScale + vSeed * 17.0);
      float cut = mix(1.1, 0.8, edge) * (1.0 - 0.38 * uOpen[vSpecies]);
      if (c.x > mix(9.0, cut, sFine)) discard;
      vec3 leafN = vec3(hash13(c.yzw + 5.1), hash13(c.yzw + 7.7), hash13(c.yzw + 9.9)) - 0.5;
      leafN += 0.5 * vGust * sin(uTime * 9.0 + hash13(c.yzw) * 6.28) * vec3(0.6, 1.0, 0.4);
      n = normalize(n + leafN * 1.1 * sFine);
      leafC *= mix(1.0, (0.8 + 0.4 * hash13(c.yzw + 3.3)) * (0.75 + 0.25 * (1.0 - c.x / cut)), sFine);
    }
    if (sCoarse > 0.0) {
      vec4 c = leafCells(pm / (leafScale * 4.5) + vSeed * 5.0);
      float cut = mix(1.5, 0.9, edge * edge) * (1.0 - 0.3 * uOpen[vSpecies]);
      if (c.x > mix(9.0, cut, sCoarse)) discard;
      vec3 clumpN = vec3(hash13(c.yzw + 5.1), hash13(c.yzw + 7.7), hash13(c.yzw + 9.9)) - 0.5;
      clumpN += 0.25 * vGust * sin(uTime * 5.0 + hash13(c.yzw) * 6.28);
      n = normalize(n + clumpN * 0.8 * sCoarse);
      leafC *= mix(1.0, (0.85 + 0.3 * hash13(c.yzw + 3.3)) * (0.6 + 0.4 * (1.0 - c.x / cut)), sCoarse);
    }
    if (inner) leafC *= 0.5;
    // Flowers scattered through the crown: creosote yellow, tamarisk and desert willow pink.
    float bloom = uBloom[vSpecies];
    if (bloom > 0.0) {
      float fl = step(1.0 - bloom * 0.45, hash13(floor(pm / 0.07) + vSeed));
      leafC = mix(leafC, uBloomColor[vSpecies], fl * (inner ? 0.2 : 0.85));
    }
    leafC = mix(leafC, uFallTint, clamp((fract(vSeed * 53.1) - 0.5) * 0.6, 0.0, 1.0) * float(vSpecies == 3 || vSpecies == 7));
    // Dusty, waxy desert foliage: darken and desaturate toward grey-green.
    float lum = dot(leafC, vec3(0.3, 0.55, 0.15));
    leafC = mix(vec3(lum), leafC, 0.8) * mix(0.8, 0.92, smoothstep(0.35, 0.7, lum));
    albedo = mix(uBarkColor[vSpecies] * 0.5, leafC, smoothstep(0.0, 0.5, amount));
    thin = amount;
  } else if (part == 3) {
    // Dagger leaves: dark at the heart of the rosette, paler and yellower at the
    // tips; the oldest, lowest leaves fold down and die back to straw.
    vec3 d = vLocal - vC;
    float along = clamp(length(d * vec3(1.0, 1.0, 1.0)) / 0.12, 0.0, 1.0);
    float down = smoothstep(0.1, -0.5, normalize(d + 1e-5).y);
    vec3 leafC = uLeafColor[vSpecies] * (0.85 + 0.3 * fract(vSeed * 91.7));
    leafC = mix(leafC * 0.6, leafC * vec3(1.12, 1.1, 0.88), along);
    leafC *= 0.85 + 0.3 * hash13(floor(vLocal * 140.0));
    leafC = mix(leafC, uThatchColor[vSpecies] * 0.9, down * 0.75);
    albedo = leafC;
    thin = 0.6;
  } else if (part == 4) {
    // Waxy cream blossoms in tight clusters.
    float lumps = vnoise3(vLocal * 220.0 + vSeed);
    albedo = uBloomColor[vSpecies] * (0.8 + 0.3 * lumps);
    thin = 0.8;
  } else if (part == 5) {
    // Cholla spines: a silvery-gold halo that blazes when backlit.
    float fuzz = vnoise3(vLocal * 260.0 + vSeed * 3.0);
    float edge = 1.0 - abs(dot(n, V));
    if (edge > 0.7 && fuzz < (edge - 0.7) * 2.8) discard;
    albedo = mix(uBarkColor[vSpecies] * 0.6, uThatchColor[vSpecies], 0.55 + 0.45 * fuzz);
    glow = 1.0;
    thin = 0.5;
  } else if (part == 6) {
    // Thatch: the shaggy coat of dead, down-pointing leaves on Joshua arms,
    // yucca stems and the palm skirt.
    float ang = atan(vLocal.z - vC.z, vLocal.x - vC.x);
    float streak = vnoise(vec2(ang * 9.0, vLocal.y * 55.0 + vSeed * 7.0));
    float groove = smoothstep(0.35, 0.15, vnoise(vec2(ang * 18.0, vLocal.y * 20.0)));
    albedo = uThatchColor[vSpecies] * (0.65 + 0.55 * streak) * (1.0 - 0.45 * groove);
    // Old trunk bases are bare, grey and furrowed.
    albedo = mix(uBarkColor[vSpecies] * 0.6, albedo, smoothstep(0.08, 0.22, vLocal.y));
  } else {
    float bn = vnoise3(vWorld * vec3(2.0, 0.4, 2.0));
    albedo = uBarkColor[vSpecies] * 0.55 * (0.75 + 0.5 * bn);
  }

  // Rain darkens bark far more than waxy leaves.
  albedo = wetten(albedo, cluster || part == 3 ? 0.35 : 1.0);
  vec3 gn = normalize(vNormal);
  if (!gl_FrontFacing) gn = -gn;
  float snowT = snowAmount(normalize(gn + n * 0.5), vWorld.xz * 2.0 + vWorld.y, vWorld.y) * (cluster || part == 3 ? 0.25 : 0.35);
  albedo = mix(albedo, SNOW_ALB, snowT);
  thin *= 1.0 - snowT;

  float shadow = shadowAt(vWorld + n * 0.3, 0.002);
  vec3 sun = sunRadiance(vWorld.y);
  vec3 moon = moonRadiance(vWorld.y);
  float wrap = cluster ? 0.3 : part == 3 ? 0.25 : 0.1;
  float ndl = clamp((dot(n, uSunDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  float ndlM = clamp((dot(n, uMoonDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  float ao = vAO;
  vec3 col = albedo / PI * (sun * ndl * shadow + moon * ndlM * shadow) * mix(1.0, ao, 0.6);
  col += albedo * skyAmbient(n, ao) / PI + headlight(albedo, n, vWorld);
  // Light filtering through backlit leaves and spines.
  float back = pow(max(dot(-V, uSunDir), 0.0), 4.0);
  col += albedo * albedo * 2.2 * sun * shadow * back * thin * 0.35 * ao;
  col += albedo * sun * shadow * pow(max(dot(-V, uSunDir), 0.0), 2.0) * glow * 0.5;
  col = applyAtmosphere(col, vWorld);
  outColor = vec4(col, 1.0);
}
`;
