import { lightingCommon } from './lighting';

/**
 * Hand-built Main Street landmarks. Solids carry per-vertex colour and
 * material; sign faces (USE_MAP) sample the sign atlas and glow after dark.
 */
export const landmarkVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCamPos;
in vec3 color;
// roughness, emission, effect, seed. Effects: 0 none, 1 neon flicker, 2 bulb chase, 3 metal,
// 4 punched hotel windows, 5 glass curtain wall, 6 balconies, 7 floodlit wall. On the facade
// effects, emission is a night-time floodlight wash whose hue is fract(seed) (negative: warm white).
in vec4 aMat;
#ifdef USE_MAP
// uv (built in): 0..1 across the sign face
in vec4 aRect;     // atlas u0, v0, u1, v1
in float aFrames;  // stacked animation frames
out vec2 vUv;
flat out vec4 vRect;
flat out float vFrames;
#endif
#ifdef SHADOW_PASS
uniform mat4 uShadowMatrix;
out float vShadowZ;
#endif
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
flat out vec4 vMat;

void main() {
  vec3 world = position;
  vWorld = world;
  vNormal = normal;
  vColor = color;
  vMat = aMat;
#ifdef USE_MAP
  vUv = uv;
  vRect = aRect;
  vFrames = aFrames;
#endif
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

export const landmarkFragment = /* glsl */ `
${lightingCommon}
#include <logdepthbuf_pars_fragment>
#ifdef USE_MAP
uniform sampler2D uMap;
in vec2 vUv;
flat in vec4 vRect;
flat in float vFrames;
#endif
#ifdef SHADOW_PASS
in float vShadowZ;
#endif
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
flat in vec4 vMat;
out vec4 outColor;

void main() {
  #include <logdepthbuf_fragment>
#ifdef SHADOW_PASS
  outColor = vec4(vShadowZ, 0.0, 0.0, 1.0);
  return;
#endif
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vColor;
  float rough = vMat.x;
  float glow = vMat.y;
  float fx = vMat.z;
#ifdef USE_MAP
  // Message boards and neon signs cycle through stacked frames.
  float frame = 0.0;
  if (vFrames > 1.5) {
    float rate = fx > 0.5 && fx < 1.5 ? 0.0 : 1.0 / 4.0;
    frame = rate > 0.0
      ? mod(floor(uTime * rate + vMat.w * 7.0), vFrames)
      // Neon tube buzzing on and off at random.
      : step(0.93, hash12(vec2(floor(uTime * 6.0), vMat.w)));
  }
  vec2 fuv = vec2(vUv.x, (vUv.y + frame) / vFrames);
  vec4 tex = texture(uMap, mix(vRect.xy, vRect.zw, fuv));
  if (tex.a < 0.5) discard;
  albedo = tex.rgb;
#endif
  vec3 emit = vec3(0.0);
  if (fx > 3.5) {
    vec3 wash = vMat.w < 0.0 ? vec3(1.0, 0.86, 0.7) : clamp(abs(mod(fract(vMat.w) * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0) * 0.8 + 0.2;
    if (fx < 6.5 && abs(n.y) < 0.4) {
      // Room grid on the facade: bays 3.6 m wide, floors 3.1 m apart.
      vec2 t2 = normalize(vec2(-n.z, n.x));
      vec2 g = vec2(dot(vWorld.xz, t2) / 3.6, vWorld.y / 3.1);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      vec2 fw = fwidth(g);
      float win;
      float cover;
      if (fx < 4.5) {
        win = smoothstep(0.2 - fw.x, 0.2 + fw.x, f.x) * smoothstep(0.8 + fw.x, 0.8 - fw.x, f.x)
            * smoothstep(0.28 - fw.y, 0.28 + fw.y, f.y) * smoothstep(0.86 + fw.y, 0.86 - fw.y, f.y);
        cover = 0.35;
      } else if (fx < 5.5) {
        float mx = smoothstep(0.03 + fw.x, 0.03 - fw.x, abs(f.x * 2.0 - floor(f.x * 2.0 + 0.5)));
        float my = smoothstep(0.05 + fw.y, 0.05 - fw.y, abs(f.y - 0.5) - 0.45);
        win = 1.0 - max(mx, my);
        cover = 0.85;
      } else {
        win = smoothstep(0.06 - fw.x, 0.06 + fw.x, f.x) * smoothstep(0.94 + fw.x, 0.94 - fw.x, f.x)
            * smoothstep(0.3 - fw.y, 0.3 + fw.y, f.y) * smoothstep(0.97 + fw.y, 0.97 - fw.y, f.y);
        // Balcony slab and white rail along each floor.
        float slab = smoothstep(0.24 + fw.y, 0.24 - fw.y, f.y);
        albedo = mix(albedo, vec3(0.92, 0.91, 0.88), slab);
        cover = 0.6;
      }
      float aa = clamp(1.4 - max(fw.x, fw.y) * 2.5, 0.0, 1.0);
      win = mix(cover, win, aa);
      float h = hash12(cell + floor(vMat.w) * 17.31);
      vec3 glass = fx > 4.5 && fx < 5.5 ? vColor * 0.55 : vec3(0.09, 0.11, 0.13);
      albedo = mix(albedo, glass, win);
      rough = mix(rough, 0.1, win);
      // Rooms lit after dark: mostly warm lamps, the odd cool TV glow, curtains half drawn.
      float lit = mix(0.55, step(0.45, h), aa) * win;
      vec3 lc = mix(vec3(1.0, 0.7, 0.4), vec3(0.75, 0.85, 1.0), step(0.88, h)) * (0.45 + 0.55 * fract(h * 7.31));
      emit += lc * lit * uNight * 0.3 * uInvExposure;
    }
    emit += wash * vColor * glow * uNight * 0.16 * uInvExposure;
  } else if (glow > 0.0) {
    float on = 1.0;
    if (fx > 1.5 && fx < 2.5) {
      // Marquee bulbs chasing along the sign.
      float k = fract(vWorld.x * 0.9 + vWorld.z * 0.9 - uTime * 2.5);
      on = 0.35 + 0.65 * step(0.5, k);
    }
    // Lit signs are readable by day and blaze at night.
    emit = albedo * albedo * glow * on * mix(0.08, 0.6, uNight) * uInvExposure;
    albedo *= 0.8;
  }
  if (fx > 2.5 && fx < 3.5) rough = 0.3;
  float shadow = shadowAt(vWorld + n * 0.2, 0.0012);
  vec3 col = shadeSurface(albedo * 0.85, n, vWorld, 1.0, rough, shadow) + emit;
  col = applyAtmosphere(col, vWorld);
  outColor = vec4(col, 1.0);
}
`;
