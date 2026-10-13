import { Renderer } from './engine.js';
import { createLayer, defaultProject, normalizeProject, MAX_LAYERS, SHAPES } from './model.js';
import { makeSample } from './sample.js';
import { peonyProject, dotsProject, loadPeonySource } from './presets.js';
import { SelectionEditor } from './selection-editor.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#preview');
const inspector = $('#inspector');
const startWithDots = new URLSearchParams(location.search).get('preset') !== 'peony';
let project = startWithDots ? dotsProject() : peonyProject();
let presetFingerprint = JSON.stringify(project);
let selectedId = project.layers.find(layer => layer.type === 'ascii')?.id || project.layers.at(-1)?.id;
let pendingFrame = 0;
let original = false;
let imageName = 'Peony';
let importGeneration = 0;
let exporting = false;
let messageTimer;
let renderer;
let previewArea = { width: 0, height: 0 };

function fitPreview(stats = renderer?.stats) {
  if (!stats || !previewArea.width || !previewArea.height) return;
  const scale = Math.min(previewArea.width / stats.width, previewArea.height / stats.height);
  canvas.style.width = `${stats.width * scale}px`;
  canvas.style.height = `${stats.height * scale}px`;
  $('#preview-surface').style.width = canvas.style.width;
  $('#preview-surface').style.height = canvas.style.height;
}
const previewObserver = new ResizeObserver(entries => {
  previewArea = { width: entries[0].contentRect.width, height: entries[0].contentRect.height };
  fitPreview();
});
previewObserver.observe($('#canvas-wrap'));

function message(text) {
  clearTimeout(messageTimer);
  $('#message').textContent = text;
  $('#message').hidden = false;
  messageTimer = setTimeout(() => { $('#message').hidden = true; }, 4500);
}

function scheduleRender() {
  if (JSON.stringify(project) !== presetFingerprint) $('#preset').value = 'custom';
  if (pendingFrame || exporting || !renderer) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    try {
      const stats = renderer.render(project, { maxEdge: Number($('#quality').value), original });
      if (!stats) return;
      canvas.style.aspectRatio = `${stats.width} / ${stats.height}`;
      fitPreview(stats);
      $('#render-status').textContent = `${stats.width} × ${stats.height}`;
    } catch (error) { message(error.message); }
  });
}

function selectedLayer() { return project.layers.find(layer => layer.id === selectedId); }
function controlElement(tag, attributes = {}, text = '') {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') element.className = value;
    else element.setAttribute(key, value);
  }
  if (text) element.textContent = text;
  return element;
}
function group(label) {
  const section = controlElement('div', { class: 'control-group' });
  if (label) section.append(controlElement('div', { class: 'group-label' }, label));
  inspector.append(section);
  return section;
}
const percent = value => `${Math.round(value * 100)}%`;
const px = value => `${Number(Number(value).toFixed(2))} px`;
const multiplier = value => `${Number(value).toFixed(2)}×`;

function range(parent, key, label, min, max, step = 0.01, format = multiplier) {
  const layer = selectedLayer();
  const wrapper = controlElement('label', { class: 'range-control' });
  const heading = controlElement('span', {}, label);
  const output = controlElement('output', {}, format(layer[key]));
  heading.append(output);
  const input = controlElement('input', { type: 'range', min, max, step, value: layer[key], 'data-key': key, 'aria-label': label });
  input.addEventListener('input', () => {
    layer[key] = Number(input.value);
    if (key === 'clumping' && layer.type === 'pixel') layer.densityPattern = 'random';
    if (key === 'threshold' && layer.ceiling < layer.threshold) {
      layer.ceiling = layer.threshold;
      const ceiling = inspector.querySelector('[data-key="ceiling"]');
      if (ceiling) { ceiling.value = layer.ceiling; ceiling.previousElementSibling.querySelector('output').textContent = percent(layer.ceiling); }
    }
    if (key === 'ceiling' && layer.threshold > layer.ceiling) {
      layer.threshold = layer.ceiling;
      const threshold = inspector.querySelector('[data-key="threshold"]');
      if (threshold) { threshold.value = layer.threshold; threshold.previousElementSibling.querySelector('output').textContent = percent(layer.threshold); }
    }
    output.textContent = format(layer[key]);
    scheduleRender();
  });
  wrapper.append(heading, input); parent.append(wrapper);
}

