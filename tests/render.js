import { Renderer } from '../src/engine.js';
import { createLayer } from '../src/model.js';
import { loadPeonySource } from '../src/presets.js';

const results = [];
const assert = (condition, detail) => { if (!condition) throw new Error(detail); };
function test(name, fn) {
  try { fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
const source = document.createElement('canvas'); source.width = source.height = 128;
const ctx = source.getContext('2d');
const renderer = new Renderer(document.querySelector('#canvas'));
const project = layers => ({ background: '#000000', sourceOpacity: 0, layers });
const sum = pixels => pixels.reduce((value, channel, i) => value + (i % 4 < 3 ? channel : 0), 0);
const snapshot = (layers, options = {}) => {
  renderer.render(project(layers), { maxEdge: 128, ...options });
  const pixels = new Uint8Array(renderer.width * renderer.height * 4);
  renderer.gl.readPixels(0, 0, renderer.width, renderer.height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
  assert(renderer.gl.getError() === renderer.gl.NO_ERROR, 'WebGL error');
  return pixels;
};
const pixel = (pixels, x, y) => [...pixels.slice(((renderer.height - 1 - y) * renderer.width + x) * 4, ((renderer.height - 1 - y) * renderer.width + x) * 4 + 3)];
function fillWhite() { ctx.clearRect(0, 0, 128, 128); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128); renderer.setSource(source); }
fillWhite();

test('Pixel and ASCII layers both draw; an empty character set draws nothing', () => {
  const p = createLayer('pixel', { cellSize: 8 });
  const a = createLayer('ascii', { characters: 'X', cellSize: 8 });
  assert(sum(snapshot([p])) > 0, 'Pixels missing'); assert(sum(snapshot([a])) > 0, 'ASCII missing');
  a.characters = ''; assert(sum(snapshot([a])) === 0, 'Empty set produced symbols');
});
test('Symbols are isolated between layers and selection modes', () => {
  const a = createLayer('ascii', { characters: 'X', cellSize: 12 });
  const b = createLayer('ascii', { characters: 'O', cellSize: 12 });
  const before = snapshot([b]); snapshot([a]); a.characters = '@'; snapshot([a]);
  const after = snapshot([b]); assert(before.every((value, i) => value === after[i]), 'Editing A changed B');
  b.symbolMode = 'shapes'; b.shapes = []; assert(sum(snapshot([b])) === 0, 'Unselected shapes appeared');
});
test('Positive offsets move the layer right and down; transparent margins remain empty', () => {
  ctx.clearRect(0, 0, 128, 128); ctx.fillStyle = '#ff0000'; ctx.fillRect(16, 16, 32, 32); renderer.setSource(source);
  const p = createLayer('pixel', { cellSize: 8, size: 1, offsetX: 32, offsetY: 40 });
  const image = snapshot([p]);
  assert(pixel(image, 28, 28)[0] === 0, 'Old position still visible');
  assert(pixel(image, 60, 68)[0] > 220, 'Incorrect transform or vertical orientation');
  p.scale = 0.5; const scaled = snapshot([p]); assert(sum(scaled) < sum(image) * 0.4, 'Scale did not reduce coverage');
});
test('Opacity zero and hidden layers make no contribution', () => {
  fillWhite(); const a = createLayer('ascii', { characters: 'X', opacity: 0 });
  assert(sum(snapshot([a])) === 0, 'Zero opacity contributed'); a.opacity = 1; a.enabled = false;
  assert(sum(snapshot([a])) === 0, 'Hidden layer contributed');
});
test('Layer order changes normal blending and preserves both layers with add', () => {
  fillWhite();
  const red = createLayer('pixel', { size: 1, cellSize: 8, colorMode: 'tint', color: '#ff0000' });
  const blue = createLayer('pixel', { size: 1, cellSize: 8, colorMode: 'tint', color: '#0000ff' });
  let image = snapshot([red, blue]); assert(pixel(image, 28, 28)[2] > 200, 'Top blue layer missing');
  image = snapshot([blue, red]); assert(pixel(image, 28, 28)[0] > 200, 'Top red layer missing');
  blue.blend = 'add'; image = snapshot([red, blue]); const rgb = pixel(image, 28, 28);
  assert(rgb[0] > 200 && rgb[2] > 200, 'Add did not retain both layers');
});
test('Glow targets chosen drawing layer and disappears when that target is hidden', () => {
  fillWhite(); const a = createLayer('ascii', { characters: '+', cellSize: 24, size: 0.7, colorMode: 'tint', color: '#00ff00' });
  const glow = createLayer('glow', { glowSource: a.id, radius: 14, strength: 2, threshold: 0 });
  const plain = snapshot([a]); const bloomed = snapshot([a, glow]);
  assert(sum(bloomed) > sum(plain), 'ASCII glow missing');
  const rgb = pixel(bloomed, 11, 11); assert(rgb[0] < 2 && rgb[2] < 2, 'Glow sampled image rather than green ASCII');
  a.enabled = false; assert(sum(snapshot([a, glow])) === 0, 'Hidden target still glows');
});
test('Soft glow and box glow produce distinct halos', () => {
  ctx.clearRect(0, 0, 128, 128); ctx.fillStyle = '#ffffff'; ctx.fillRect(56, 56, 16, 16); renderer.setSource(source);
  const glow = createLayer('glow', { radius: 16, strength: 3, threshold: 0, cellSize: 16 });
  const soft = snapshot([glow]); glow.glowStyle = 'box'; const box = snapshot([glow]);
  assert(sum(soft) > 0 && sum(box) > 0, 'Halo missing');
  assert(soft.some((value, i) => Math.abs(value - box[i]) > 10), 'Glow styles are identical');
});
test('Glow strength zero leaves the composition untouched for every blend mode', () => {
  fillWhite();
  const a = createLayer('pixel', { colorMode: 'tint', color: '#336699' });
  const plain = snapshot([a]);
  for (const blend of ['normal', 'screen', 'add', 'multiply']) {
    const glow = createLayer('glow', { glowSource: a.id, strength: 0, blend });
    const image = snapshot([a, glow]);
    assert(plain.every((value, i) => value === image[i]), `${blend} still altered the composition`);
  }
});
test('Density, brightness limits, and brightness boost respond live', () => {
  fillWhite(); const a = createLayer('ascii', { characters: 'X', ceiling: 0.5 });
  assert(sum(snapshot([a])) === 0, 'Brightness ceiling ignored'); a.ceiling = 1;
  const dense = sum(snapshot([a])); a.density = 0.3; assert(sum(snapshot([a])) < dense * 0.6, 'Density ignored');
  a.density = 1; a.brightness = 0; assert(sum(snapshot([a])) === 0, 'Brightness ignored');
});
test('Preview resolution leaves image-relative cell count stable', () => {
  fillWhite(); const a = createLayer('pixel', { cellSize: 16, size: 0.5 });
  const full = snapshot([a]); const fullRatio = sum(full) / (128 * 128);
  const half = snapshot([a], { maxEdge: 64 }); const halfRatio = sum(half) / (64 * 64);
  assert(Math.abs(fullRatio - halfRatio) / fullRatio < 0.15, 'Preview changed cell coverage');
});
test('Layer count does not grow framebuffer allocation', () => {
  const layers = Array.from({ length: 12 }, () => createLayer('pixel', { opacity: 0.2 }));
  snapshot(layers); assert(renderer.targets.length === 5, 'Unbounded per-layer surfaces');
});
test('Linear and radial masks isolate regions and can be inverted', () => {
  fillWhite();
  const layer = createLayer('pixel', { cellSize: 8, size: 1, colorMode: 'solid', color: '#ffffff', maskMode: 'linear', maskAngle: 0, maskPosition: 0.5, maskFeather: 0 });
  let image = snapshot([layer]);
  assert(pixel(image, 20, 20)[0] > 200 && pixel(image, 100, 20)[0] === 0, 'Linear mask failed');
  layer.maskInvert = true; image = snapshot([layer]);
  assert(pixel(image, 20, 20)[0] === 0 && pixel(image, 100, 20)[0] > 200, 'Mask invert failed');
  layer.maskMode = 'radial'; layer.maskInvert = false; layer.maskRadius = 0.2;
  image = snapshot([layer]); assert(pixel(image, 64, 64)[0] > 200 && pixel(image, 12, 12)[0] === 0, 'Radial mask failed');
});
test('Geometric hollow squares preserve their hole and respond to stroke width', () => {
  fillWhite(); const layer = createLayer('ascii', { symbolMode: 'shapes', shapes: ['box'], cellSize: 16, size: 1, stroke: 0.1 });
  const thin = snapshot([layer]);
  assert(pixel(thin, 24, 24)[0] === 0 && pixel(thin, 17, 17)[0] > 100, 'Hollow square geometry failed');
  layer.stroke = 0.3;
  assert(sum(snapshot([layer])) > sum(thin) * 1.5, 'Stroke width did not change the outline');
});
test('Spatial gradients color different regions without changing the selected shape', () => {
  fillWhite();
  const layer = createLayer('pixel', { cellSize: 8, size: 1, colorMode: 'gradient', color: '#ff0000', color2: '#0000ff', colorShading: 0, colorAngle: 0 });
  const image = snapshot([layer]);
  const left = pixel(image, 12, 24), right = pixel(image, 112, 24);
  assert(left[0] > 180 && left[2] < 60 && right[2] > 180 && right[0] < 60, 'Gradient color distribution failed');
});
test('Tone-dependent density concentrates marks in brighter source regions', () => {
  ctx.fillStyle = '#404040'; ctx.fillRect(0, 0, 64, 128); ctx.fillStyle = '#ffffff'; ctx.fillRect(64, 0, 64, 128); renderer.setSource(source);
  const layer = createLayer('pixel', { cellSize: 8, size: 1, threshold: 0, densityShading: 1, colorMode: 'solid', color: '#ffffff' });
  const image = snapshot([layer]);
  let left = 0, right = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { if (x < 64) left += pixel(image, x, y)[0]; else right += pixel(image, x, y)[0]; }
  assert(left > 0 && left < right * 0.45, 'Density ignored image brightness');
});
test('Original comparison bypasses image tint', () => {
  fillWhite();
  const composition = { ...project([]), sourceOpacity: 1, sourceTint: '#ff0000' };
  renderer.render(composition, { maxEdge: 128 });
  let values = new Uint8Array(4); renderer.gl.readPixels(24, 24, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, values);
  assert(values[0] > 250 && values[1] === 0, 'Image tint missing');
  renderer.render(composition, { maxEdge: 128, original: true }); renderer.gl.readPixels(24, 24, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, values);
  assert(values[0] > 250 && values[1] > 250 && values[2] > 250, 'Original was tinted');
});
test('Dots are circular and render identically in ASCII and pixel layers', () => {
  fillWhite();
  const options = { cellSize: 8, size: 0.6, colorMode: 'solid', color: '#ffffff' };
  const ascii = createLayer('ascii', { ...options, symbolMode: 'shapes', shapes: ['dot'] });
  const image = snapshot([ascii]);
  const axis = pixel(image, 18, 19)[0], corner = pixel(image, 18, 18)[0];
  assert(axis > 220 && corner < axis * 0.6, 'Dots have square corners or broken geometry');
  assert(pixel(image, 19, 19)[0] > 240 && pixel(image, 16, 16)[0] === 0, 'Dot center or gap is incorrect');
  const pixels = snapshot([createLayer('pixel', { ...options, pixelShape: 'dot' })]);
  assert(image.every((value, i) => value === pixels[i]), 'Dot geometry differs by layer type');
});
test('Fractional dot grids keep marks separated with no edge fragments', () => {
  fillWhite();
  const image = snapshot([createLayer('ascii', { symbolMode: 'shapes', shapes: ['dot'], cellSize: 6.5, size: 0.5 })]);
  for (let y = 0; y < 128; y++) assert(pixel(image, 26, y)[0] === 0, 'Dot fragments leaked into a cell gap');
  assert(sum(image) > 0, 'Dots did not render');
});
test('Tiny circular dots retain antialiased edges outside their nominal bounding box', () => {
  fillWhite();
  const layer = createLayer('ascii', { symbolMode: 'shapes', shapes: ['dot'], cellSize: 8, size: 0.36 });
  const image = snapshot([layer]);
  assert(pixel(image, 18, 19)[0] > 10, 'Circle edge was clipped into a square');
  assert(pixel(image, 18, 18)[0] === 0, 'Circle grew square corners');
  assert(pixel(image, 19, 19)[0] > 240, 'Dot center became blurred noise');
});
test('Ordered density gives exact coverage and stays independent of random seed', () => {
  fillWhite();
  const layer = createLayer('pixel', { cellSize: 8, size: 1, density: 0.5, densityPattern: 'ordered' });
  const first = snapshot([layer]);
  let occupied = 0;
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 128; x += 8) if (pixel(first, x, y)[0] > 200) occupied++;
  assert(occupied === 128, 'Ordered density did not retain exactly half of the cells');
  layer.seed = 823;
  const second = snapshot([layer]);
  assert(first.every((value, i) => value === second[i]), 'Ordered dots turned into seeded grain');
});
test('Image detail preserves texture inside large colored cells', () => {
  const gradient = ctx.createLinearGradient(0, 0, 128, 0); gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#333333');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); renderer.setSource(source);
  const layer = createLayer('pixel', { cellSize: 32, size: 1, colorMode: 'tint', color: '#ff0000' });
  const flat = snapshot([layer]);
  assert(Math.abs(pixel(flat, 40, 48)[0] - pixel(flat, 55, 48)[0]) < 3, 'Baseline cell was not flat');
  layer.detail = 1;
  const detailed = snapshot([layer]);
  assert(Math.abs(pixel(detailed, 40, 48)[0] - pixel(detailed, 55, 48)[0]) > 15, 'Image detail did not preserve the texture');
});
test('Size by tone reduces dot area in dark petals without breaking the dot', () => {
  ctx.fillStyle = '#666666'; ctx.fillRect(0, 0, 128, 128); renderer.setSource(source);
  const layer = createLayer('ascii', { symbolMode: 'shapes', shapes: ['dot'], cellSize: 16, size: 0.6 });
  const uniform = snapshot([layer]); layer.toneSize = 1;
  const toned = snapshot([layer]);
  assert(sum(toned) > 0 && sum(toned) < sum(uniform) * 0.6, 'Dot area did not follow source brightness');
});

test('Supersampling refines geometry while preserving image-relative grid coverage', () => {
  fillWhite();
  const dots = createLayer('ascii', { symbolMode: 'shapes', shapes: ['dot'], cellSize: 8, size: 0.6 });
  const native = snapshot([dots]);
  const finer = snapshot([dots], { maxEdge: 256, renderScale: 2 });
  assert(renderer.width === 256 && renderer.height === 256, 'Supersampled dimensions are wrong');
  const nativeCoverage = sum(native) / (128 * 128), finerCoverage = sum(finer) / (256 * 256);
  assert(Math.abs(nativeCoverage - finerCoverage) / nativeCoverage < 0.2, 'Supersampling changed the dot population');
});

test('Grouped dots reconstruct tone through discrete populations with no underlying photo', () => {
  const layer = createLayer('ascii', { symbolMode: 'dots', cellSize: 32, dotRows: 4, dotAspect: 1, size: 0.8, threshold: 0, colorMode: 'solid', color: '#ffffff' });
  const count = image => {
    let marks = 0;
    for (let y = 4; y < 32; y += 8) for (let x = 4; x < 32; x += 8) if (pixel(image, x, y)[0] > 200) marks++;
    return marks;
  };
  fillWhite(); assert(count(snapshot([layer])) === 16, 'Full tone did not fill the dot group');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 128, 128); renderer.setSource(source);
  assert(count(snapshot([layer])) === 8, 'Half tone did not select eight separate dots');
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 128, 128); renderer.setSource(source);
  assert(sum(snapshot([layer])) === 0, 'Black became a dot overlay');
});

