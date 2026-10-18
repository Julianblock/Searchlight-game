/** GPU mirror of Heightfield: nested-region height and normal sampling. */
export const terrainCommon = /* glsl */ `
#ifndef TERRAIN_COMMON
#define TERRAIN_COMMON

uniform sampler2D uHDetail; // inner region in the top half, Laughlin in the bottom half
uniform sampler2D uHMid;
uniform sampler2D uHFar;
uniform vec3 uRegionSize; // inner, mid, far
uniform vec3 uLauRect; // Laughlin region centre x, z and size

float regionWeight(float size, vec2 xz) {
  float e = max(abs(xz.x), abs(xz.y)) / (size * 0.5);
  return clamp((1.0 - e) / 0.06, 0.0, 1.0);
}

vec3 regionWeights(vec2 xz) {
  return vec3(regionWeight(uRegionSize.x, xz), regionWeight(uRegionSize.y, xz), 1.0);
}

vec2 regionUV(vec2 xz, float size) { return xz / size + 0.5; }

float lauWeight(vec2 xz) {
  vec2 d = abs(xz - uLauRect.xy);
  return clamp((1.0 - max(d.x, d.y) / (uLauRect.z * 0.5)) / 0.06, 0.0, 1.0);
}

/** Atlas UV for a region stacked into one half of a detail texture with \`res\` texels per side. */
vec2 atlasUV(vec2 uv, float res, float slot) {
  uv = clamp(uv, vec2(0.5 / res), vec2(1.0 - 0.5 / res));
  return vec2(uv.x, (uv.y + slot) * 0.5);
}
vec2 innerUV(vec2 xz, float res) { return atlasUV(regionUV(xz, uRegionSize.x), res, 0.0); }
vec2 lauUV(vec2 xz, float res) { return atlasUV((xz - uLauRect.xy) / uLauRect.z + 0.5, res, 1.0); }

/** x: height (m), y: baked ambient occlusion */
vec2 terrainSample(vec2 xz) {
  vec3 w = regionWeights(xz);
  vec2 s = vec2(textureLod(uHFar, regionUV(xz, uRegionSize.z), 0.0).r, 1.0);
  if (w.y > 0.0) s = mix(s, textureLod(uHMid, regionUV(xz, uRegionSize.y), 0.0).rg, w.y);
  float wl = lauWeight(xz);
  if (wl > 0.0) s = mix(s, textureLod(uHDetail, lauUV(xz, 2048.0), 0.0).rg, wl);
  if (w.x > 0.0) s = mix(s, textureLod(uHDetail, innerUV(xz, 2048.0), 0.0).rg, w.x);
  return s;
}

float terrainHeight(vec2 xz) { return terrainSample(xz).x; }

vec3 terrainNormal(vec2 xz, float e) {
  float hl = terrainHeight(xz - vec2(e, 0.0));
  float hr = terrainHeight(xz + vec2(e, 0.0));
  float hd = terrainHeight(xz - vec2(0.0, e));
  float hu = terrainHeight(xz + vec2(0.0, e));
  return normalize(vec3(hl - hr, 2.0 * e, hd - hu));
}

/** Sample spacing that matches the finest region covering a point. */
float terrainTexel(vec2 xz) {
  vec3 w = regionWeights(xz);
  if (w.x > 0.0) return uRegionSize.x / 2048.0;
  if (lauWeight(xz) > 0.0) return uLauRect.z / 2048.0;
  if (w.y > 0.0) return uRegionSize.y / 2048.0;
  return uRegionSize.z / 1024.0;
}

#endif
`;