function select(parent, key, label, options, redraw = false) {
  const layer = selectedLayer();
  const wrapper = controlElement('label', { class: 'inline-control' }, label);
  const input = controlElement('select', { 'data-key': key, 'aria-label': label });
  for (const [value, name] of options) input.append(controlElement('option', { value }, name));
  input.value = layer[key];
  input.addEventListener('change', () => { layer[key] = input.value; if (redraw) renderInspector(); scheduleRender(); });
  wrapper.append(input); parent.append(wrapper);
}

function color(parent) {
  const layer = selectedLayer();
  select(parent, 'colorMode', 'Color', [['source', 'From image'], ['tint', 'Tint'], ['solid', 'Solid'], ['gradient', 'Gradient']], true);
  if (layer.colorMode !== 'source') {
    const swatch = (key, name) => {
      const label = controlElement('label', { class: 'inline-control' }, name);
      const input = controlElement('input', { type: 'color', value: layer[key], 'aria-label': name });
      input.addEventListener('input', () => { layer[key] = input.value; scheduleRender(); });
      label.append(input); parent.append(label);
    };
    swatch('color', layer.colorMode === 'gradient' ? 'Start color' : 'Layer color');
    if (layer.colorMode === 'gradient') {
      swatch('color2', 'End color');
      range(parent, 'colorAngle', 'Color angle', -180, 180, 1, value => `${value}°`);
    }
    if (['solid', 'gradient'].includes(layer.colorMode)) range(parent, 'colorShading', 'Image shading', 0, 1, 0.01, percent);
  }
}

function glowControls() {
  const layer = selectedLayer(), glow = group();
  const label = controlElement('label', { class: 'inline-control' }, 'Glow');
  const enabled = controlElement('input', { type: 'checkbox', 'aria-label': 'Glow' });
  enabled.checked = layer.glowEnabled;
  enabled.addEventListener('change', () => { layer.glowEnabled = enabled.checked; renderInspector(); scheduleRender(); });
  label.append(enabled); glow.append(label);
  if (!layer.glowEnabled) return;
  select(glow, 'glowStyle', 'Style', [['soft', 'Soft'], ['box', 'Box']]);
  range(glow, 'strength', 'Strength', 0, 6);
  range(glow, 'radius', 'Radius', 0, 80, 1, px);
}

