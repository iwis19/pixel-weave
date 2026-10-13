import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayer, defaultProject, fitDimensions, normalizeProject, symbolsFor, MAX_LAYERS } from '../src/model.js';
import { peonyProject } from '../src/presets.js';
import { buildDotGlyphs } from '../src/dot-glyphs.js';
import { decodeSelection, encodeSelection, paintSelection } from '../src/selection.js';
import { buildPointGrid } from '../src/point-grid.js';

test('editing one layer never changes another layer’s symbols or transforms', () => {
  const a = createLayer('ascii', { symbolMode: 'shapes', shapes: ['box'], offsetX: 13 });
  const b = createLayer('ascii', { characters: '01', offsetX: -7 });
  a.shapes.push('star'); a.offsetX = 20;
  assert.deepEqual(symbolsFor(a), ['box', 'star']);
  assert.deepEqual(symbolsFor(b), ['0', '1']);
  assert.equal(b.offsetX, -7);
  assert.deepEqual(createLayer('ascii').shapes, ['cross']);
});

test('text and shape modes use only their selected symbols, including empty sets', () => {
  assert.deepEqual(symbolsFor(createLayer('ascii', { characters: '+ +□' })), ['+', ' ', '□']);
  assert.deepEqual(symbolsFor(createLayer('ascii', { characters: '' })), []);
  assert.deepEqual(symbolsFor(createLayer('ascii', { symbolMode: 'shapes', shapes: [] })), []);
  assert.deepEqual(symbolsFor(createLayer('ascii', { symbolMode: 'shapes', shapes: ['star'], characters: 'abc' })), ['star']);
});

test('settings round trip preserves attached glow and independent layer parameters', () => {
  const original = defaultProject();
  original.layers[0].offsetX = -125;
  original.layers[1].characters = '✦□+';
  const restored = normalizeProject(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
  assert.equal(restored.layers.length, 2);
  assert.equal(restored.layers[1].glowEnabled, true);
});

test('untrusted settings are bounded and unsupported types cannot reach the renderer', () => {
  const project = normalizeProject({ version: 1, background: 'invalid', sourceOpacity: 9, layers: [{ id: 'layer', type: 'unknown', scale: 0, cellSize: -9, radius: Infinity, threshold: 0.8, ceiling: 0.1, offsetX: 90000, characters: 'x'.repeat(1000), shapes: ['box', 'box', 'invalid'] }] });
  const layer = project.layers[0];
  assert.equal(layer.type, 'ascii'); assert.equal(layer.scale, 0.25); assert.equal(layer.cellSize, 2);
  assert.equal(layer.ceiling, 0.8); assert.equal(layer.offsetX, 4096);
  assert.equal(layer.radius, 14); assert.equal(layer.characters.length, 64);
  assert.deepEqual(layer.shapes, ['box']); assert.equal(project.sourceOpacity, 1);
  assert.equal(project.background, '#08090b');
});

test('legacy glow layers merge onto available drawing layers without leaving separate layers', () => {
  const a = createLayer('glow', { id: 'a', glowSource: 'b' });
  const b = createLayer('ascii', { id: 'b' });
  const project = normalizeProject({ version: 1, layers: [a, b] });
  assert.equal(project.layers.length, 1);
  assert.equal(project.layers[0].glowEnabled, false);
  const anotherGlow = createLayer('glow', { id: 'c', glowSource: 'a' });
  const migrated = normalizeProject({ version: 1, layers: [a, b, anotherGlow] });
  assert.equal(migrated.layers.length, 1);
  assert.equal(migrated.layers[0].id, 'b');
  assert.equal(migrated.layers[0].glowEnabled, true);
});

test('reject invalid project structure, duplicate IDs, and excessive layers', () => {
  assert.throws(() => normalizeProject({ layers: [] }), /Invalid/);
  assert.throws(() => normalizeProject({ version: 1, layers: [null] }), /Invalid layer/);
  assert.throws(() => normalizeProject({ version: 1, layers: [createLayer('ascii', { id: 'same' }), createLayer('pixel', { id: 'same' })] }), /Duplicate/);
  assert.throws(() => normalizeProject({ version: 1, layers: Array.from({ length: MAX_LAYERS + 1 }, () => createLayer()) }), /up to/);
});

test('preview dimensions preserve aspect ratio and do not upscale tiny inputs', () => {
  assert.deepEqual(fitDimensions(4000, 2000, 1280), { width: 1280, height: 640, scale: 0.32 });
  assert.deepEqual(fitDimensions(20, 10, 1280), { width: 20, height: 10, scale: 1 });
  assert.equal(fitDimensions(1, 9000, 768).width, 1);
});

test('reference recipe uses an explicit dot-grid mode and remains editable', () => {
  const original = peonyProject();
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(original))), original);
  const dotLayer = original.layers.find(layer => layer.type === 'pixel' && layer.pixelShape === 'dot');
  assert.equal(dotLayer.type, 'pixel');
  assert.deepEqual(symbolsFor(dotLayer), []);
  assert(dotLayer.dotDiameter > 0);
  assert(dotLayer.clumping > 0);
  assert.equal(original.layers[0].detail, 1);
  assert.equal(original.layers[0].maskEdges, 'fade');
  assert(original.layers[0].maskFeather >= 0.5);
  assert.equal(original.layers.at(-1).glowEnabled, true);
  assert(!original.layers.some(layer => layer.type === 'glow'));
  assert(original.layers.find(layer => layer.type === 'squares').cellSize > dotLayer.cellSize * 2);
  const scaled = peonyProject(1800);
  assert.equal(scaled.layers[0].cellSize, original.layers[0].cellSize * 2);
});

