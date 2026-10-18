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
in vec4 aMat;      // roughness, emission, effect (0 none, 1 neon flicker, 2 bulb chase, 3 metal), seed
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
  albedo = texture(uMap, mix(vRect.xy, vRect.zw, fuv)).rgb;
#endif
  vec3 emit = vec3(0.0);
  if (glow > 0.0) {
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