function renderInspector() {
  inspector.replaceChildren();
  const layer = selectedLayer();
  if (!layer) { selectionEditor.stop(); return; }
  if (layer.type !== 'pixel') selectionEditor.stop();
  const header = controlElement('div', { class: 'inspector-header' });
  const name = controlElement('input', { type: 'text', value: layer.name, maxlength: 60, 'aria-label': 'Layer name', class: 'layer-name-input' });
  name.addEventListener('input', () => { layer.name = name.value; renderLayers(); });
  const duplicate = controlElement('button', { title: 'Duplicate layer', 'aria-label': 'Duplicate layer' }, '⧉');
  duplicate.addEventListener('click', () => {
    if (project.layers.length >= MAX_LAYERS) return message(`Use up to ${MAX_LAYERS} layers`);
    const copy = createLayer(layer.type, { ...layer, id: crypto.randomUUID(), name: `${layer.name} copy` });
    project.layers.splice(project.layers.indexOf(layer) + 1, 0, copy);
    selectedId = copy.id; renderUI(); scheduleRender();
  });
  const remove = controlElement('button', { title: 'Delete layer', 'aria-label': 'Delete layer', class: 'delete-layer' }, '×');
  remove.addEventListener('click', () => {
    const index = project.layers.indexOf(layer);
    project.layers.splice(index, 1);
    for (const other of project.layers) if (other.glowSource === layer.id) other.glowSource = 'source';
    selectedId = project.layers[Math.min(index, project.layers.length - 1)]?.id;
    renderUI(); scheduleRender();
  });
  header.append(name, duplicate, remove); inspector.append(header);

  if (layer.type === 'pixel') {
    select(inspector, 'pixelShape', 'Shape', [['dot', 'Dot'], ['square', 'Square'], ['box', 'Hollow square']], true);
    const grid = group('Grid');
    range(grid, 'cellSize', 'Spacing', 6, 32, 1, px);
    if (layer.pixelShape === 'dot') range(grid, 'dotDiameter', 'Dot diameter', .25, 5, .25, px);
    else range(grid, 'size', 'Pixel size', .1, 1, .01, percent);
    if (layer.pixelShape === 'box') range(grid, 'stroke', 'Stroke width', .02, .4, .01, percent);
    const swatch = controlElement('label', { class: 'inline-control' }, 'Color');
    const ink = controlElement('input', { type: 'color', value: layer.color, 'aria-label': 'Pixel color' });
    ink.addEventListener('input', () => { layer.color = ink.value; layer.colorMode = 'solid'; const mode = inspector.querySelector('[data-key="colorMode"]'); if (mode) mode.value = 'solid'; scheduleRender(); });
    swatch.append(ink); grid.append(swatch);
    const distribution = group('Distribution');
    selectionEditor.inspect(distribution);
    range(distribution, 'brushSize', 'Brush size', 10, 500, 10, px);
    range(distribution, 'density', 'Coverage', 0, 1, .01, percent);
    range(distribution, 'clumping', 'Clumping', 0, 1, .01, percent);
    glowControls();
    const transform = controlElement('details'); transform.append(controlElement('summary', {}, 'Transform')); inspector.append(transform);
    range(transform, 'scale', 'Scale', .25, 3);
    const limit = Math.min(4096, Math.max(renderer?.referenceWidth || 1024, renderer?.referenceHeight || 1024));
    range(transform, 'offsetX', 'Offset X', -limit, limit, 1, px);
    range(transform, 'offsetY', 'Offset Y', -limit, limit, 1, px);
    const appearance = controlElement('details'); appearance.append(controlElement('summary', {}, 'Appearance')); inspector.append(appearance);
    range(appearance, 'opacity', 'Opacity', 0, 1, .01, percent);
    select(appearance, 'blend', 'Blend', [['normal', 'Normal'], ['screen', 'Screen'], ['add', 'Add'], ['multiply', 'Multiply']]);
    color(appearance);
    return;
  }

  const appearance = group('Appearance');
  range(appearance, 'opacity', 'Opacity', 0, 1, 0.01, percent);
  select(appearance, 'blend', 'Blend', [['normal', 'Normal'], ['screen', 'Screen'], ['add', 'Add'], ['multiply', 'Multiply']]);
  color(appearance);

  if (layer.type === 'ascii') {
    const symbols = group('Symbols');
    select(symbols, 'symbolMode', 'Use', [['text', 'Characters'], ['shapes', 'Shapes']], true);
    if (layer.symbolMode === 'text') {
      const label = controlElement('label', { class: 'text-control' }, 'Characters');
      const input = controlElement('input', { type: 'text', value: layer.characters, 'aria-label': 'Characters', spellcheck: 'false', class: 'characters-input' });
      input.addEventListener('input', () => { layer.characters = Array.from(input.value).slice(0, 64).join(''); scheduleRender(); });
      label.append(input); symbols.append(label);
    } else if (layer.symbolMode === 'shapes') {
      const chips = controlElement('div', { class: 'shape-chips', role: 'group', 'aria-label': 'Shapes' });
      const names = { dot: '●', square: '■', box: '□', cross: '+', star: '✦', diamond: '◇' };
      for (const shape of SHAPES.filter(shape => shape !== 'dot')) {
        const button = controlElement('button', { 'aria-label': shape, title: shape, 'aria-pressed': layer.shapes.includes(shape) }, names[shape]);
        button.addEventListener('click', () => {
          layer.shapes = layer.shapes.includes(shape) ? layer.shapes.filter(value => value !== shape) : [...layer.shapes, shape];
          renderInspector(); scheduleRender();
        });
        chips.append(button);
      }
      symbols.append(chips);
    } else {
      range(symbols, 'dotRows', 'Dot rows', 2, 8, 1, value => String(value));
      range(symbols, 'dotAspect', 'Cell aspect', 0.4, 1.4);
      range(symbols, 'dotEdges', 'Edge detail', 0, 1, 0.01, percent);
    }
    if (layer.symbolMode !== 'dots') select(symbols, 'mapping', 'Distribution', [['brightness', 'Brightness'], ['random', 'Random']], true);
    const invert = controlElement('label', { class: 'inline-control' }, 'Reverse order');
    const checkbox = controlElement('input', { type: 'checkbox', 'aria-label': 'Reverse symbol order' });
    checkbox.checked = layer.invert;
    checkbox.addEventListener('change', () => { layer.invert = checkbox.checked; scheduleRender(); });
    invert.append(checkbox); symbols.append(invert);
  }

  if (layer.type === 'glow') {
    const glow = group('Glow');
    const index = project.layers.indexOf(layer);
    const targets = project.layers.slice(0, index).filter(value => value.type !== 'glow');
    select(glow, 'glowSource', 'Target', [['source', 'Image'], ['below', 'Layers below'], ...targets.map(value => [value.id, value.name || value.type])]);
    select(glow, 'glowStyle', 'Style', [['soft', 'Soft'], ['box', 'Box']], true);
    range(glow, 'strength', 'Strength', 0, 6);
    range(glow, 'radius', 'Radius', 0, 80, 1, px);
    if (layer.glowStyle === 'box') range(glow, 'cellSize', 'Cell size', 2, 100, 0.25, px);
  } else {
    const grid = group('Grid');
    if (layer.type === 'pixel') select(grid, 'pixelShape', 'Shape', [['square', 'Square'], ['dot', 'Dot'], ['box', 'Hollow square']], true);
    range(grid, 'cellSize', 'Cell size', 2, 100, 0.25, px);
    const dotGrid = layer.type === 'ascii' && layer.symbolMode === 'dots';
    range(grid, 'size', dotGrid ? 'Dot size' : layer.type === 'ascii' ? 'Symbol size' : 'Pixel size', 0.1, 1, 0.01, percent);
    if (!dotGrid) range(grid, 'toneSize', 'Size by tone', 0, 1, 0.01, percent);
    if ((layer.type === 'ascii' && layer.symbolMode === 'shapes' && layer.shapes.some(shape => ['box', 'cross', 'diamond'].includes(shape))) || (layer.type === 'pixel' && layer.pixelShape === 'box')) range(grid, 'stroke', 'Stroke width', 0.02, 0.4, 0.01, percent);
    range(grid, 'density', 'Density', 0, 1, 0.01, percent);
    if (!dotGrid) {
      select(grid, 'densityPattern', 'Spacing', [['random', 'Random'], ['ordered', 'Ordered']], true);
      range(grid, 'densityShading', 'Density by tone', 0, 1, 0.01, percent);
    }
    range(grid, 'densityGamma', 'Tone curve', 0.2, 4);
    if (!dotGrid && (layer.densityPattern === 'random' || (layer.type === 'ascii' && layer.mapping === 'random'))) range(grid, 'seed', 'Seed', 0, 9999, 1, value => String(value));
  }

  const tones = group('Sampling');
  range(tones, 'brightness', 'Brightness boost', 0, 4);
  range(tones, 'contrast', 'Contrast', 0, 3);
  if (layer.type === 'ascii' && layer.symbolMode === 'dots') range(tones, 'dotGamma', 'Gamma', 0.2, 3);
  else if (layer.type !== 'glow') range(tones, 'detail', 'Image detail', 0, 1, 0.01, percent);
  range(tones, 'threshold', 'Minimum brightness', 0, 1, 0.01, percent);
  range(tones, 'ceiling', 'Maximum brightness', 0, 1, 0.01, percent);
  const mask = group('Mask');
  select(mask, 'maskMode', 'Region', [['none', 'All'], ['linear', 'Linear'], ['radial', 'Radial']], true);
  if (layer.maskMode !== 'none') {
    if (layer.maskMode === 'linear') {
      range(mask, 'maskAngle', 'Angle', -180, 180, 1, value => `${value}°`);
      range(mask, 'maskPosition', 'Position', 0, 1, 0.01, percent);
    } else {
      range(mask, 'maskX', 'Center X', 0, 1, 0.01, percent);
      range(mask, 'maskY', 'Center Y', 0, 1, 0.01, percent);
      range(mask, 'maskRadius', 'Mask radius', 0.05, 1.5, 0.01, percent);
    }
    range(mask, 'maskFeather', 'Feather', 0, 1, 0.01, percent);
    if (layer.type !== 'glow') select(mask, 'maskEdges', 'Edges', [['fade', 'Fade'], ['scatter', 'Scatter']]);
    const invert = controlElement('label', { class: 'inline-control' }, 'Invert mask');
    const checkbox = controlElement('input', { type: 'checkbox', 'aria-label': 'Invert mask' });
    checkbox.checked = layer.maskInvert;
    checkbox.addEventListener('change', () => { layer.maskInvert = checkbox.checked; scheduleRender(); });
    invert.append(checkbox); mask.append(invert);
  }
  glowControls();
  const transform = group('Transform');
  range(transform, 'scale', 'Scale', 0.25, 3);
  const offsetLimit = Math.min(4096, Math.max(renderer?.referenceWidth || 1024, renderer?.referenceHeight || 1024));
  range(transform, 'offsetX', 'Offset X', -offsetLimit, offsetLimit, 1, px);
  range(transform, 'offsetY', 'Offset Y', -offsetLimit, offsetLimit, 1, px);
  const reset = controlElement('button', { class: 'reset-transform' }, 'Reset transform');
  reset.addEventListener('click', () => { layer.scale = 1; layer.offsetX = layer.offsetY = 0; renderInspector(); scheduleRender(); });
  transform.append(reset);
}