test('dot glyphs span every population and keep alternative edge patterns nested', () => {
  const glyphs = buildDotGlyphs(4, 0.6);
  assert.equal(glyphs.count, 8);
  for (let order = 0; order < 9; order++) {
    let previous = [];
    for (let filled = 0; filled <= glyphs.count; filled++) {
      const occupied = [];
      for (let y = 0; y < glyphs.height; y++) for (let x = 0; x < glyphs.width; x++) {
        if (glyphs.masks[(order * glyphs.height + y) * glyphs.maskWidth + filled * glyphs.width + x]) occupied.push(y * glyphs.width + x);
      }
      assert.equal(occupied.length, filled);
      assert(previous.every(index => occupied.includes(index)));
      previous = occupied;
    }
  }
});

test('dot settings are bounded, round-trip independently, and preserve ordinary shapes', () => {
  const a = createLayer('ascii', { symbolMode: 'dots', dotRows: 3.2, dotAspect: 0.7, dotEdges: 1, dotGamma: 1.4 });
  const b = createLayer('ascii', { symbolMode: 'shapes', shapes: ['dot'] });
  const project = normalizeProject({ version: 1, layers: [a, b] });
  assert.equal(project.layers[0].type, 'pixel');
  assert.equal(project.layers[0].pixelShape, 'dot');
  assert.equal(project.layers[0].dotRows, a.dotRows);
  assert.equal(a.dotRows, 3);
  assert.deepEqual(symbolsFor(b), ['dot']);
  const invalid = createLayer('ascii', { symbolMode: 'dots', dotRows: 99, dotAspect: -1, dotEdges: 9, dotGamma: 0 });
  assert.equal(invalid.dotRows, 8); assert.equal(invalid.dotAspect, 0.4);
  assert.equal(invalid.dotEdges, 1); assert.equal(invalid.dotGamma, 0.2);
  const table = buildDotGlyphs(8, 1.4);
  assert(table.masks.byteLength + table.profiles.byteLength < 50000);
});

test('older settings get neutral mask and density defaults without changing their symbols', () => {
  const restored = normalizeProject({ version: 1, layers: [{ type: 'ascii', characters: '01' }] });
  assert.equal(restored.layers[0].maskMode, 'none');
  assert.equal(restored.layers[0].densityShading, 0);
  assert.equal(restored.sourceTint, '#ffffff');
  assert.deepEqual(symbolsFor(restored.layers[0]), ['0', '1']);
});

test('painted selections survive settings round trips and duplicate independently', () => {
  const mask = decodeSelection();
  paintSelection(mask, .1, .5, 40, 128, 128);
  const a = createLayer('ascii', { symbolMode: 'points', selectionActive: true, selectionBits: encodeSelection(mask) });
  const b = createLayer('ascii', { ...a, id: 'copy' });
  const restored = normalizeProject({ version: 1, layers: [a, b] });
  assert.deepEqual(decodeSelection(restored.layers[0].selectionBits), mask);
  const edited = decodeSelection(b.selectionBits);
  paintSelection(edited, .1, .5, 40, 128, 128, true); b.selectionBits = encodeSelection(edited);
  assert(decodeSelection(a.selectionBits).some(Boolean));
  assert(!decodeSelection(b.selectionBits).some(Boolean));
  assert.equal(createLayer('ascii', { selectionBits: 'malformed', selectionActive: true }).selectionBits, '');
});

