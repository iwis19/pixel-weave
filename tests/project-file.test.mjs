import test from 'node:test';
import assert from 'node:assert/strict';
import { dotsProject } from '../src/presets.js';
import { parseProjectFile } from '../src/project-file.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const source = { name: 'Reference.png', width: 1, height: 1, data: png };

test('project files preserve their reference image, names and editable layer settings', () => {
  const project = dotsProject(); project.name = 'Flower study';
  project.layers[0].name = 'Highlights'; project.layers[0].dotDiameter = 4;
  const restored = parseProjectFile(JSON.stringify({ ...project, source }));
  assert.deepEqual(restored.project, project);
  assert.deepEqual(restored.source, source);
  assert(!('source' in restored.project), 'Encoded image should not enter live render state');
});

test('legacy settings remain usable and explicitly contain no reference image', () => {
  const restored = parseProjectFile(JSON.stringify(dotsProject()));
  assert.equal(restored.source, null);
  assert.equal(restored.project.layers[0].type, 'pixel');
});

test('project loading rejects image files, external URLs and malformed embedded sources', () => {
  const project = dotsProject();
  assert.throws(() => parseProjectFile('PNG image bytes'), /project file, not an image/);
  assert.throws(() => parseProjectFile(JSON.stringify({ ...project, source: null })), /Invalid project image/);
  assert.throws(() => parseProjectFile(JSON.stringify({ ...project, source: { ...source, data: 'https://example.com/image.png' } })), /format/);
  assert.throws(() => parseProjectFile(JSON.stringify({ ...project, source: { ...source, data: 'data:image/png;base64,' + 'AAAA'.repeat(12) } })), /Invalid project image/);
});

test('project image dimensions are checked before browser decoding', () => {
  const project = dotsProject();
  assert.throws(() => parseProjectFile(JSON.stringify({ ...project, source: { ...source, width: 2 } })), /do not match/);
  assert.throws(() => parseProjectFile(JSON.stringify({ ...project, source: { ...source, width: 4096 } })), /at most 2048/);
});