function moveLayer(layer, direction) {
  const current = project.layers.indexOf(layer);
  const next = current + direction;
  if (next < 0 || next >= project.layers.length) return;
  const candidate = [...project.layers];
  [candidate[current], candidate[next]] = [candidate[next], candidate[current]];
  project.layers = candidate;
  renderUI(); scheduleRender();
}

function renderLayers() {
  const list = $('#layers'); list.replaceChildren();
  const glyphs = { ascii: 'Aa', pixel: '▦' };
  for (const layer of [...project.layers].reverse()) {
    const row = controlElement('div', { class: `layer-row${layer.id === selectedId ? ' selected' : ''}` });
    const toggle = controlElement('button', { class: 'layer-toggle', 'aria-pressed': layer.enabled, 'aria-label': `Toggle ${layer.name}`, title: layer.enabled ? 'Hide layer' : 'Show layer' }, layer.enabled ? '◉' : '○');
    toggle.addEventListener('click', () => { layer.enabled = !layer.enabled; renderLayers(); scheduleRender(); });
    const pick = controlElement('button', { class: 'layer-pick', 'aria-pressed': layer.id === selectedId });
    pick.append(controlElement('span', { class: 'layer-type' }, glyphs[layer.type]), controlElement('span', { class: 'layer-title' }, layer.name || layer.type));
    pick.addEventListener('click', () => { selectedId = layer.id; renderUI(); });
    const up = controlElement('button', { class: 'move-layer', 'aria-label': `Move ${layer.name} up`, title: 'Move up' }, '↑');
    const down = controlElement('button', { class: 'move-layer', 'aria-label': `Move ${layer.name} down`, title: 'Move down' }, '↓');
    up.disabled = project.layers.indexOf(layer) === project.layers.length - 1;
    down.disabled = project.layers.indexOf(layer) === 0;
    up.addEventListener('click', () => moveLayer(layer, 1)); down.addEventListener('click', () => moveLayer(layer, -1));
    row.append(toggle, pick, up, down); list.append(row);
  }
  document.querySelectorAll('[data-add]').forEach(button => { button.disabled = project.layers.length >= MAX_LAYERS; });
}

