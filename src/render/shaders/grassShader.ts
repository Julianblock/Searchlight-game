import { lightingCommon, snowCommon, waterCommon } from './lighting';
import { noiseCommon } from './noise';
import { terrainCommon } from './terrainCommon';
import { windCommon } from './wind';

export const grassVertex = /* glsl */ `
${terrainCommon}
${noiseCommon}
${waterCommon}
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCamPos;
uniform float uTime;
uniform vec2 uWind;
uniform sampler2D uImgInner;
uniform sampler2D uImgMid;
uniform sampler2D uMaskA;
uniform sampler2D uMaskB;
uniform float uLcSize;
uniform vec4 uVeg;        // green flush, Joshua bloom, wildflowers, monsoon
uniform vec4 uDesert;     // bleach, heat, creosote bloom, dust
uniform vec2 uOrigin;     // grid origin, snapped to the cell size
uniform float uSpacing;   // cell size (m)
uniform float uN;         // cells per side
uniform vec2 uFadeIn;     // density ramps up between these distances
uniform vec2 uFadeOut;    // and back down between these
uniform float uGrassH;    // seasonal height of the annuals (m)
uniform float uSeedHead;  // 0..1 share of grasses in seed
uniform vec4 uCar;        // player truck: x, z, sin(heading), cos(heading); 0 heading vector = none
uniform float uSnowCover;
${snowCommon}
uniform float uRain;
in float aBlade;          // blade index within the clump
${windCommon}
out vec3 vWorld;
out vec3 vColor;
out vec3 vNormal;
out float vY;
out float vGust;
out float vHead;

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void collapse() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vWorld = vec3(0.0); vColor = vec3(0.0); vNormal = vec3(0.0, 1.0, 0.0); vY = 0.0; vGust = 0.0; vHead = 0.0;
}

void main() {
  int id = gl_InstanceID;
  int n = int(uN);
  vec2 cell = vec2(float(id % n), float(id / n));
  vec2 cc = uOrigin + (cell - uN * 0.5) * uSpacing;
  float r0 = h21(cc * 0.173 + 1.7);
  float r1 = h21(cc * 0.311 + 9.2);
  vec2 centre = cc + (vec2(r0, r1) - 0.5) * uSpacing;
  float d = distance(centre, uCamPos.xz);
  float keep = smoothstep(uFadeIn.x, uFadeIn.y, d) * (1.0 - smoothstep(uFadeOut.x, uFadeOut.y, d));
  if (h21(cc * 0.07 + 3.3) > keep) { collapse(); return; }
  vec2 dCar = centre - uCar.xy;
  if (dot(uCar.zw, uCar.zw) > 0.5 && abs(dot(dCar, uCar.zw)) < 3.1 && abs(dot(dCar, vec2(uCar.w, -uCar.z))) < 1.15) { collapse(); return; }

  // Habitat: open desert between the shrubs, thickest in the washes.
  vec2 lcUV = centre / uLcSize + 0.5;
  vec4 mA = texture(uMaskA, lcUV);
  vec4 mB = texture(uMaskB, lcUV);
  float hC = terrainHeight(centre);
  float wIn = regionWeight(uRegionSize.x, centre);
  vec3 photo = textureLod(uImgInner, regionUV(centre, uRegionSize.x), 0.0).rgb;
  if (wIn < 1.0) photo = mix(textureLod(uImgMid, regionUV(centre, uRegionSize.y), 0.0).rgb, photo, wIn);
  vec3 alb = photo * 0.8;
  float l = luma(alb);
  vec3 nrm = normalize(vec3(hC - terrainHeight(centre + vec2(4.0, 0.0)), 4.0, hC - terrainHeight(centre + vec2(0.0, 4.0))));
  float rocky = max(mB.g, smoothstep(0.35, 0.55, 1.0 - nrm.y));
  vec2 wl = waterAt(centre);
  if (wl.y > 0.01 && wl.x > hC - 0.1) { collapse(); return; }
  float scrub = clamp(mA.r + mA.g + mA.b + mB.r, 0.0, 1.0);
  float habitat = scrub * (1.0 - rocky) * (1.0 - mA.a) * (1.0 - mB.b * 0.85);
  float green = clamp(max(uVeg.x, uVeg.w * 0.8) + clamp(-nrm.z * 0.6, 0.0, 0.4) * 0.3, 0.0, 1.0);
  // Perennial bunchgrass is always there but sparse; a wet year carpets the
  // ground with brome and annuals, and the washes stay lusher than the flats.
  float patchy = vnoise(centre / 7.0) * 0.6 + vnoise(centre / 1.9) * 0.4;
  float cover = (0.05 + 0.32 * green + 0.3 * mB.r) * (0.2 + 1.4 * patchy * patchy);
  if (h21(cc * 0.53 + 7.7) > cover * habitat) { collapse(); return; }

  // Blade.
  float b = aBlade;
  float rb0 = h21(cc + b * 7.13);
  float rb1 = h21(cc * 1.7 + b * 3.71);
  float rb2 = h21(cc * 2.3 + b * 5.29);
  float rb3 = h21(cc * 3.1 + b * 1.93);
  float kind = h21(cc * 0.91 + 4.4); // whole clump shares one plant type
  float ang = rb0 * 6.2832;
  float coarse = step(1.0, uSpacing);

  // Plant type: wildflower, galleta bunchgrass tuft, or a fuzz of red brome.
  float drift = smoothstep(0.5, 0.72, fbm(centre / 45.0 + 3.1, 3));
  float forbShare = uVeg.z * (0.15 + 0.6 * drift) + 0.04;
  bool forb = kind < forbShare;
  bool tuft = !forb && kind < forbShare + 0.25 + 0.4 * (1.0 - green);
  bool brome = !forb && !tuft;
  bool flower = forb && rb2 < uVeg.z * (0.45 + drift);
  // Annuals green up fast after rain and cure all at once.
  float fresh = smoothstep(0.08, 0.35, green);

  vec2 root = centre + vec2(cos(ang), sin(ang)) * sqrt(rb1) * uSpacing * (tuft ? 0.18 : 0.55);
  float height;
  float width = 0.011 * max(uSpacing / 0.36, 1.0) * (0.7 + 0.6 * rb1);
  float leanAmt;
  float y = position.y;
  float wMul = 1.0;
  if (tuft) {
    // Stiff, upright fountain of wiry blades with seed spikes in summer.
    height = (0.28 + 0.3 * rb2) * mix(1.0, 1.3, coarse);
    leanAmt = 0.15 + 0.35 * rb1;
    width *= 0.8;
    if (rb3 < uSeedHead * 0.4) { height *= 1.4; wMul = y > 0.7 ? 1.8 : 0.5; }
  } else if (brome) {
    height = uGrassH * (0.5 + 0.9 * rb2) * mix(1.0, 1.4, coarse);
    leanAmt = 0.35 + 0.4 * rb1;
    if (rb3 < uSeedHead * 0.7) { wMul = y > 0.65 ? 2.0 * sin((y - 0.65) / 0.35 * 3.1416) + 0.5 : 0.6; leanAmt += 0.3; }
  } else if (flower) {
    height = 0.14 + 0.3 * rb1;
    wMul = y > 0.7 ? 7.0 : 1.4;
    leanAmt = 0.06;
  } else {
    // Grey-green rosette leaf splayed on the ground.
    height = 0.08 + 0.1 * rb1;
    wMul = 3.6 * (1.0 - 0.4 * y);
    leanAmt = 1.6;
  }
  width *= wMul;

  float snowHere = snowAmount(vec3(0.0, 1.0, 0.0), root, terrainHeight(root));
  float snowDepth = snowHere * 0.12 * (0.6 + 0.8 * vnoise(root / 3.0));
  if (height < snowDepth + 0.04) { collapse(); return; }
  leanAmt += snowHere * 0.4 + uRain * 0.2;

  float face = rb2 * 6.2832;
  vec3 across = vec3(cos(face), 0.0, sin(face));
  vec3 bendDir = normalize(vec3(cos(ang + 0.6), 0.0, sin(ang + 0.6)));

  vec2 wdir = windDir();
  float ws = length(uWind);
  float gust = windGust(root);
  float stiff = forb ? 0.35 : tuft ? 0.6 : 1.0;
  float sway = stiff * ((0.06 + 0.05 * ws) * (0.5 + gust * 2.2) + 0.05 * (0.4 + ws * 0.1) * sin(uTime * (2.4 + 1.2 * rb0) + dot(root, wdir) * 0.9));
  sway = min(sway, 1.3);
  vec3 lean = bendDir * leanAmt + vec3(wdir.x, 0.0, wdir.y) * sway;
  vec3 p = vec3(root.x, terrainHeight(root), root.y);
  p += across * position.x * width;
  p += lean * height * y * y;
  p.y += height * y * (1.0 - 0.25 * min(dot(lean, lean), 2.0) * y);

  vWorld = p;
  vY = y;
  vGust = gust * stiff;
  vNormal = normalize(cross(across, normalize(lean * 2.0 * y + vec3(0.0, 1.0, 0.0))));

  // Tone: the photo's soil tone bleached into straw, or spring green.
  vec3 col;
  vHead = 0.0;
  float hue = vnoise(centre / 3.1);
  if (tuft) {
    vec3 cured = mix(vec3(0.34, 0.30, 0.22), vec3(0.40, 0.35, 0.26), hue) * (0.8 + 0.4 * rb0);
    vec3 live = mix(vec3(0.17, 0.21, 0.10), vec3(0.24, 0.26, 0.13), hue);
    // Last year's straw stays in the tuft; new growth fills it from the base.
    col = mix(cured, live, fresh * 0.8 * smoothstep(0.9, 0.2, y) * step(0.3, rb2));
    col = mix(col, cured * 1.1, uDesert.x * 0.5);
  } else if (brome) {
    // Red brome cures from green to a rusty purple-tan by May.
    vec3 cured = mix(vec3(0.36, 0.27, 0.20), vec3(0.42, 0.33, 0.25), hue) * (0.8 + 0.4 * rb0);
    vec3 live = mix(vec3(0.12, 0.19, 0.05), vec3(0.19, 0.24, 0.08), hue) * (0.85 + 0.3 * rb0);
    col = mix(cured, live, fresh);
    if (rb3 < uSeedHead * 0.7 && y > 0.65) { col = mix(vec3(0.38, 0.22, 0.18), vec3(0.28, 0.30, 0.12), fresh); vHead = 1.0; }
  } else {
    col = mix(vec3(0.22, 0.25, 0.17), vec3(0.32, 0.31, 0.25), 1.0 - green) * (0.8 + 0.4 * rb0);
    if (flower && y > 0.7) {
      float k = h21(root * 0.37 + floor(centre / 9.0));
      col = k < 0.3 ? vec3(0.80, 0.62, 0.04)    // desert marigold, desert dandelion
          : k < 0.5 ? vec3(0.80, 0.36, 0.10)    // apricot globemallow
          : k < 0.68 ? vec3(0.26, 0.20, 0.58)   // Arizona lupine
          : k < 0.8 ? vec3(0.42, 0.24, 0.55)    // notch-leaf phacelia, chia
          : k < 0.9 ? vec3(0.72, 0.36, 0.52)    // sand verbena
          : vec3(0.86, 0.84, 0.78);             // dune evening primrose
      vHead = 2.0;
    }
  }
  col = mix(vec3(0.15, 0.13, 0.10) * (0.8 + 0.4 * rb1), col, smoothstep(0.0, 0.3, y));
  col = mix(col, vec3(0.86, 0.89, 0.93), snowHere * smoothstep(0.3, 1.0, y) * (0.25 + 0.3 * rb1));
  vColor = col;

  vec2 dc = p.xz - uCamPos.xz;
  p.y -= dot(dc, dc) / (2.0 * 7310000.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const grassFragment = /* glsl */ `
