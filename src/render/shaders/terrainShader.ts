import { lightingCommon } from './lighting';
import { terrainCommon } from './terrainCommon';

export const terrainVertex = /* glsl */ `
${terrainCommon}
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCamPos;
uniform float uGridDim;
uniform float uLodK;
in vec4 aNode; // x0, z0, size, level
out vec3 vWorld;

void main() {
  vec2 g = position.xz * uGridDim;
  vec2 xz = aNode.xy + position.xz * aNode.z;
  float h = terrainHeight(xz);
  float dist = distance(uCamPos, vec3(xz.x, h, xz.y));
  float mEnd = 2.0 * aNode.z * uLodK;
  float mStart = mEnd * 0.7;
  float morph = clamp((dist - mStart) / (mEnd - mStart), 0.0, 1.0);
  xz -= fract(g * 0.5) * 2.0 / uGridDim * aNode.z * morph;
  h = terrainHeight(xz);
  vWorld = vec3(xz.x, h, xz.y);
  // Earth curvature with standard atmospheric refraction (k = 0.13).
  vec2 dc = xz - uCamPos.xz;
  vec3 p = vWorld;
  p.y -= dot(dc, dc) / (2.0 * 7310000.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const terrainFragment = /* glsl */ `
${lightingCommon}
${terrainCommon}
#include <logdepthbuf_pars_fragment>
uniform sampler2D uImgDetail; // inner region on top, Laughlin below
uniform sampler2D uImgMid;
uniform sampler2D uImgFar;
uniform sampler2D uMaskA;
uniform sampler2D uMaskB;
uniform float uLcSize;
uniform vec4 uVeg;     // green flush after rain, Joshua/yucca bloom, wildflowers, monsoon green-up
uniform vec4 uDesert;  // summer bleach, heat, creosote bloom, dust
uniform float uSnowLine;
in vec3 vWorld;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 rippleNormal(vec2 xz, float dist) {
  vec2 w = uWind * uTime;
  float e = 0.35;
  float s = 1.0 / 2.2;
  float a = vnoise((xz + w * 0.6) * s) + 0.5 * vnoise((xz * 2.7 - w) * s);
  float b = vnoise((xz + vec2(e, 0.0) + w * 0.6) * s) + 0.5 * vnoise(((xz + vec2(e, 0.0)) * 2.7 - w) * s);
  float c = vnoise((xz + vec2(0.0, e) + w * 0.6) * s) + 0.5 * vnoise(((xz + vec2(0.0, e)) * 2.7 - w) * s);
  // Fade fine ripples once they shrink below a pixel to avoid sparkling noise.
  float footprint = length(fwidth(xz));
  float amp = 0.10 * smoothstep(3.0, 0.4, footprint) * (0.4 + length(uWind) * 0.15);
  vec2 big = xz / 40.0 + w * 0.02;
  float sw = vnoise(big) - vnoise(big + vec2(0.05, 0.0));
  float sz = vnoise(big) - vnoise(big + vec2(0.0, 0.05));
  vec3 nb = vec3(sw, 0.0, sz) * 0.5 * smoothstep(60.0, 5.0, footprint);
  vec2 rip = rainRipples(xz) * smoothstep(0.2, 0.05, footprint);
  return normalize(vec3((a - b) * amp / e + rip.x, 1.0, (a - c) * amp / e + rip.y) + nb);
}

/** Nearest pebble in a jittered grid: x = distance to its centre, y = id hash. */
vec2 pebbles(vec2 q) {
  vec2 ci = floor(q);
  float best = 9.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = ci + vec2(float(i), float(j));
      vec2 o = hash22(c);
      float d = length(q - c - o) / (0.35 + 0.4 * hash12(c + 3.7));
      if (d < best) { best = d; id = hash12(c + 9.1); }
    }
  }
  return vec2(best, id);
}

const mat2 ROT_P = mat2(0.6, 0.8, -0.8, 0.6);

