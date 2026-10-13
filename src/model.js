import { MASK_BYTES } from './selection.js';

export const MAX_LAYERS = 12;
export const MAX_SYMBOLS = 64;
export const SHAPES = ['dot', 'square', 'box', 'cross', 'star', 'diamond'];
export const BLENDS = ['normal', 'screen', 'add', 'multiply'];

const defaults = {
  enabled: true, opacity: 1, blend: 'normal',
  cellSize: 10, size: 0.85, scale: 1, offsetX: 0, offsetY: 0,
  brightness: 1, contrast: 1, threshold: 0.08, ceiling: 1,
  density: 1, seed: 1, colorMode: 'source', color: '#d4f5ff',
  densityShading: 0, densityGamma: 1,
  densityPattern: 'random', toneSize: 0, detail: 0,
  symbolMode: 'text', characters: '.:-=+*#%@', shapes: ['cross'],
  dotRows: 4, dotAspect: 0.6, dotEdges: 0.6, dotGamma: 1,
  dotDiameter: 3.25, clumping: 0.48, brushSize: 120,
  selectionActive: false, selectionBits: '',
  mapping: 'brightness', invert: false, pixelShape: 'square',
  glowStyle: 'soft', glowSource: 'source', radius: 14, strength: 1.6,
  glowEnabled: false, glowOpacity: 1, glowBlend: 'add',
  stroke: 0.1, color2: '#d9a2ff', colorAngle: 0, colorShading: 0,
  maskMode: 'none', maskAngle: 45, maskPosition: 0.5, maskFeather: 0.25,
  maskX: 0.5, maskY: 0.5, maskRadius: 0.5, maskInvert: false, maskEdges: 'fade',
};

const ranges = {
  opacity: [0, 1], cellSize: [2, 100], size: [0.1, 1], scale: [0.25, 3],
  offsetX: [-4096, 4096], offsetY: [-4096, 4096], brightness: [0, 4],
  contrast: [0, 3], threshold: [0, 1], ceiling: [0, 1], density: [0, 1],
  seed: [0, 9999], radius: [0, 80], strength: [0, 6],
  stroke: [0.02, 0.4], colorAngle: [-180, 180], colorShading: [0, 1],
  maskAngle: [-180, 180], maskPosition: [0, 1], maskFeather: [0, 1],
  maskX: [0, 1], maskY: [0, 1], maskRadius: [0.05, 1.5],
  densityShading: [0, 1], densityGamma: [0.2, 4],
  toneSize: [0, 1], detail: [0, 1],
  dotRows: [2, 8], dotAspect: [0.4, 1.4], dotEdges: [0, 1], dotGamma: [0.2, 3],
  dotDiameter: [0.25, 5], clumping: [0, 1], brushSize: [10, 500],
  glowOpacity: [0, 1],
};

export function symbolsFor(layer) {
  if (layer.type === 'pixel') return [];
  if (['dots', 'points'].includes(layer.symbolMode)) return [];
  if (layer.symbolMode === 'shapes') return layer.shapes.filter(s => SHAPES.includes(s)).slice(0, MAX_SYMBOLS);
  return [...new Set(Array.from(layer.characters))].slice(0, MAX_SYMBOLS);
}

export function createLayer(type = 'ascii', overrides = {}) {
  if (!['ascii', 'pixel', 'glow'].includes(type)) throw new Error('Unknown layer type');
  const layer = { ...defaults, id: globalThis.crypto.randomUUID(), type, name: type === 'ascii' ? 'ASCII' : type === 'pixel' ? 'Pixels' : 'Glow', ...overrides };
  if (type === 'pixel' && overrides.cellSize === undefined) layer.cellSize = 18;
  if (type === 'glow' && overrides.blend === undefined) layer.blend = 'add';
  return normalizeLayer(layer);
}