test('Dot group edge matching moves ink toward the bright side of a source boundary', () => {
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#ffffff';
  for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 16, 128);
  renderer.setSource(source);
  const layer = createLayer('ascii', { symbolMode: 'dots', cellSize: 32, dotRows: 4, dotAspect: 1, size: 0.8, dotEdges: 0, threshold: 0, colorMode: 'solid', color: '#ffffff' });
  const counts = image => {
    let left = 0, right = 0;
    for (let y = 4; y < 32; y += 8) for (let x = 4; x < 32; x += 8) if (pixel(image, x, y)[0] > 200) { if (x < 16) left++; else right++; }
    return [left, right];
  };
  const flat = counts(snapshot([layer])); layer.dotEdges = 1;
  const edged = counts(snapshot([layer]));
  assert(flat[0] === flat[1], 'Neutral groups are not evenly distributed');
  assert(edged[0] > flat[0] && edged[1] < flat[1], 'Groups did not follow the boundary');
  assert(edged[0] + edged[1] === flat[0] + flat[1], 'Edge matching changed cell tone');
});

test('Dot groups retain separate layer controls and a bounded shared analysis surface', () => {
  fillWhite();
  const a = createLayer('ascii', { symbolMode: 'dots', dotRows: 3, cellSize: 16, dotAspect: 1, size: 0.8 });
  const b = createLayer('ascii', { symbolMode: 'dots', dotRows: 4, cellSize: 32, dotAspect: 1, size: 0.8 });
  const before = snapshot([b]); snapshot([a, b]); a.dotRows = 8; snapshot([a]);
  const after = snapshot([b]);
  assert(before.every((value, i) => value === after[i]), 'Dot settings leaked between layers');
  assert(renderer.targets.length === 6, 'Dot layers allocated per-layer framebuffers');
  assert(renderer.dotMap.width <= 1024 && renderer.dotMap.height <= 512, 'Analysis map is unbounded');
  b.offsetX = 16; b.offsetY = 16;
  assert(pixel(snapshot([b]), 4, 4)[0] === 0, 'Dot transform did not preserve empty margins');
});

