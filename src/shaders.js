export const vertex = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const header = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 frag;
`;

const sampling = `
uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uScale;
uniform float uReferenceScale;
uniform float uBrightness;
uniform float uContrast;
uniform float uThreshold;
uniform float uCeiling;
uniform int uColorMode;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uColorAngle;
uniform float uColorShading;
uniform int uMaskMode;
uniform float uMaskAngle;
uniform float uMaskPosition;
uniform float uMaskFeather;
uniform vec2 uMaskCenter;
uniform float uMaskRadius;
uniform int uMaskInvert;
uniform sampler2D uPaintMask;
uniform int uSelectionActive;
vec2 topUV(vec2 uv) { return vec2(uv.x, 1.0 - uv.y); }
vec2 referencePixel() {
  return ((vUV * uResolution - uResolution * 0.5 - uOffset) / uScale + uResolution * 0.5);
}
vec4 sourceAt(vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) return vec4(0.0);
  return texture(uSource, uv);
}
vec3 adjusted(vec3 rgb) {
  return clamp((rgb - 0.5) * uContrast + 0.5, 0.0, 1.0) * uBrightness;
}
float luminance(vec3 rgb) { return dot(rgb, vec3(0.2126, 0.7152, 0.0722)); }
vec3 layerColor(vec3 rgb, vec2 uv) {
  if (uColorMode == 1) return uColor * min(luminance(rgb), 1.0);
  if (uColorMode == 2) return uColor * mix(1.0, min(luminance(rgb), 1.0), uColorShading);
  if (uColorMode == 3) {
    vec2 axis = vec2(cos(uColorAngle), sin(uColorAngle));
    float t = clamp(dot(topUV(uv) - 0.5, axis) + 0.5, 0.0, 1.0);
    return mix(uColor, uColor2, t) * mix(1.0, min(luminance(rgb), 1.0), uColorShading);
  }
  return rgb;
}
float selection(vec2 uv) {
  if (uSelectionActive == 1) {
    vec2 world = (uv - .5) * uScale + .5 + uOffset / uResolution;
    if (any(lessThan(world, vec2(0.0))) || any(greaterThanEqual(world, vec2(1.0)))) return 0.0;
    return texture(uPaintMask, topUV(world)).r;
  }
  if (uMaskMode == 0) return 1.0;
  vec2 p = topUV(uv);
  float distance = uMaskMode == 1 ? dot(p - 0.5, vec2(cos(uMaskAngle), sin(uMaskAngle))) - (uMaskPosition - 0.5) : length(p - uMaskCenter) - uMaskRadius;
  float feather = max(0.00001, uMaskFeather);
  float coverage = 1.0 - smoothstep(-feather * 0.5, feather * 0.5, distance);
  return uMaskInvert == 1 ? 1.0 - coverage : coverage;
}
`;

export const drawing = header + sampling + `
uniform sampler2D uAtlas;
uniform float uCellSize;
uniform float uSize;
uniform float uDensity;
uniform float uDensityShading;
uniform float uDensityGamma;
uniform int uDensityPattern;
uniform float uToneSize;
uniform float uDetail;
uniform float uSeed;
uniform float uClumping;
uniform int uType;
uniform int uPixelShape;
uniform int uSymbolCount;
uniform int uMapping;
uniform int uInvert;
uniform int uShapes;
uniform int uShapeIds[6];
uniform float uStroke;
uniform int uMaskScatter;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 19.19) * 43758.5453); }
float clusterNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell + 41.0), hash(cell + vec2(1.0, 0.0) + 41.0), f.x), mix(hash(cell + vec2(0.0, 1.0) + 41.0), hash(cell + 1.0 + 41.0), f.x), f.y);
}
float orderedThreshold(vec2 p) {
  // Bayer coverage keeps brightness-driven spacing regular rather than producing random grain.
  ivec2 tile = ivec2(mod(p, 4.0));
  const int values[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(values[tile.y * 4 + tile.x]) + 0.5) / 16.0;
}
float inside(float distance, float aa) { return 1.0 - smoothstep(-aa, aa, distance); }
float geometricMask(int shape, vec2 local, float aa) {
  vec2 q = abs(local - 0.5);
  float box = max(q.x, q.y);
  if (shape == 0) return inside(length(q) - 0.43, aa);
  if (shape == 1) return inside(box - 0.47, aa);
  if (shape == 2) return max(0.0, inside(box - 0.47, aa) - inside(box - (0.47 - uStroke), aa));
  if (shape == 3) return inside(min(q.x, q.y) - uStroke * 0.5, aa) * inside(box - 0.46, aa);
  if (shape == 4) return inside(pow(q.x / 0.48, 0.55) + pow(q.y / 0.48, 0.55) - 1.0, aa * 3.0);
  float diamond = q.x + q.y;
  return max(0.0, inside(diamond - 0.48, aa) - inside(diamond - (0.48 - uStroke), aa));
}
void main() {
  float cell = max(1.0, uCellSize * uReferenceScale);
  vec2 p = referencePixel();
  float pixelStep = max(fwidth(p.x), fwidth(p.y));
  vec2 grid = floor(p / cell);
  vec2 center = (grid + 0.5) * cell;
  vec4 sampleColor = sourceAt(center / uResolution);
  vec3 rgb = adjusted(sampleColor.a > 0.001 ? sampleColor.rgb / sampleColor.a : vec3(0.0));
  float light = clamp(luminance(rgb), 0.0, 1.0);
  float coverage = selection(center / uResolution);
  float toneDensity = pow(clamp((light - uThreshold) / max(0.001, uCeiling - uThreshold), 0.0, 1.0), uDensityGamma);
  float density = uDensity * mix(1.0, toneDensity, uDensityShading);
  float rank = uDensityPattern == 1 ? orderedThreshold(grid) : mix(hash(grid), clusterNoise(center / uReferenceScale / 72.0), uClumping);
  if ((uSelectionActive == 0 && (sampleColor.a < 0.001 || light < uThreshold || light > uCeiling)) || rank >= density * (uMaskScatter == 1 ? coverage : 1.0)) { frag = vec4(0.0); return; }
  if (uMaskScatter == 1) coverage = 1.0;
  float size = uSize * mix(1.0, mix(0.4, 1.0, light), uToneSize);
  vec2 local = (p / cell - grid - 0.5) / size + 0.5;
  // Derivatives of the continuous coordinate stay stable across cell boundaries.
  // Differentiating fract/grid-local coordinates creates false corners and broken marks.
  float aa = max(0.0001, 0.6 * pixelStep / (cell * size));
  float mask = 0.0;
  if (uType == 0 && uSymbolCount > 0) {
      float value = uInvert == 1 ? 1.0 - light : light;
      float index = min(float(uSymbolCount - 1), floor((uMapping == 1 ? hash(grid + 29.0) : value) * float(uSymbolCount)));
      if (uShapes == 1) mask = geometricMask(uShapeIds[int(index)], local, aa);
      else if (all(greaterThanEqual(local, vec2(0.0))) && all(lessThan(local, vec2(1.0)))) {
        // Text uses an atlas; geometric shapes use analytic masks for crisp subpixel outlines.
        vec2 uv = vec2((index + mix(0.015, 0.985, local.x)) / float(uSymbolCount), local.y);
        mask = texture(uAtlas, uv).a;
      }
  } else if (uType == 1) {
      vec2 edge = abs(local - 0.5);
      if (uPixelShape == 1) mask = geometricMask(0, local, aa);
      else if (uPixelShape == 2) mask = geometricMask(2, local, aa);
      else mask = 1.0 - smoothstep(0.49 - aa, 0.49 + aa, max(edge.x, edge.y));
  }
  if (uDetail > 0.0) {
    vec4 detailSample = sourceAt(p / uResolution);
    if (detailSample.a > 0.001) rgb = mix(rgb, adjusted(detailSample.rgb / detailSample.a), uDetail);
  }
  float alpha = max(0.0, mask) * (uSelectionActive == 1 ? 1.0 : sampleColor.a) * coverage;
  frag = vec4(layerColor(rgb, center / uResolution) * alpha, alpha);
}`;

export const extractGlow = header + sampling + `
uniform int uBox;
uniform float uCellSize;
void main() {
  vec2 p = referencePixel();
  if (uBox == 1) {
    float cell = max(1.0, uCellSize * uReferenceScale);
    p = (floor(p / cell) + 0.5) * cell;
  }
  vec4 source = sourceAt(p / uResolution);
  vec3 straight = source.a > 0.001 ? source.rgb / source.a : vec3(0.0);
  vec3 rgb = adjusted(straight);
  float light = clamp(luminance(rgb), 0.0, 1.0);
  float gate = smoothstep(uThreshold, uThreshold + 0.06, light) * (1.0 - smoothstep(uCeiling, uCeiling + 0.01, light));
  // A ceiling of one includes highlights rather than cutting them off.
  if (uCeiling >= 0.999) gate = smoothstep(uThreshold, uThreshold + 0.06, light);
  gate *= selection(p / uResolution);
  frag = vec4(layerColor(rgb, p / uResolution) * source.a * gate, source.a * gate);
}`;

export const blur = header + `
uniform sampler2D uInput;
uniform vec2 uDirection;
uniform float uRadius;
uniform int uBox;
void main() {
  if (uRadius < 0.01) { frag = texture(uInput, vUV); return; }
  vec4 sum = vec4(0.0);
  float weights = 0.0;
  // Fixed taps keep cost independent of blur radius. Two passes form a square box or soft bloom.
  for (int i = -8; i <= 8; i++) {
    float x = float(i) / 8.0;
    float w = uBox == 1 ? 1.0 : exp(-x * x * 4.5);
    vec2 uv = vUV + uDirection * x * uRadius;
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) sum += texture(uInput, uv) * w;
    weights += w;
  }
  frag = sum / weights;
}`;

export const composite = header + `
uniform sampler2D uBase;
uniform sampler2D uLayer;
uniform float uOpacity;
uniform float uStrength;
uniform int uBlend;
void main() {
  vec4 base = texture(uBase, vUV);
  vec4 layer = texture(uLayer, vUV);
  float alpha = clamp(layer.a * uOpacity * min(uStrength, 1.0), 0.0, 1.0);
  vec3 premul = layer.rgb * uOpacity * uStrength;
  vec3 result;
  if (uBlend == 2) result = base.rgb + premul;
  else if (uBlend == 1) result = 1.0 - (1.0 - base.rgb) * (1.0 - clamp(premul, 0.0, 1.0));
  else if (uBlend == 3) result = base.rgb * (vec3(1.0 - alpha) + premul);
  else result = premul + base.rgb * (1.0 - alpha);
  float outputAlpha = alpha + base.a * (1.0 - alpha);
  frag = vec4(result, outputAlpha);
}`;

export const base = header + `
uniform sampler2D uSource;
uniform vec3 uBackground;
uniform vec3 uSourceTint;
uniform float uSourceOpacity;
void main() {
  vec4 source = texture(uSource, vUV);
  float alpha = source.a * uSourceOpacity;
  frag = vec4(source.rgb * uSourceTint * uSourceOpacity + uBackground * (1.0 - alpha), 1.0);
}`;

export const copy = header + `
uniform sampler2D uInput;
void main() { frag = texture(uInput, vUV); }
`;

export const dotAnalysis = header + sampling + `
uniform vec2 uDotCell;
uniform vec2 uDotGrid;
uniform sampler2D uProfiles;
uniform float uDotEdges;
uniform float uDotGamma;
uniform float uDensity;
uniform float uDensityGamma;
uniform int uInvert;
uniform int uMaskScatter;
void main() {
  ivec2 stored = ivec2(gl_FragCoord.xy);
  vec2 center = (vec2(stored.x / 2, stored.y) + 0.5) * uDotCell;
  vec3 color = vec3(0.0);
  float alpha = 0.0;
  float values[9];
  float tone = 0.0;
  // Average a 3x3 neighborhood per character, once on a small analysis surface.
  // Empty source pixels contribute black, preserving silhouettes and gaps.
  for (int i = 0; i < 9; i++) {
    vec2 delta = vec2(float(i % 3 - 1), float(i / 3 - 1)) * uDotCell / 3.0;
    vec4 sampleColor = sourceAt((center + delta) / uResolution);
    vec3 straight = sampleColor.a > 0.001 ? sampleColor.rgb / sampleColor.a : vec3(0.0);
    vec3 rgb = pow(clamp(adjusted(straight), 0.0, 1.0), vec3(1.0 / uDotGamma));
    color += rgb * sampleColor.a;
    alpha += sampleColor.a;
    values[i] = luminance(rgb) * sampleColor.a;
    tone += values[i] / 9.0;
  }
  color /= max(alpha, 0.001);
  if (stored.x % 2 == 0) { frag = vec4(color, 1.0); return; }
  float total = uDotGrid.x * uDotGrid.y;
  float level = pow(clamp((tone - uThreshold) / max(0.001, uCeiling - uThreshold), 0.0, 1.0), uDensityGamma);
  if (uInvert == 1) level = 1.0 - level;
  float coverage = uMaskScatter == 1 ? selection(center / uResolution) : 1.0;
  int filled = int(floor(level * uDensity * coverage * total + 0.5));
  if (alpha < 0.001 || tone > uCeiling) filled = 0;
  float norm = 0.0;
  for (int i = 0; i < 9; i++) { values[i] -= tone; norm += values[i] * values[i]; }
  norm = sqrt(norm);
  float edge = clamp((norm - 0.1) / 0.3, 0.0, 1.0);
  int best = 0;
  float bestCost = 100.0;
  if (edge > 0.0 && uDotEdges > 0.0 && filled > 0 && float(filled) < total) {
    for (int order = 0; order < 9; order++) {
      float correlation = 0.0;
      float glyphNorm = 0.0;
      for (int part = 0; part < 3; part++) {
        vec4 descriptor = texelFetch(uProfiles, ivec2(filled * 3 + part, order), 0);
        vec3 direction = descriptor.rgb * 2.0 - 1.0;
        correlation += dot(vec3(values[part * 3], values[part * 3 + 1], values[part * 3 + 2]), direction);
        glyphNorm = descriptor.a;
      }
      float cost = (1.0 - edge) * 0.012 * glyphNorm * glyphNorm + uDotEdges * edge * 0.04 * (1.0 - correlation / max(norm, 0.001));
      if (cost < bestCost) { bestCost = cost; best = order; }
    }
  }
  // Two RGBA8 texels per cell: average color, then glyph population/order/alpha.
  frag = vec4(float(filled) / 255.0, float(best) / 255.0, alpha / 9.0, 1.0);
}`;

export const dotDrawing = header + sampling + `
uniform sampler2D uDotMap;
uniform sampler2D uDotMasks;
uniform vec2 uDotCell;
uniform vec2 uDotGrid;
uniform float uSize;
uniform int uMaskScatter;
void main() {
  vec2 p = referencePixel();
  float pixelStep = max(fwidth(p.x), fwidth(p.y));
  ivec2 grid = ivec2(floor(p / uDotCell));
  ivec2 mapSize = textureSize(uDotMap, 0);
  if (any(lessThan(grid, ivec2(0))) || grid.x * 2 >= mapSize.x || grid.y >= mapSize.y) { frag = vec4(0.0); return; }
  vec4 glyph = texelFetch(uDotMap, ivec2(grid.x * 2 + 1, grid.y), 0);
  int filled = int(floor(glyph.r * 255.0 + 0.5));
  int order = int(floor(glyph.g * 255.0 + 0.5));
  vec2 within = (p / uDotCell - vec2(grid)) * uDotGrid;
  ivec2 dotIndex = ivec2(floor(within));
  float occupied = texelFetch(uDotMasks, ivec2(filled * int(uDotGrid.x) + dotIndex.x, order * int(uDotGrid.y) + dotIndex.y), 0).r;
  vec2 spacing = uDotCell / uDotGrid;
  float radius = min(spacing.x, spacing.y) * 0.43 * uSize;
  float distance = length((fract(within) - 0.5) * spacing) - radius;
  float circle = 1.0 - smoothstep(-0.6 * pixelStep, 0.6 * pixelStep, distance);
  vec2 center = (vec2(grid) + 0.5) * uDotCell;
  vec3 rgb = texelFetch(uDotMap, ivec2(grid.x * 2, grid.y), 0).rgb;
  float coverage = uMaskScatter == 1 ? 1.0 : selection(center / uResolution);
  float alpha = occupied * circle * glyph.b * coverage;
  frag = vec4(layerColor(rgb, center / uResolution) * alpha, alpha);
}`;

export const pointDrawing = header + sampling + `
uniform sampler2D uPointMap;
uniform vec2 uPointOrigin;
uniform float uPointCell;
uniform float uDotDiameter;
void main() {
  vec2 resolution = uResolution / uReferenceScale;
  vec2 world = topUV(vUV) * resolution;
  vec2 offset = vec2(uOffset.x, -uOffset.y) / uReferenceScale;
  vec2 p = (world - resolution * .5 - offset) / uScale + resolution * .5;
  vec2 grid = floor(p / uPointCell);
  ivec2 at = ivec2(grid - uPointOrigin);
  ivec2 mapSize = textureSize(uPointMap, 0);
  if (any(lessThan(at, ivec2(0))) || any(greaterThanEqual(at, mapSize))) { frag = vec4(0.0); return; }
  float occupied = texelFetch(uPointMap, at, 0).r;
  if (occupied < .001) { frag = vec4(0.0); return; }
  vec2 center = (grid + .5) * uPointCell;
  float aa = max(.0001, .6 * max(fwidth(p.x), fwidth(p.y)));
  float circle = 1.0 - smoothstep(-aa, aa, length(p - center) - uDotDiameter * .5);
  vec2 uv = vec2(center.x / resolution.x, 1.0 - center.y / resolution.y);
  vec4 source = sourceAt(uv);
  vec3 rgb = adjusted(source.a > .001 ? source.rgb / source.a : vec3(0.0));
  float alpha = occupied * circle;
  frag = vec4(layerColor(rgb, uv) * alpha, alpha);
}`;