function renderUI() { renderLayers(); renderInspector(); }

const selectionEditor = new SelectionEditor({ surface: $('#paint-surface'), highlight: $('#selection-overlay'), cursor: $('#brush-cursor'), getLayer: selectedLayer, getRenderer: () => renderer, onChange: scheduleRender, onEditStart: () => { if (original) { original = false; $('#compare').setAttribute('aria-pressed', false); scheduleRender(); } } });

document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
  if (project.layers.length >= MAX_LAYERS) return;
  const type = button.dataset.add;
  const layer = createLayer(type, type === 'pixel' ? { pixelShape: 'dot', cellSize: 9, dotDiameter: 3.25, density: .6, colorMode: 'solid', color: '#eddbff', threshold: 0 } : {});
  project.layers.push(layer); selectedId = layer.id; renderUI(); scheduleRender();
}));

$('#background').addEventListener('input', event => { project.background = event.target.value; scheduleRender(); });
$('#source-tint').addEventListener('input', event => { project.sourceTint = event.target.value; scheduleRender(); });
$('#source-opacity').addEventListener('input', event => { project.sourceOpacity = Number(event.target.value); $('#source-opacity-value').textContent = percent(project.sourceOpacity); scheduleRender(); });
$('#quality').addEventListener('change', scheduleRender);
$('#preset').addEventListener('change', event => {
  selectionEditor.stop();
  project = event.target.value === 'peony' ? peonyProject(renderer.referenceWidth) : event.target.value === 'dots' ? dotsProject(renderer.referenceWidth) : defaultProject();
  presetFingerprint = JSON.stringify(project);
  selectedId = project.layers.find(layer => layer.type === 'ascii')?.id || project.layers.at(-1)?.id;
  $('#background').value = project.background;
  $('#source-tint').value = project.sourceTint;
  $('#source-opacity').value = project.sourceOpacity;
  $('#source-opacity-value').textContent = percent(project.sourceOpacity);
  renderUI(); scheduleRender();
});
$('#compare').addEventListener('click', () => { selectionEditor.stop(); original = !original; $('#compare').setAttribute('aria-pressed', original); scheduleRender(); });
$('#open-image').addEventListener('click', () => $('#image-input').click());
$('#load-project').addEventListener('click', () => $('#project-input').click());