export function normalizeLayer(input) {
  const previousDots = input.type === 'ascii' && input.symbolMode === 'points';
  const type = previousDots ? 'pixel' : ['ascii', 'pixel', 'glow'].includes(input.type) ? input.type : 'ascii';
  const out = { ...defaults, type };
  out.id = typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(input.id) ? input.id : globalThis.crypto.randomUUID();
  out.name = typeof input.name === 'string' ? input.name.slice(0, 60) : type;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = Number(input[key] ?? defaults[key]);
    out[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : defaults[key];
  }
  out.ceiling = Math.max(out.threshold, out.ceiling);
  out.dotRows = Math.round(out.dotRows);
  out.enabled = input.enabled !== false;
  out.glowEnabled = input.glowEnabled === true;
  out.invert = input.invert === true;
  out.maskInvert = input.maskInvert === true;
  out.selectionActive = input.selectionActive === true;
  if (typeof input.selectionBits === 'string' && input.selectionBits.length === Math.ceil(MASK_BYTES / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(input.selectionBits)) {
    try { if (atob(input.selectionBits).length === MASK_BYTES) out.selectionBits = input.selectionBits; } catch { /* Ignore malformed settings. */ }
  }
  for (const [key, values] of Object.entries({
    blend: BLENDS, glowBlend: BLENDS, symbolMode: ['text', 'shapes', 'dots', 'points'], mapping: ['brightness', 'random'],
    colorMode: ['source', 'tint', 'solid', 'gradient'], pixelShape: ['square', 'dot', 'box'], glowStyle: ['soft', 'box'],
    maskMode: ['none', 'linear', 'radial'], maskEdges: ['fade', 'scatter'],
    densityPattern: ['random', 'ordered'],
  })) out[key] = values.includes(input[key]) ? input[key] : defaults[key];
  out.characters = typeof input.characters === 'string' ? Array.from(input.characters).slice(0, MAX_SYMBOLS).join('') : defaults.characters;
  out.shapes = Array.isArray(input.shapes) ? [...new Set(input.shapes.filter(s => SHAPES.includes(s)))] : [...defaults.shapes];
  out.color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : defaults.color;
  out.color2 = /^#[0-9a-f]{6}$/i.test(input.color2) ? input.color2 : defaults.color2;
  out.glowSource = typeof input.glowSource === 'string' && /^(source|below|[a-zA-Z0-9_-]{1,80})$/.test(input.glowSource) ? input.glowSource : 'source';
  if (previousDots) {
    out.pixelShape = 'dot'; out.symbolMode = 'text';
    if (['Dots', 'Dot field', 'ASCII'].includes(out.name)) out.name = out.name === 'Dot field' ? 'Pixel field' : 'Pixels';
  }
  if (out.type === 'pixel') out.symbolMode = 'text';
  if (out.type === 'pixel' && out.pixelShape === 'dot') out.cellSize = Math.max(6, out.cellSize);
  return out;
}

export function defaultProject() {
  const pixels = createLayer('pixel', { name: 'Soft pixels', cellSize: 16, size: 0.94, opacity: 0.32, threshold: 0.12 });
  const ascii = createLayer('ascii', { name: 'Characters', cellSize: 9, threshold: 0.18, brightness: 1.2, glowEnabled: true, radius: 12, strength: 1.8 });
  return { version: 1, background: '#08090b', sourceOpacity: 0.2, sourceTint: '#ffffff', layers: [pixels, ascii] };
}

export function normalizeProject(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.layers)) throw new Error('Invalid project file');
  if (input.layers.length > MAX_LAYERS) throw new Error(`Use up to ${MAX_LAYERS} layers`);
  if (input.layers.some(layer => !layer || typeof layer !== 'object' || Array.isArray(layer))) throw new Error('Invalid layer settings');
  const normalized = input.layers.map(layer => normalizeLayer(layer.type === 'ascii' && layer.symbolMode === 'dots' ? { ...layer, symbolMode: 'points' } : layer));
  const ids = new Set();
  for (const layer of normalized) {
    if (ids.has(layer.id)) throw new Error('Duplicate layer IDs');
    ids.add(layer.id);
  }
  const layers = [];
  for (const layer of normalized) {
    if (layer.type !== 'glow') { layers.push(layer); continue; }
    // Migrate older standalone glows onto their drawing layer, keeping masks and IDs intact.
    const target = layers.find(value => value.id === layer.glowSource) || layers.at(-1);
    if (target) {
      target.glowEnabled = layer.enabled;
      target.glowStyle = layer.glowStyle; target.radius = layer.radius; target.strength = layer.strength;
      target.glowOpacity = layer.opacity; target.glowBlend = layer.blend;
    }
  }
  return {
    version: 1,
    background: /^#[0-9a-f]{6}$/i.test(input.background) ? input.background : '#08090b',
    sourceTint: /^#[0-9a-f]{6}$/i.test(input.sourceTint) ? input.sourceTint : '#ffffff',
    sourceOpacity: Number.isFinite(Number(input.sourceOpacity)) ? Math.max(0, Math.min(1, Number(input.sourceOpacity))) : 0.2,
    layers,
  };
}

export function hexRGB(hex) {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

export function fitDimensions(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