${lightingCommon}
#include <logdepthbuf_pars_fragment>
in vec3 vWorld;
in vec3 vColor;
in vec3 vNormal;
in float vY;
in float vGust;
in float vHead;
out vec4 outColor;

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(n, V) < 0.0) n = -n;
  vec3 alb = vColor;
  // Spikelets: break the seed heads into little bracts.
  if (vHead > 0.5 && vHead < 1.5) alb *= 0.75 + 0.5 * step(0.5, fract(vY * 38.0));
  alb *= 1.0 + 0.2 * vGust * vY;
  n = normalize(n + vec3(0.0, 0.9, 0.0));
  float shadow = shadowAt(vWorld + vec3(0.0, 0.3, 0.0), 0.0004);
  float ao = mix(0.4, 1.0, vY);
  alb = wetten(alb, 0.7);
  vec3 col = shadeSurface(alb, n, vWorld, ao, mix(mix(0.8, 0.55, vGust), 0.3, uWet), shadow);
  if (uWet > 0.05) {
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(normalize(vNormal), V), 0.0), 5.0);
    col += skyRadianceDir(reflect(-V, n)) * F * uWet * 0.35 * vY;
  }
  // Dry grass glows gold when backlit by a low sun.
  float back = pow(max(dot(-V, uSunDir), 0.0), 3.0);
  col += alb * sunRadiance(vWorld.y) * back * shadow * 0.4 * vY;
  col = applyAtmosphere(col, vWorld);
  outColor = vec4(col, 1.0);
}
`;