async function importImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return message('Choose an image file.');
  if (file.size > 50 * 1024 * 1024) return message('Choose an image smaller than 50 MB.');
  const generation = ++importGeneration;
  const url = URL.createObjectURL(file);
  let image;
  try {
    image = new Image(); image.decoding = 'async'; image.src = url;
    await image.decode();
    if (generation !== importGeneration) return;
    renderer.setSource(image);
    selectionEditor.stop();
    for (const layer of project.layers) { layer.selectionActive = false; layer.selectionBits = ''; }
    imageName = file.name.replace(/\.[^.]+$/, '') || 'Image';
    $('#image-name').textContent = file.name;
    original = false; $('#compare').setAttribute('aria-pressed', false);
    renderInspector(); scheduleRender();
  } catch { message('Could not open that image. Try PNG, JPEG, or WebP.'); }
  finally { URL.revokeObjectURL(url); if (image) image.src = ''; }
}

$('#image-input').addEventListener('change', event => { importImage(event.target.files[0]); event.target.value = ''; });
const workspace = $('#workspace');
let dragDepth = 0;
workspace.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; workspace.classList.add('dragging'); });
workspace.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
workspace.addEventListener('dragleave', () => { if (--dragDepth <= 0) workspace.classList.remove('dragging'); });
workspace.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; workspace.classList.remove('dragging'); importImage(event.dataTransfer.files[0]); });

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#save-project').addEventListener('click', () => download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${imageName}.ascii.json`));
$('#project-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  if (file.size > 1024 * 1024) return message('Choose a settings file smaller than 1 MB.');
  try {
    const nextProject = normalizeProject(JSON.parse(await file.text()));
    project = nextProject;
    selectionEditor.stop();
    selectedId = project.layers.at(-1)?.id;
    $('#background').value = project.background;
    $('#source-tint').value = project.sourceTint;
    $('#source-opacity').value = project.sourceOpacity;
    $('#source-opacity-value').textContent = percent(project.sourceOpacity);
    renderUI(); scheduleRender();
  } catch (error) { message(error.message || 'Could not load settings.'); }
});

$('#export-image').addEventListener('click', async () => {
  if (exporting) return;
  exporting = true;
  const button = $('#export-image'); button.disabled = true; button.textContent = 'Exporting…';
  if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; }
  try {
    const blob = await renderer.exportPNG(project, 2048);
    download(blob, `${imageName}-effects.png`);
  } catch (error) { message(error.message); }
  finally { exporting = false; button.disabled = false; button.textContent = 'Export PNG'; scheduleRender(); }
});

try {
  renderer = new Renderer(canvas, { onError: message, onRestore: scheduleRender });
  $('#preset').value = startWithDots ? 'dots' : 'peony';
  $('#background').value = project.background;
  $('#source-tint').value = project.sourceTint;
  $('#source-opacity').value = project.sourceOpacity;
  $('#source-opacity-value').textContent = percent(project.sourceOpacity);
  renderUI();
  const generation = importGeneration;
  loadPeonySource().then(source => {
    if (generation !== importGeneration) return;
    renderer.setSource(source); renderInspector(); scheduleRender();
  }).catch(() => {
    if (generation !== importGeneration) return;
    renderer.setSource(makeSample()); renderInspector(); scheduleRender();
  });
} catch (error) {
  message(error.message);
  $('#export-image').disabled = true;
  $('#open-image').disabled = true;
}
window.addEventListener('pagehide', event => { if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; } if (!event.persisted) { previewObserver.disconnect(); renderer?.dispose(); } });
window.addEventListener('pageshow', event => { if (event.persisted) scheduleRender(); });
