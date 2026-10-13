import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayer, defaultProject, fitDimensions, normalizeProject, symbolsFor, MAX_LAYERS } from '../src/model.js';
import { peonyProject } from '../src/presets.js';
import { buildDotGlyphs } from '../src/dot-glyphs.js';

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

test('settings round trip preserves a glow dependency and independent layer parameters', () => {
  const original = defaultProject();
  original.layers[0].offsetX = -125;
  original.layers[1].characters = '✦□+';
  const restored = normalizeProject(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
  assert.equal(restored.layers[2].glowSource, restored.layers[1].id);
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

test('glow cannot depend on itself or a layer above it', () => {
  const a = createLayer('glow', { id: 'a', glowSource: 'b' });
  const b = createLayer('ascii', { id: 'b' });
  const project = normalizeProject({ version: 1, layers: [a, b] });
  assert.equal(project.layers[0].glowSource, 'source');
  const anotherGlow = createLayer('glow', { id: 'c', glowSource: 'a' });
  assert.equal(normalizeProject({ version: 1, layers: [a, b, anotherGlow] }).layers[2].glowSource, 'source');
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
  const dotLayer = original.layers.find(layer => layer.type === 'ascii');
  assert.equal(dotLayer.symbolMode, 'dots');
  assert.deepEqual(symbolsFor(dotLayer), []);
  assert.equal(dotLayer.dotRows, 4);
  assert(dotLayer.dotEdges > 0);
  assert.equal(original.layers[0].detail, 1);
  assert.equal(original.layers[0].maskEdges, 'fade');
  assert(original.layers[0].maskFeather >= 0.5);
  assert.equal(original.layers.at(-1).glowSource, dotLayer.id);
  assert(original.layers.find(layer => layer.type === 'pixel').cellSize > dotLayer.cellSize * 2);
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
  assert.deepEqual(project.layers[0], a);
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