test('Dot group populations stay unchanged when supersampled', () => {
  fillWhite();
  const layer = createLayer('ascii', { symbolMode: 'dots', cellSize: 16, dotRows: 4, dotAspect: 1, size: 0.8 });
  const normal = snapshot([layer]);
  const fine = snapshot([layer], { maxEdge: 256, renderScale: 2 });
  const a = sum(normal) / (128 * 128), b = sum(fine) / (256 * 256);
  assert(Math.abs(a - b) / a < 0.15, 'Supersampling changed the dot populations');
});

test('Dot masks can fade opacity or reduce the dot population through a feather', () => {
  fillWhite();
  const layer = createLayer('ascii', { symbolMode: 'dots', cellSize: 32, dotRows: 4, dotAspect: 1, size: 0.8, threshold: 0, maskMode: 'linear', maskAngle: 0, maskPosition: 0.5, maskFeather: 1, colorMode: 'solid', color: '#ffffff' });
  const count = image => {
    let marks = 0;
    for (let y = 4; y < 32; y += 8) for (let x = 36; x < 64; x += 8) if (pixel(image, x, y)[0] > 40) marks++;
    return marks;
  };
  assert(count(snapshot([layer])) === 16, 'Faded mask removed glyph dots instead of fading them');
  layer.maskEdges = 'scatter';
  assert(count(snapshot([layer])) === 11, 'Scattered mask did not change the discrete population');
});

