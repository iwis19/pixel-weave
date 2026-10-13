import { normalizeName, normalizeProject } from './model.js';

export const MAX_PROJECT_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_BYTES = 17 * 1024 * 1024;
const MAX_SOURCE_EDGE = 2048;

function validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid project image.');
  if (![source.width, source.height].every(value => Number.isInteger(value) && value >= 1 && value <= MAX_SOURCE_EDGE)) throw new Error('Project images must be at most 2048 px.');
  const prefix = 'data:image/png;base64,';
  if (typeof source.data !== 'string' || !source.data.startsWith(prefix)) throw new Error('Invalid project image format.');
  const encoded = source.data.slice(prefix.length);
  if (encoded.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 || encoded.length < 44 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid or oversized project image.');
  // Check the PNG header before the browser decodes the embedded image.
  const bytes = Uint8Array.from(atob(encoded.slice(0, 44)), character => character.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Invalid project image.');
  const header = new DataView(bytes.buffer);
  if (header.getUint32(16) !== source.width || header.getUint32(20) !== source.height) throw new Error('Project image dimensions do not match.');
  return { name: normalizeName(source.name, 'Reference image', 120), width: source.width, height: source.height, data: source.data };
}

export function parseProjectFile(text) {
  if (typeof text !== 'string' || text.length > MAX_PROJECT_BYTES) throw new Error('Choose a project smaller than 32 MB.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('Choose a Pixel Weave project file, not an image.'); }
  const project = normalizeProject(raw);
  // Legacy settings have no source and intentionally keep the current reference.
  const source = raw.source === undefined ? null : validateSource(raw.source);
  return { project, source };
}

export async function encodeProjectFile(project, canvas, sourceName) {
  if (!canvas) throw new Error('Open an image before saving a project.');
  // Snapshot the settings before asynchronous PNG encoding; subsequent edits stay separate.
  const snapshot = normalizeProject(project);
  const { width, height } = canvas;
  if (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) throw new Error('Project images must be at most 2048 px.');
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not save the project image.')), 'image/png'));
  if (blob.size > MAX_SOURCE_BYTES) throw new Error('The project image is too large to save.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not save the project image.'));
    reader.readAsDataURL(blob);
  });
  const source = validateSource({ name: sourceName, width, height, data });
  const file = new Blob([JSON.stringify({ ...snapshot, source })], { type: 'application/json' });
  if (file.size > MAX_PROJECT_BYTES) throw new Error('The project is too large to save.');
  return file;
}

export async function decodeProjectImage(source) {
  const image = new Image();
  image.src = source.data;
  try {
    await image.decode();
    if (image.naturalWidth !== source.width || image.naturalHeight !== source.height) throw new Error('Invalid image dimensions.');
    return image;
  } catch {
    image.src = '';
    throw new Error('Could not read the project image.');
  }
}