void main() {
  #include <logdepthbuf_fragment>
  vec2 xz = vWorld.xz;
  vec3 w = regionWeights(xz);
  float dist = length(vWorld - uCamPos);

  float e = terrainTexel(xz);
  vec3 n = terrainNormal(xz, e);
  float ao = terrainSample(xz).y;

  vec3 alb = texture(uImgFar, regionUV(xz, uRegionSize.z)).rgb;
  if (w.y > 0.0) alb = mix(alb, texture(uImgMid, regionUV(xz, uRegionSize.y)).rgb, w.y);
  float wLau = lauWeight(xz);
  if (wLau > 0.0) alb = mix(alb, texture(uImgDetail, lauUV(xz, 4096.0)).rgb, wLau);
  if (w.x > 0.0) alb = mix(alb, texture(uImgDetail, innerUV(xz, 4096.0)).rgb, w.x);
  // Orthophotos are exposed for display; pale desert soil keeps more of its brightness.
  alb *= 0.8;

  vec2 lcUV = xz / uLcSize + 0.5;
  float inLc = step(0.0, lcUV.x) * step(lcUV.x, 1.0) * step(0.0, lcUV.y) * step(lcUV.y, 1.0);
  vec4 mA = texture(uMaskA, lcUV) * inLc;
  vec4 mB = texture(uMaskB, lcUV) * inLc;

  float l = luma(alb);
  float detailFade = clamp(1.0 - dist / 2500.0, 0.0, 1.0);
  float nA = fbm(xz / 38.0, 4);
  float nB = vnoise(xz / 4.0);
  float slope = 1.0 - n.y;
  float fp0 = length(fwidth(xz));

  // --- Desert scrub: creosote flats, the Joshua belt, blackbrush slopes ---------
  float scrub = clamp(mA.r + mA.g + mA.b, 0.0, 1.0);
  // Away from the land-cover map, everything that isn't rock or water is scrub.
  scrub = max(scrub, (1.0 - inLc) * (1.0 - smoothstep(0.4, 0.6, slope)));
  // Shrub crowns read as dark specks in the photo; keep them dark through every season.
  float shrub = smoothstep(0.1, 0.05, l);
  // After a wet winter the shrubs flush green and the soil grows a fuzz of annuals.
  float north = clamp(-n.z * 0.6, 0.0, 0.4);
  float green = clamp(max(uVeg.x, uVeg.w * 0.7) + north * 0.25, 0.0, 1.0);
  vec3 flush = mix(vec3(0.11, 0.13, 0.06), vec3(0.17, 0.17, 0.08), nA) * (0.7 + 1.4 * l);
  vec3 desert = mix(alb, mix(alb, flush, 0.2 + shrub * 0.5), green * (0.22 + 0.33 * smoothstep(0.55, 0.8, fbm(xz / 26.0, 3))));
  // Summer bleaches the soil toward pale caliche and the shrubs toward olive-grey.
  desert = mix(desert, mix(desert * vec3(1.06, 1.02, 0.96), vec3(dot(desert, vec3(0.33))) * vec3(1.05, 0.98, 0.9), 0.3), uDesert.x * (1.0 - green));
  // Spring bloom: drifts of desert marigold, globemallow, lupine and desert dandelion.
  float drift = smoothstep(0.55, 0.78, fbm(xz / 55.0 + 3.1, 3)) * (1.0 - shrub) * (1.0 - smoothstep(0.3, 0.5, slope));
  float pick = vnoise(xz / 21.0);
  vec3 flowerCol = pick < 0.45 ? vec3(0.62, 0.50, 0.06)       // desert marigold, dandelion
                 : pick < 0.62 ? vec3(0.66, 0.28, 0.07)       // apricot globemallow
                 : pick < 0.8 ? vec3(0.30, 0.20, 0.46)        // lupine, phacelia
                 : vec3(0.70, 0.66, 0.60);                    // desert lily, primrose
  desert = mix(desert, flowerCol, uVeg.z * drift * 0.38);
  // Creosote bloom tints the bushes yellow-green in April.
  desert = mix(desert, desert * vec3(1.08, 1.06, 0.75), uDesert.z * shrub * mA.r * 0.6);
  alb = mix(alb, desert, scrub);

  // Desert pavement: old fan surfaces armoured with dark, varnished pebbles.
  float flat0 = 1.0 - smoothstep(0.03, 0.12, slope);
  float pave = smoothstep(0.52, 0.72, fbm(xz / 340.0 + 11.0, 4)) * flat0 * scrub * (1.0 - mB.r);
  alb = mix(alb, alb * vec3(0.72, 0.66, 0.6), pave * 0.55);

  // --- Sandy washes ----------------------------------------------------------------
  // A braided ribbon of loose pale sand meanders down each wash, edged with
  // gravel bars and the darker catclaw and desert willow that follow the water.
  float wash = mB.r;
  if (wash > 0.01) {
    float braid = abs(fbm(xz / 48.0 + vec2(fbm(xz / 160.0, 2) * 3.0), 3) - 0.5);
    float sand = smoothstep(0.16, 0.06, braid);
    vec3 sandCol = vec3(0.46, 0.40, 0.32) * (0.92 + 0.16 * vnoise(xz / 2.3));
    vec3 bar = mix(alb, vec3(0.36, 0.32, 0.27), 0.5);
    vec3 washCol = mix(bar, sandCol, sand);
    washCol = mix(washCol, washCol * 0.55, smoothstep(0.2, 0.32, braid) * 0.6);
    // Wind-rippled sand up close.
    washCol *= 1.0 + 0.06 * sin(dot(xz, normalize(uWind + vec2(1e-3))) * 9.0 + vnoise(xz) * 3.0) * smoothstep(0.3, 0.08, fp0);
    alb = mix(alb, washCol, wash * 0.85);
  }

  // --- Rock: andesite, granite and rust-red volcanic cliffs with desert varnish ----
  float rockMask = max(mB.g, smoothstep(0.45, 0.7, slope + (nB - 0.5) * 0.18));
  float rocky = rockMask * (1.0 - wash);
  vec3 rock = mix(vec3(0.27, 0.22, 0.17), vec3(0.34, 0.19, 0.11), smoothstep(0.5, 0.8, nA));
  rock = mix(rock, vec3(0.10, 0.08, 0.07), smoothstep(0.55, 0.85, fbm(xz / 9.0 + 5.0, 3)) * 0.7); // varnish streaks
  rock *= 0.8 + 0.4 * vnoise(xz / 1.7);
  alb = mix(alb, mix(alb, rock, 0.6), rocky * 0.7);

  // Snow on the Spring Mountains, Charleston Peak and, some winters, the Highland Range.
  float snowN = fbm(xz / 3000.0, 4);
  float snow = smoothstep(uSnowLine - 250.0 + snowN * 500.0, uSnowLine + 250.0 + snowN * 500.0, vWorld.y);
  snow *= 1.0 - smoothstep(0.45, 0.75, slope) * 0.7;
  alb = mix(alb, vec3(0.82, 0.85, 0.9), snow);

  // --- Lake shore: tamarisk, arrowweed and cattail; lawns and alfalfa ---------------
  float shore = mB.a;
  vec3 tam = mix(vec3(0.13, 0.13, 0.07), vec3(0.20, 0.16, 0.10), (1.0 - uVeg.x) * 0.6 + 0.3 * nB) * (0.75 + 0.5 * vnoise(xz / 4.0));
  alb = mix(alb, tam, shore * 0.7);

  // --- Water ------------------------------------------------------------------------
  float waterFrac = mA.a * smoothstep(0.12, 0.05, l + 0.02);
  // Rain pools in clay hollows, ruts and wash bottoms, and dries within hours.
  float canopy = shrub;
  float hollow = vnoise(ROT_P * xz / 7.0) * 0.6 + vnoise(xz / 1.9) * 0.4;
  float puddle = smoothstep(0.8, 0.92, hollow + uWet * 0.22) * smoothstep(0.45, 0.85, uWet) * (1.0 - canopy) * (1.0 - rocky);
  waterFrac = max(waterFrac, puddle * (0.5 + 0.5 * wash));
  waterFrac *= smoothstep(0.30, 0.12, slope);

  // Lake bed under the real water surface: pale sand, cobbles, no puddles.
  vec2 wl = waterAt(xz);
  float wDepth = wl.x - vWorld.y;
  float under = wl.y > 0.01 ? clamp(wDepth / 0.25, 0.0, 1.0) : 0.0;
  if (under > 0.0) {
    vec3 bed = mix(vec3(0.20, 0.18, 0.13), vec3(0.28, 0.24, 0.17), vnoise(xz / 3.0));
    alb = mix(alb, bed, under * smoothstep(0.0, 1.2, wDepth) * 0.75);
    waterFrac *= 1.0 - under;
  }

  // Rain darkens the soil dramatically for an hour; varnished rock less so.
  alb = wetten(alb, 1.0 - rocky * 0.5);

  // Ground detail up close.
  // Rotated octaves so the value-noise lattice never lines up into dots.
  const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
  vec2 q1 = ROT * xz;
  vec2 q2 = ROT * q1;
  // Each octave fades out before it shrinks below a pixel, so distant ground
  // stays clean instead of shimmering with sub-pixel noise.
  float fp = fp0;
  float fine = (vnoise(q1 / 2.9) - 0.5) * 0.5 * smoothstep(3.0, 1.0, fp)
             + (vnoise(q2 / 1.1) - 0.5) * 0.3 * smoothstep(1.1, 0.4, fp)
             + (vnoise(xz / 0.45) - 0.5) * 0.2 * smoothstep(0.45, 0.16, fp);
  float nearFade = clamp(1.0 - dist / 400.0, 0.0, 1.0) * smoothstep(2.0, 0.6, fp);
  alb *= 1.0 + 0.5 * fine * detailFade;
  // Gravel and pebbles underfoot: varnished dark stones and pale quartz.
  float pebbleFade = smoothstep(0.06, 0.015, fp) * (1.0 - wash * 0.7) * (1.0 - waterFrac);
  if (pebbleFade > 0.0) {
    // Fine gravel, as light as it is dark, so the soil keeps its average tone.
    vec2 gv = pebbles(ROT * xz / 0.022);
    float grit = smoothstep(1.0, 0.7, gv.x) * step(0.4, gv.y);
    alb *= 1.0 + (fract(gv.y * 11.0) - 0.5) * 0.36 * grit * pebbleFade;
    // Scattered cobbles: varnished basalt, rusty andesite, tan granite, white quartz.
    vec2 pb = pebbles(ROT * xz / 0.07);
    float stone = smoothstep(1.0, 0.75, pb.x) * step(0.75 + 0.2 * (1.0 - pave), pb.y);
    float tone = fract(pb.y * 7.0);
    vec3 stoneCol = alb * mix(vec3(0.62, 0.56, 0.52), vec3(1.12, 0.96, 0.8), tone);
    stoneCol = pb.y > 0.99 ? alb * 1.3 : stoneCol;
    stoneCol *= 0.8 + 0.35 * (1.0 - pb.x);
    alb = mix(alb, stoneCol, stone * pebbleFade * 0.5);
  }
  float h0 = vnoise(q1 / 3.7) + 0.5 * vnoise(q2 / 1.4);
  float hx = vnoise((q1 + vec2(0.5, 0.0)) / 3.7) + 0.5 * vnoise((q2 + vec2(0.5, 0.0)) / 1.4);
  float hz = vnoise((q1 + vec2(0.0, 0.5)) / 3.7) + 0.5 * vnoise((q2 + vec2(0.0, 0.5)) / 1.4);
  n = normalize(n + vec3(h0 - hx, 0.0, h0 - hz) * (0.12 + rocky * 0.5) * nearFade);

  // Snow lies thin on the desert: shrubs and rocks poke through the blanket.
  float snowed = snowAmount(n, xz, vWorld.y) * (1.0 - rocky * 0.6) * (1.0 - canopy * 0.7) * (1.0 - under);
  float driftS = 0.88 + 0.12 * fbm(xz / 45.0 + 7.0, 3);
  alb = mix(alb, SNOW_ALB * driftS * (0.94 + 0.06 * fine), snowed * (1.0 - waterFrac * 0.7));
  waterFrac *= 1.0 - snowed * 0.85;

  float shadow = shadowAt(vWorld + n * 0.6, 0.00025);
  vec3 color = shadeSurface(alb, n, vWorld, ao, mix(0.95, 0.62, uWet * (1.0 - snowed)), shadow);
  if (under > 0.0) {
    // Ripples on the surface focus sunlight into a dancing net on the bed.
    vec2 q = xz * 0.8;
    float t = uTime;
    float ca = vnoise(ROT * q + vec2(t * 0.31, t * 0.17));
    float cb = vnoise(ROT_P * q * 1.6 - vec2(t * 0.22, -t * 0.27) + 4.0);
    float net = pow(clamp(1.0 - abs(ca + cb - 1.0) * 2.4, 0.0, 1.0), 5.0);
    color += alb / PI * sunRadiance(wl.x) * max(uSunDir.y, 0.0) * shadow * net * 1.6
           * exp(-wDepth * 0.25) * under * smoothstep(1.5, 0.3, fp);
  }

  if (waterFrac > 0.01) {
    vec3 wn = rippleNormal(xz, dist);
    vec3 V = normalize(uCamPos - vWorld);
    vec3 R = reflect(-V, wn);
    R.y = abs(R.y);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
    vec3 refl = skyRadianceDir(R) * cloudShadow(vWorld + R * 400.0);
    vec3 sun = sunRadiance(vWorld.y) * shadow;
    float glint = pow(max(dot(R, uSunDir), 0.0), 900.0) * 140.0 + pow(max(dot(R, uSunDir), 0.0), 60.0) * 0.6;
    float glintM = pow(max(dot(R, uMoonDir), 0.0), 700.0) * 90.0;
    vec3 body = color * 0.75;
    vec3 water = mix(body, refl, F) + sun * glint * F + moonRadiance(vWorld.y) * glintM * F;
    color = mix(color, water, waterFrac);
  }

  if (uVision > 0.0) {
    // The Highland Range 16 million years ago: fresh black lava, ash-dark slopes
    // and incandescent flows threading down from the vents.
    float core = smoothstep(uVolcano.z, uVolcano.z * 0.45, length(xz - uVolcano.xy)) * uVision;
    vec2 wq = xz / 260.0 + vec2(fbm(xz / 900.0, 3), fbm(xz / 900.0 + 9.0, 3)) * 2.2;
    float high = smoothstep(uVolcano.w - 300.0, uVolcano.w, vWorld.y);
    float vein = (1.0 - smoothstep(0.0, 0.018 + 0.03 * high, abs(fbm(wq, 4) - 0.5))) * high;
    float pulse = 0.75 + 0.25 * sin(uTime * 1.7 + fbm(xz / 80.0, 2) * 9.0);
    vec3 lava = mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.55, 0.15), vein * high);
    color += lava * vein * pulse * core * 5.0 * uInvExposure;
  }

  color = applyAtmosphere(color, vWorld);
  outColor = vec4(color, 1.0);
}
`;