test('single-dot spacing, diameter, coverage, and clumping are independent', () => {
  const source = { width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4).fill(255) };
  const layer = createLayer('ascii', { symbolMode: 'points', cellSize: 8, density: .25, clumping: 0 });
  const first = buildPointGrid(layer, 128, 128, source);
  assert.equal(first.eligible, 256); assert.equal(first.count, 64);
  layer.dotDiameter = 5;
  assert.deepEqual(buildPointGrid(layer, 128, 128, source).data, first.data);
  layer.clumping = 1;
  const clustered = buildPointGrid(layer, 128, 128, source);
  assert.equal(clustered.count, first.count); assert.notDeepEqual(clustered.data, first.data);
  layer.cellSize = 16;
  assert.equal(buildPointGrid(layer, 128, 128, source).count, 16);
});

test('manual selections include empty image areas without a brightness cutoff', () => {
  const source = { width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) };
  const layer = createLayer('ascii', { symbolMode: 'points', cellSize: 8, density: 1, threshold: 1 });
  assert.equal(buildPointGrid(layer, 128, 128, source).count, 0);
  const mask = decodeSelection(); paintSelection(mask, .1, .1, 32, 128, 128);
  layer.selectionActive = true; layer.selectionBits = encodeSelection(mask);
  assert(buildPointGrid(layer, 128, 128, source).count > 0);
  layer.scale = .25; layer.offsetX = -150;
  const bounded = buildPointGrid(layer, 2048, 2048, source);
  assert(bounded.width <= 512 && bounded.height <= 512);
});

test('old dot selections migrate to a Pixel layer with their glow, mask and transforms intact', () => {
  const mask = decodeSelection(); paintSelection(mask, .2, .3, 24, 128, 128);
  const bits = encodeSelection(mask);
  const project = normalizeProject({ version: 1, layers: [
    { id: 'old-dots', type: 'ascii', name: 'Dots', symbolMode: 'points', selectionActive: true, selectionBits: bits, offsetX: 12 },
    { id: 'old-glow', type: 'glow', glowSource: 'old-dots', glowStyle: 'box', radius: 9, strength: 2, opacity: .4 },
  ] });
  assert.equal(project.layers.length, 1);
  const layer = project.layers[0];
  assert.equal(layer.type, 'pixel'); assert.equal(layer.name, 'Pixels'); assert.equal(layer.pixelShape, 'dot');
  assert.equal(layer.selectionBits, bits); assert.equal(layer.offsetX, 12);
  assert.equal(layer.glowEnabled, true); assert.equal(layer.glowStyle, 'box'); assert.equal(layer.glowOpacity, .4);
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(project))), project);
});

test('the four layer types retain separate symbol controls and round-trip together', () => {
  const layers = [createLayer('pixel'), createLayer('ascii', { characters: '01' }), createLayer('squares', { pixelShape: 'box' }), createLayer('shapes', { shapes: ['x', 'star5', 'ring'], glowEnabled: true })];
  assert.equal(layers[0].pixelShape, 'dot');
  assert.equal(layers[2].pixelShape, 'box');
  assert.deepEqual(symbolsFor(layers[2]), []);
  assert.deepEqual(symbolsFor(layers[3]), ['x', 'star5', 'ring']);
  const restored = normalizeProject({ version: 1, layers });
  assert.deepEqual(restored.layers, layers);
  assert.deepEqual(createLayer('shapes').shapes, ['cross']);
  layers[3].shapes.push('diamond');
  assert.deepEqual(createLayer('shapes').shapes, ['cross']);
});

test('old square Pixels and ASCII shape sets migrate without losing drawing parameters', () => {
  const mask = decodeSelection(); paintSelection(mask, .3, .4, 40, 128, 128);
  const square = createLayer('pixel', { pixelShape: 'box', name: 'Outline', cellSize: 14, stroke: .2, selectionActive: true, selectionBits: encodeSelection(mask), glowEnabled: true });
  const shapes = createLayer('ascii', { symbolMode: 'shapes', shapes: ['cross', 'box', 'star'], mapping: 'brightness', offsetX: 7, maskMode: 'linear' });
  const migrated = normalizeProject({ version: 1, layers: [square, shapes] });
  assert.deepEqual(migrated.layers[0], { ...square, type: 'squares' });
  assert.deepEqual(migrated.layers[1], { ...shapes, type: 'shapes', name: 'Shapes' });
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(migrated))), migrated);
});
