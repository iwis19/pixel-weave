import { ProjectStore } from '../src/project-store.js';
import { encodeProjectFile, parseProjectFile } from '../src/project-file.js';
import { dotsProject } from '../src/presets.js';

const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
// This throwaway database never reads or writes the user's saved-project library.
const databaseName = `pixel-weave-test-${crypto.randomUUID()}`;
let store = new ProjectStore(databaseName);
const source = document.createElement('canvas'); source.width = 48; source.height = 32;
source.getContext('2d').fillRect(0, 0, 48, 32);
const project = dotsProject(48); project.name = 'Study';
const file = await encodeProjectFile(project, source, 'Reference.png');
const thumbnail = await new Promise(resolve => source.toBlob(resolve, 'image/png'));
let saved;
await test('Save persists editable project data and a small gallery preview', async () => {
  saved = await store.save({ name: project.name, file, thumbnail });
  const loaded = await store.get(saved.id);
  assert(loaded.name === 'Study' && loaded.file instanceof Blob && loaded.thumbnail instanceof Blob, 'Missing saved data');
  assert(parseProjectFile(await loaded.file.text()).project.layers.length === 1, 'Layers were lost');
});
await test('Saving again updates one project without creating another record', async () => {
  await store.save({ id: saved.id, name: 'Updated study', file, thumbnail });
  const records = await store.list();
  assert(records.length === 1 && records[0].name === 'Updated study', 'Save created a duplicate');
  assert(records[0].createdAt === saved.createdAt, 'Creation time changed');
});
await test('Closing and reopening storage keeps projects and their source images', async () => {
  await store.close(); store = new ProjectStore(databaseName);
  const loaded = await store.get(saved.id);
  assert(parseProjectFile(await loaded.file.text()).source.width === 48, 'Image did not persist');
});
await test('Copies get separate IDs and renaming preserves their document data', async () => {
  const copy = await store.save({ name: 'Copy', file, thumbnail });
  assert(copy.id !== saved.id && (await store.list()).length === 2, 'Copy replaced the original');
  await store.rename(copy.id, 'Renamed copy');
  const renamed = await store.get(copy.id);
  assert(renamed.name === 'Renamed copy' && await renamed.file.text() === await file.text(), 'Rename damaged project data');
});
await test('Gallery queries exclude full project documents', async () => {
  const records = await store.list();
  assert(records.every(record => !('file' in record)), 'Gallery fetched full documents');
});
await test('Deleting a disposable test project removes its metadata and document', async () => {
  await store.remove(saved.id);
  assert(await store.get(saved.id) === null && (await store.list()).length === 1, 'Delete left a partial record');
});
await store.close();
await new Promise(resolve => { const request = indexedDB.deleteDatabase(databaseName); request.onsuccess = request.onerror = request.onblocked = resolve; });
for (const result of results) {
  const row = document.createElement('li'); row.className = result.pass ? 'pass' : 'fail';
  row.textContent = `${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ` — ${result.error}` : ''}`;
  document.querySelector('#results').append(row);
}
const failures = results.filter(result => !result.pass).length;
document.querySelector('#status').textContent = `${results.length - failures}/${results.length} passed`;
document.documentElement.dataset.testResult = failures ? 'failed' : 'passed';