test('Large input processing and preview allocation stay bounded', () => {
  const large = document.createElement('canvas'); large.width = large.height = 2400;
  large.getContext('2d').fillRect(0, 0, 2400, 2400);
  renderer.setSource(large);
  assert(renderer.sourceCanvas.width === 2048 && renderer.referenceWidth === 2048, 'Reference processing was not capped');
  const stats = renderer.render(project([createLayer('pixel')]), { maxEdge: 4096 });
  assert(stats.width * stats.height * 3.5 <= 8_010_000, 'Working pixel budget exceeded');
  fillWhite();
});

try {
  fillWhite();
  const blob = await renderer.exportPNG(project([createLayer('ascii', { characters: '+' })]), 128);
  const bitmap = await createImageBitmap(blob);
  assert(blob.type === 'image/png' && bitmap.width === 128 && bitmap.height === 128, 'Invalid exported PNG');
  const exported = document.createElement('canvas'); exported.width = exported.height = 128;
  exported.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
  assert(sum(exported.getContext('2d').getImageData(0, 0, 128, 128).data) > 0, 'Export was blank');
  results.push({ name: 'PNG export contains the rendered composition', pass: true });
} catch (error) { results.push({ name: 'PNG export contains the rendered composition', pass: false, error: error.message }); }

try {
  const peony = await loadPeonySource();
  const rgba = peony.getContext('2d').getImageData(0, 0, peony.width, peony.height).data;
  let subject = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 128) subject++;
  assert(peony.width === 900 && peony.height === 720 && subject > 150000 && subject < 500000, 'Sample is empty or contains the full background');
  assert(rgba[3] === 0 && rgba[(peony.width - 1) * 4 + 3] === 0, 'Sample background is not transparent');
  results.push({ name: 'Prepared reference contains a substantial isolated flower', pass: true });
} catch (error) { results.push({ name: 'Prepared reference contains a substantial isolated flower', pass: false, error: error.message }); }

for (const result of results) {
  const row = document.createElement('li'); row.className = result.pass ? 'pass' : 'fail';
  row.textContent = `${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ` — ${result.error}` : ''}`;
  document.querySelector('#results').append(row);
}
const failures = results.filter(result => !result.pass).length;
document.querySelector('#status').textContent = `${results.length - failures}/${results.length} passed${failures ? ` — ${failures} failed` : ''}`;
document.documentElement.dataset.testResult = failures ? 'failed' : 'passed';
