import { Renderer } from '../src/engine.js';
import { createLayer } from '../src/model.js';
import { encodeProjectFile, parseProjectFile, decodeProjectImage } from '../src/project-file.js';
import { encodeSelection, decodeSelection, paintSelection } from '../src/selection.js';

const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
const source = document.createElement('canvas'); source.width = 48; source.height = 32;
const ctx = source.getContext('2d');
ctx.fillStyle = '#d02040'; ctx.fillRect(0, 0, 24, 32);
ctx.fillStyle = '#30a0c0'; ctx.fillRect(24, 0, 24, 32);
const mask = decodeSelection(); paintSelection(mask, .2, .5, 20, 48, 32);
const project = { version: 1, name: 'Editable study', background: '#000000', sourceOpacity: .5, sourceTint: '#ffffff', layers: [
  createLayer('pixel', { name: 'Small dots', cellSize: 8, dotDiameter: 3, selectionActive: true, selectionBits: encodeSelection(mask), glowEnabled: true, radius: 2 }),
  createLayer('shapes', { name: 'Stars', shapes: ['x', 'star5'], density: .3 }),
] };
const renderer = new Renderer(document.querySelector('#canvas'));
const snapshot = state => {
  renderer.render(state, { maxEdge: 128 });
  const pixels = new Uint8Array(renderer.width * renderer.height * 4);
  renderer.gl.readPixels(0, 0, renderer.width, renderer.height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
  return pixels;
};
let encoded;
await test('Saving an editable project includes the source image and complete layer state', async () => {
  encoded = await encodeProjectFile(project, source, 'Two colors.png');
  const raw = JSON.parse(await encoded.text());
  assert(encoded.type === 'application/json', 'Project output is not an editable document');
  assert(raw.source.data.startsWith('data:image/png;base64,'), 'Original reference is missing');
  assert(raw.source.width === 48 && raw.source.height === 32, 'Wrong source dimensions');
  assert(raw.layers[0].selectionBits === project.layers[0].selectionBits && raw.layers[0].glowEnabled, 'Selection or glow was lost');
  assert(raw.name === project.name && raw.layers[0].name === 'Small dots', 'Names were lost');
});
await test('Loading restores the same rendering after the current image and layers change', async () => {
  renderer.setSource(source); const before = snapshot(project);
  const replacement = document.createElement('canvas'); replacement.width = replacement.height = 20;
  replacement.getContext('2d').fillRect(0, 0, 20, 20); renderer.setSource(replacement);
  snapshot({ ...project, layers: [] });
  const loaded = parseProjectFile(await encoded.text());
  const image = await decodeProjectImage(loaded.source);
  renderer.setSource(image); image.src = '';
  const after = snapshot(loaded.project);
  assert(renderer.referenceWidth === 48 && renderer.referenceHeight === 32, 'Source dimensions were not restored');
  assert(before.length === after.length && before.every((v, i) => v === after[i]), 'Restored composition differs');
});
await test('Saving snapshots the settings before asynchronous image encoding', async () => {
  const state = structuredClone(project);
  const pending = encodeProjectFile(state, source, 'Two colors.png');
  state.name = 'Changed later'; state.layers[0].dotDiameter = 5;
  const loaded = parseProjectFile(await (await pending).text());
  assert(loaded.project.name === 'Editable study' && loaded.project.layers[0].dotDiameter === 3, 'Later edits entered the saved project');
});
await test('PNG export stays a flattened image while project files retain editable data', async () => {
  const png = await renderer.exportPNG(project, 128);
  const image = await createImageBitmap(png);
  assert(png.type === 'image/png' && image.width === 48 && image.height === 32, 'PNG export is invalid'); image.close();
  assert(parseProjectFile(await encoded.text()).project.layers.length === 2, 'Project layers are missing');
});
await test('Corrupt embedded PNG data fails without producing a replacement image', async () => {
  const source = parseProjectFile(await encoded.text()).source;
  const headerOnly = { ...source, data: source.data.slice(0, 'data:image/png;base64,'.length + 44) };
  let rejected = false;
  try { await decodeProjectImage(headerOnly); } catch { rejected = true; }
  assert(rejected, 'Broken project image decoded');
});
renderer.dispose();
for (const result of results) {
  const row = document.createElement('li'); row.className = result.pass ? 'pass' : 'fail';
  row.textContent = `${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ` — ${result.error}` : ''}`;
  document.querySelector('#results').append(row);
}
const failures = results.filter(result => !result.pass).length;
document.querySelector('#status').textContent = `${results.length - failures}/${results.length} passed`;
document.documentElement.dataset.testResult = failures ? 'failed' : 'passed';
