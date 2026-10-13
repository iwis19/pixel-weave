import { Renderer } from './engine.js';
import { createLayer, defaultProject, normalizeProject, normalizeName, projectFilename, MAX_LAYERS, LAYER_NAMES } from './model.js';
import { makeSample } from './sample.js';
import { peonyProject, dotsProject, loadPeonySource } from './presets.js';
import { SelectionEditor } from './selection-editor.js';
import { initPanelResize } from './panel-resize.js';
import { uiIcon } from './ui-icons.js';
import { openShapePicker, shapeIcon, shapeInfo } from './shape-picker.js';
import { encodeProjectFile, parseProjectFile, decodeProjectImage, MAX_PROJECT_BYTES } from './project-file.js';
import { ProjectStore } from './project-store.js';
import { openProjectGallery } from './project-gallery.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#preview');
const inspector = $('#inspector');
const panelResize = initPanelResize(document.querySelector('main'));
const startWithDots = new URLSearchParams(location.search).get('preset') !== 'peony';
let project = startWithDots ? dotsProject() : peonyProject();
const effectFingerprint = value => JSON.stringify(value, (key, item) => key === 'name' ? undefined : item);
let presetFingerprint = effectFingerprint(project);
let selectedId = project.layers.find(layer => layer.type === 'ascii')?.id || project.layers.at(-1)?.id;
let pendingFrame = 0;
let original = false;
let importGeneration = 0;
let exporting = false;
let saving = false;
let projectLoadGeneration = 0;
let activeProjectId = null;
let projectSession = 0;
const projectStore = new ProjectStore();
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
  if (effectFingerprint(project) !== presetFingerprint) $('#preset').value = 'custom';
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
function group(label, parent = inspector) {
  const section = controlElement('div', { class: 'control-group' });
  if (label) section.append(controlElement('div', { class: 'group-label' }, label));
  parent.append(section);
  return section;
}
const percent = value => `${Math.round(value * 100)}%`;
const px = value => `${Number(Number(value).toFixed(2))} px`;
const multiplier = value => `${Number(value).toFixed(2)}×`;

function inlineRename(trigger, { value, label, limit = 60, fallback, commit }) {
  const input = controlElement('input', { type: 'text', value, maxlength: limit, class: 'rename-input', 'aria-label': label });
  let finished = false;
  const finish = (save, restoreFocus = false) => {
    if (finished) return;
    finished = true;
    input.replaceWith(trigger);
    const target = save ? commit(normalizeName(input.value, fallback, limit)) || trigger : trigger;
    if (restoreFocus && target.isConnected) target.focus();
  };
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', event => {
    if (!['Enter', 'Escape'].includes(event.key) || event.isComposing) return;
    event.preventDefault(); finish(event.key === 'Enter', true);
  });
  trigger.replaceWith(input); input.focus(); input.select();
}

function renderProjectName() {
  const button = $('#project-name');
  button.replaceChildren(controlElement('span', {}, project.name), uiIcon('edit'));
  button.title = `Rename project: ${project.name}`;
  document.title = `${project.name} — Pixel Weave`;
}

const projectNameButton = $('#project-name');
const renameProject = () => inlineRename(projectNameButton, { value: project.name, label: 'Project name', limit: 80, fallback: 'Untitled', commit: value => {
  project.name = value; renderProjectName(); return projectNameButton;
} });
projectNameButton.addEventListener('click', renameProject);
projectNameButton.addEventListener('keydown', event => { if (event.key === 'F2') { event.preventDefault(); renameProject(); } });

function commitLayerName(layer, value) {
  layer.name = normalizeName(value, LAYER_NAMES[layer.type], 60);
  updateLayerName(layer);
  const input = inspector.querySelector('[aria-label="Layer name"]');
  if (selectedId === layer.id && input) input.value = layer.name;
  return $('#layers').querySelector(`[data-layer-id="${layer.id}"] .layer-pick`);
}

function updateLayerName(layer) {
  const row = $('#layers').querySelector(`[data-layer-id="${layer.id}"]`);
  if (!row) return;
  row.querySelector('.layer-title').textContent = layer.name || LAYER_NAMES[layer.type];
  row.querySelector('.layer-toggle').setAttribute('aria-label', `Toggle ${layer.name}`);
  const moves = row.querySelectorAll('.move-layer');
  moves[0].setAttribute('aria-label', `Move ${layer.name} up`);
  moves[1].setAttribute('aria-label', `Move ${layer.name} down`);
}

function range(parent, key, label, min, max, step = 0.01, format = multiplier) {
  const layer = selectedLayer();
  const wrapper = controlElement('label', { class: 'range-control' });
  const heading = controlElement('span', {}, label);
  const output = controlElement('output', {}, format(layer[key]));
  heading.append(output);
  const input = controlElement('input', { type: 'range', min, max, step, value: layer[key], 'data-key': key, 'aria-label': label });
  input.addEventListener('input', () => {
    layer[key] = Number(input.value);
    if (key === 'clumping') layer.densityPattern = 'random';
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

const inspectorTabs = new Map();

function toggle(parent, key, label) {
  const layer = selectedLayer();
  const wrapper = controlElement('label', { class: 'inline-control' }, label);
  const input = controlElement('input', { type: 'checkbox', 'data-key': key, 'aria-label': label });
  input.checked = layer[key];
  input.addEventListener('change', () => { layer[key] = input.checked; scheduleRender(); });
  wrapper.append(input); parent.append(wrapper);
}

function transformControls(parent) {
  const layer = selectedLayer();
  range(parent, 'scale', 'Scale', .25, 3);
  const limit = Math.min(4096, Math.max(renderer?.referenceWidth || 1024, renderer?.referenceHeight || 1024));
  const offsets = controlElement('div', { class: 'paired-controls' }); parent.append(offsets);
  range(offsets, 'offsetX', 'Offset X', -limit, limit, 1, px);
  range(offsets, 'offsetY', 'Offset Y', -limit, limit, 1, px);
  const reset = controlElement('button', { class: 'reset-transform' }, 'Reset transform');
  reset.addEventListener('click', () => { layer.scale = 1; layer.offsetX = layer.offsetY = 0; renderInspector(); scheduleRender(); });
  parent.append(reset);
}

function glowControls(parent) {
  const layer = selectedLayer();
  const label = controlElement('label', { class: 'inline-control glow-toggle' }, 'Glow');
  const enabled = controlElement('input', { type: 'checkbox', 'data-key': 'glowEnabled', 'aria-label': 'Glow' });
  enabled.checked = layer.glowEnabled;
  enabled.addEventListener('change', () => { layer.glowEnabled = enabled.checked; renderInspector(); scheduleRender(); });
  label.append(enabled); parent.append(label);
  const controls = controlElement('div', { class: 'glow-controls' });
  select(controls, 'glowStyle', 'Style', [['soft', 'Soft'], ['box', 'Box']]);
  range(controls, 'strength', 'Strength', 0, 6);
  range(controls, 'radius', 'Radius', 0, 80, 1, px);
  controls.querySelectorAll('input, select').forEach(input => { input.disabled = !layer.glowEnabled; });
  if (!layer.glowEnabled) controls.classList.add('inactive');
  parent.append(controls);
}

function renderInspector() {
  const focusKey = inspector.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  inspector.replaceChildren();
  const layer = selectedLayer();
  if (!layer) {
    selectionEditor.stop();
    inspector.append(controlElement('div', { class: 'empty-inspector' }, 'Select or add a layer'));
    return;
  }
  const header = controlElement('div', { class: 'inspector-header' });
  const identity = controlElement('div', { class: 'inspector-identity' });
  identity.append(controlElement('span', { class: 'section-label' }, `${LAYER_NAMES[layer.type]} layer`));
  const name = controlElement('input', { type: 'text', value: layer.name, maxlength: 60, 'aria-label': 'Layer name', class: 'layer-name-input' });
  let nameBeforeEditing = layer.name;
  name.addEventListener('focus', () => { nameBeforeEditing = layer.name; });
  name.addEventListener('input', () => { layer.name = name.value; updateLayerName(layer); });
  name.addEventListener('blur', () => commitLayerName(layer, name.value));
  name.addEventListener('keydown', event => {
    if (!['Enter', 'Escape'].includes(event.key) || event.isComposing) return;
    event.preventDefault();
    if (event.key === 'Escape') name.value = nameBeforeEditing;
    name.blur();
    $('#layers').querySelector(`[data-layer-id="${layer.id}"] .layer-pick`)?.focus();
  });
  const nameRow = controlElement('div', { class: 'layer-name-row' });
  const rename = controlElement('button', { type: 'button', title: 'Rename layer', 'aria-label': 'Rename layer', class: 'rename-layer' });
  rename.append(uiIcon('edit'));
  rename.addEventListener('click', () => { name.focus(); name.select(); });
  nameRow.append(name, rename); identity.append(nameRow);
  const duplicate = controlElement('button', { title: 'Duplicate layer', 'aria-label': 'Duplicate layer' });
  duplicate.append(uiIcon('copy'));
  duplicate.addEventListener('click', () => {
    if (project.layers.length >= MAX_LAYERS) return message(`Use up to ${MAX_LAYERS} layers`);
    const copy = createLayer(layer.type, { ...layer, id: crypto.randomUUID(), name: `${layer.name} copy` });
    project.layers.splice(project.layers.indexOf(layer) + 1, 0, copy);
    inspectorTabs.set(copy.id, inspectorTabs.get(layer.id) || 'shape');
    selectedId = copy.id; renderUI(); scheduleRender();
  });
  const remove = controlElement('button', { title: 'Delete layer', 'aria-label': 'Delete layer', class: 'delete-layer' });
  remove.append(uiIcon('trash'));
  remove.addEventListener('click', () => {
    const index = project.layers.indexOf(layer);
    project.layers.splice(index, 1); inspectorTabs.delete(layer.id);
    for (const other of project.layers) if (other.glowSource === layer.id) other.glowSource = 'source';
    selectedId = project.layers[Math.min(index, project.layers.length - 1)]?.id;
    renderUI(); scheduleRender();
  });
  header.append(identity, duplicate, remove); inspector.append(header);

  const sections = [['shape', 'Shape'], ['color', 'Color'], ['distribution', 'Distribution'],
    ...(layer.type !== 'pixel' ? [['sampling', 'Sampling']] : []), ['glow', 'Glow'], ['transform', 'Transform']];
  const navigation = controlElement('div', { class: 'inspector-tabs', role: 'tablist', 'aria-label': 'Layer settings' });
  const body = controlElement('div', { class: 'inspector-body' });
  const panels = new Map(), tabs = [];
  const activate = key => {
    inspectorTabs.set(layer.id, key);
    for (const [id, panel] of panels) panel.hidden = id !== key;
    for (const tab of tabs) {
      const selected = tab.dataset.tab === key;
      tab.setAttribute('aria-selected', selected); tab.tabIndex = selected ? 0 : -1;
    }
    body.scrollTop = 0;
  };
  for (const [key, label] of sections) {
    const tab = controlElement('button', { id: `tab-${key}`, role: 'tab', 'data-tab': key, 'aria-controls': `panel-${key}`, type: 'button' }, label);
    const panel = controlElement('section', { id: `panel-${key}`, class: 'inspector-tab-panel', role: 'tabpanel', 'aria-labelledby': tab.id, tabindex: '0' });
    tabs.push(tab); panels.set(key, panel);
    tab.addEventListener('click', () => activate(key));
    tab.addEventListener('keydown', event => {
      const current = tabs.indexOf(tab);
      let next;
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (current + 1) % tabs.length;
      else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (current + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); activate(tabs[next].dataset.tab); tabs[next].focus();
    });
    navigation.append(tab); body.append(panel);
  }
  inspector.append(navigation, body);
  const shape = panels.get('shape');
  if (layer.type === 'pixel') {
    range(shape, 'cellSize', 'Spacing', 6, 100, .01, px);
    range(shape, 'dotDiameter', 'Dot diameter', .25, 5, .25, px);
  } else if (layer.type === 'squares') {
    select(shape, 'pixelShape', 'Style', [['square', 'Filled'], ['box', 'Hollow']], true);
    range(shape, 'cellSize', 'Spacing', 2, 100, .25, px);
    range(shape, 'size', 'Square size', .1, 1, .01, percent);
    if (layer.pixelShape === 'box') range(shape, 'stroke', 'Stroke width', .02, .4, .01, percent);
    range(shape, 'toneSize', 'Size by tone', 0, 1, .01, percent);
  } else {
    if (layer.type === 'ascii') {
      const label = controlElement('label', { class: 'text-control' }, 'Characters');
      const input = controlElement('input', { type: 'text', value: layer.characters, 'data-key': 'characters', 'aria-label': 'Characters', spellcheck: 'false', class: 'characters-input' });
      input.addEventListener('input', () => { layer.characters = Array.from(input.value).slice(0, 64).join(''); scheduleRender(); });
      label.append(input); shape.append(label);
    } else {
      const picker = controlElement('button', { class: 'shape-picker-trigger', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': 'Choose shapes' });
      const preview = controlElement('span', { class: 'shape-preview', 'aria-hidden': 'true' });
      for (const id of layer.shapes.slice(0, 4)) preview.append(shapeIcon(id));
      const label = layer.shapes.length === 1 ? shapeInfo(layer.shapes[0])?.name : layer.shapes.length ? `${layer.shapes.length} shapes` : 'Choose shapes';
      picker.append(preview, controlElement('span', {}, label), controlElement('span', { class: 'picker-chevron', 'aria-hidden': 'true' }, '⌄'));
      picker.addEventListener('click', () => openShapePicker({ selected: layer.shapes, trigger: picker, onApply: shapes => {
        layer.shapes = shapes;
        // Keep the trigger mounted so closing the modal restores keyboard focus.
        preview.replaceChildren(...shapes.slice(0, 4).map(shapeIcon));
        picker.children[1].textContent = shapes.length === 1 ? shapeInfo(shapes[0])?.name : `${shapes.length} shapes`;
        scheduleRender();
      } }));
      shape.append(picker);
    }
    range(shape, 'cellSize', 'Spacing', 2, 100, .25, px);
    range(shape, 'size', 'Symbol size', .1, 1, .01, percent);
    range(shape, 'toneSize', 'Size by tone', 0, 1, .01, percent);
    if (layer.type === 'shapes') range(shape, 'stroke', 'Stroke width', .02, .4, .01, percent);
    toggle(shape, 'invert', 'Reverse symbol order');
  }

  const appearance = panels.get('color');
  color(appearance);
  const compositing = group('Compositing', appearance);
  range(compositing, 'opacity', 'Opacity', 0, 1, .01, percent);
  select(compositing, 'blend', 'Blend', [['normal', 'Normal'], ['screen', 'Screen'], ['add', 'Add'], ['multiply', 'Multiply']]);

  transformControls(panels.get('transform'));
  const distribution = panels.get('distribution');
  if (['pixel', 'squares'].includes(layer.type)) {
    range(distribution, 'density', 'Coverage', 0, 1, .01, percent);
    range(distribution, 'clumping', 'Clumping', 0, 1, .01, percent);
  } else {
    select(distribution, 'mapping', 'Symbol mapping', [['brightness', 'Brightness'], ['random', 'Random']], true);
    range(distribution, 'density', 'Coverage', 0, 1, .01, percent);
    select(distribution, 'densityPattern', 'Pattern', [['random', 'Random'], ['ordered', 'Ordered']], true);
    range(distribution, 'densityShading', 'Density by tone', 0, 1, .01, percent);
    range(distribution, 'densityGamma', 'Tone curve', .2, 4);
    if (layer.densityPattern === 'random' || layer.mapping === 'random') range(distribution, 'seed', 'Seed', 0, 9999, 1, String);
  }
  const selection = group('Selection', distribution);
  range(selection, 'brushSize', 'Brush size', 10, 500, 10, px);
  selectionEditor.inspect(selection);
  if (layer.type !== 'pixel') {
    const mask = group('', panels.get('transform')); mask.classList.add('transform-region');
    select(mask, 'maskMode', 'Region', [['none', 'All'], ['linear', 'Linear'], ['radial', 'Radial']], true);
    if (layer.maskMode !== 'none') {
      if (layer.maskMode === 'linear') {
        range(mask, 'maskAngle', 'Angle', -180, 180, 1, value => `${value}°`);
        range(mask, 'maskPosition', 'Position', 0, 1, .01, percent);
      } else {
        const center = controlElement('div', { class: 'paired-controls' }); mask.append(center);
        range(center, 'maskX', 'Center X', 0, 1, .01, percent);
        range(center, 'maskY', 'Center Y', 0, 1, .01, percent);
      }
      const softness = controlElement('div', { class: layer.maskMode === 'radial' ? 'paired-controls' : '' }); mask.append(softness);
      if (layer.maskMode === 'radial') range(softness, 'maskRadius', 'Mask radius', .05, 1.5, .01, percent);
      range(softness, 'maskFeather', 'Feather', 0, 1, .01, percent);
      select(mask, 'maskEdges', 'Edges', [['fade', 'Fade'], ['scatter', 'Scatter']]);
      toggle(mask, 'maskInvert', 'Invert mask');
    }
    const sampling = panels.get('sampling');
    range(sampling, 'brightness', 'Brightness boost', 0, 4);
    range(sampling, 'contrast', 'Contrast', 0, 3);
    range(sampling, 'detail', 'Image detail', 0, 1, .01, percent);
    range(sampling, 'threshold', 'Minimum brightness', 0, 1, .01, percent);
    range(sampling, 'ceiling', 'Maximum brightness', 0, 1, .01, percent);
  }
  glowControls(panels.get('glow'));
  activate(inspectorTabs.get(layer.id) || 'shape');
  if (focusKey) inspector.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

function renderReference() {
  const thumbnail = $('#reference-thumbnail'), source = renderer?.sourceCanvas;
  const context = thumbnail.getContext('2d');
  context.clearRect(0, 0, thumbnail.width, thumbnail.height);
  if (!source) return;
  const scale = Math.min(thumbnail.width / source.width, thumbnail.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  context.drawImage(source, (thumbnail.width - width) / 2, (thumbnail.height - height) / 2, width, height);
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
  const glyphs = { ascii: 'Aa', pixel: '⠿', squares: '□', shapes: '✦' };
  for (const layer of [...project.layers].reverse()) {
    const row = controlElement('div', { class: `layer-row${layer.id === selectedId ? ' selected' : ''}`, 'data-layer-id': layer.id });
    const toggle = controlElement('button', { class: 'layer-toggle', 'aria-pressed': layer.enabled, 'aria-label': `Toggle ${layer.name}`, title: layer.enabled ? 'Hide layer' : 'Show layer' });
    toggle.append(uiIcon(layer.enabled ? 'eye' : 'eyeOff'));
    toggle.addEventListener('click', () => { layer.enabled = !layer.enabled; renderLayers(); scheduleRender(); });
    const pick = controlElement('button', { class: 'layer-pick', 'aria-pressed': layer.id === selectedId, title: 'Double-click or press F2 to rename' });
    pick.append(controlElement('span', { class: 'layer-type' }, glyphs[layer.type]), controlElement('span', { class: 'layer-title' }, layer.name || layer.type));
    pick.addEventListener('click', () => {
      if (selectedId === layer.id) return;
      selectedId = layer.id;
      // Keep the clicked node in place so double-click can begin renaming.
      list.querySelectorAll('.layer-row').forEach(row => {
        const selected = row.dataset.layerId === selectedId;
        row.classList.toggle('selected', selected); row.querySelector('.layer-pick').setAttribute('aria-pressed', selected);
      });
      renderInspector();
    });
    const rename = () => inlineRename(pick, { value: layer.name, label: 'Layer name in stack', fallback: LAYER_NAMES[layer.type], commit: value => commitLayerName(layer, value) });
    pick.addEventListener('dblclick', rename);
    pick.addEventListener('keydown', event => { if (event.key === 'F2') { event.preventDefault(); rename(); } });
    const up = controlElement('button', { class: 'move-layer', 'aria-label': `Move ${layer.name} up`, title: 'Move up' });
    const down = controlElement('button', { class: 'move-layer', 'aria-label': `Move ${layer.name} down`, title: 'Move down' });
    up.append(uiIcon('arrowUp')); down.append(uiIcon('arrowDown'));
    up.disabled = project.layers.indexOf(layer) === project.layers.length - 1;
    down.disabled = project.layers.indexOf(layer) === 0;
    up.addEventListener('click', () => moveLayer(layer, 1)); down.addEventListener('click', () => moveLayer(layer, -1));
    row.append(toggle, pick, up, down); list.append(row);
  }
  document.querySelectorAll('[data-add]').forEach(button => { button.disabled = project.layers.length >= MAX_LAYERS; });
}

function renderUI() { renderProjectName(); renderLayers(); renderInspector(); }

const selectionEditor = new SelectionEditor({ surface: $('#paint-surface'), highlight: $('#selection-overlay'), cursor: $('#brush-cursor'), getLayer: selectedLayer, getRenderer: () => renderer, onChange: scheduleRender, onEditStart: () => { if (original) { original = false; $('#compare').setAttribute('aria-pressed', false); scheduleRender(); } } });

document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
  if (project.layers.length >= MAX_LAYERS) return;
  const type = button.dataset.add;
  const layer = createLayer(type, type === 'pixel' ? { pixelShape: 'dot', cellSize: 9, dotDiameter: 3.25, density: .6, colorMode: 'solid', color: '#eddbff', threshold: 0 } : {});
  project.layers.push(layer); selectedId = layer.id; renderUI(); scheduleRender();
}));

$('#background').addEventListener('input', event => { project.background = event.target.value; scheduleRender(); });
$('#source-tint').addEventListener('input', event => { project.sourceTint = event.target.value; scheduleRender(); });
for (const [button, input, key, value] of [
  ['#reset-tint', '#source-tint', 'sourceTint', '#ffffff'],
  ['#reset-background', '#background', 'background', '#08090b'],
]) $(button).addEventListener('click', () => {
  project[key] = value;
  $(input).value = value;
  scheduleRender();
});
$('#source-opacity').addEventListener('input', event => { project.sourceOpacity = Number(event.target.value); $('#source-opacity-value').textContent = percent(project.sourceOpacity); scheduleRender(); });
$('#quality').addEventListener('change', scheduleRender);
$('#preset').addEventListener('change', event => {
  selectionEditor.stop();
  const name = project.name;
  project = event.target.value === 'peony' ? peonyProject(renderer.referenceWidth) : event.target.value === 'dots' ? dotsProject(renderer.referenceWidth) : defaultProject();
  project.name = name;
  presetFingerprint = effectFingerprint(project);
  selectedId = project.layers.find(layer => layer.type === 'ascii')?.id || project.layers.at(-1)?.id;
  $('#background').value = project.background;
  $('#source-tint').value = project.sourceTint;
  $('#source-opacity').value = project.sourceOpacity;
  $('#source-opacity-value').textContent = percent(project.sourceOpacity);
  renderUI(); scheduleRender();
});
$('#compare').addEventListener('click', () => { selectionEditor.stop(); original = !original; $('#compare').setAttribute('aria-pressed', original); scheduleRender(); });
$('#open-image').addEventListener('click', () => $('#image-input').click());
$('#load-project').addEventListener('click', () => openProjectGallery({
  store: projectStore, currentId: activeProjectId, trigger: $('#load-project'),
  onOpen: async id => {
    const record = await projectStore.get(id);
    if (!record) throw new Error('That saved project is no longer available.');
    return restoreProjectFile(record.file, { id, name: record.name });
  },
  onRename: (id, name) => { if (id === activeProjectId) { project.name = name; renderProjectName(); } },
  onRemove: id => { if (id === activeProjectId) activeProjectId = null; },
  onImport: () => $('#project-input').click(),
}));

async function importImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return message('Choose an image file.');
  if (file.size > 50 * 1024 * 1024) return message('Choose an image smaller than 50 MB.');
  const generation = ++importGeneration;
  projectLoadGeneration++;
  const url = URL.createObjectURL(file);
  let image;
  try {
    image = new Image(); image.decoding = 'async'; image.src = url;
    await image.decode();
    if (generation !== importGeneration) return;
    renderer.setSource(image);
    renderReference();
    selectionEditor.stop();
    for (const layer of project.layers) { layer.selectionActive = false; layer.selectionBits = ''; }
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
const saveMenu = $('#project-save-menu'), saveOptions = $('#save-options');
function closeSaveMenu() { saveMenu.hidden = true; saveOptions.setAttribute('aria-expanded', 'false'); }
saveOptions.addEventListener('click', () => {
  saveMenu.hidden = !saveMenu.hidden; saveOptions.setAttribute('aria-expanded', String(!saveMenu.hidden));
  if (!saveMenu.hidden) saveMenu.querySelector('button').focus();
});
saveMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeSaveMenu(); saveOptions.focus(); }
  else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    const buttons = [...saveMenu.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
  }
});
document.addEventListener('click', event => { if (!event.target.closest('.save-actions')) closeSaveMenu(); });
document.addEventListener('focusin', event => { if (!event.target.closest('.save-actions')) closeSaveMenu(); });

function projectThumbnail(state, source) {
  let rendered = source;
  try { if (renderer.render(state, { maxEdge: Number($('#quality').value) })) rendered = renderer.canvas; } catch { /* The source is still a useful preview if graphics are paused. */ }
  const scale = Math.min(240 / rendered.width, 160 / rendered.height);
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.round(rendered.width * scale)); preview.height = Math.max(1, Math.round(rendered.height * scale));
  preview.getContext('2d').drawImage(rendered, 0, 0, preview.width, preview.height);
  scheduleRender();
  return new Promise(resolve => preview.toBlob(resolve, 'image/webp', .82));
}

async function saveProject({ copy = false, downloadFile = false } = {}) {
  if (saving) return;
  saving = true;
  closeSaveMenu();
  const button = $('#save-project'); button.disabled = true; button.textContent = 'Saving…';
  $('#load-project').disabled = saveOptions.disabled = true;
  const session = projectSession;
  try {
    const source = renderer?.sourceCanvas;
    if (!source) throw new Error('Open an image before saving a project.');
    const state = normalizeProject(project), previousName = project.name;
    if (copy) state.name = `${Array.from(state.name).slice(0, 75).join('')} copy`;
    const thumbnail = downloadFile ? null : projectThumbnail(state, source);
    const file = await encodeProjectFile(state, source, $('#image-name').textContent);
    if (downloadFile) download(file, `${projectFilename(state.name)}.pixelweave`);
    else {
      const record = await projectStore.save({ id: copy || !activeProjectId ? crypto.randomUUID() : activeProjectId, name: state.name, file, thumbnail: await thumbnail });
      if (projectSession === session) {
        activeProjectId = record.id;
        if (copy && project.name === previousName) { project.name = state.name; renderProjectName(); }
      }
      message('Project saved');
    }
  } catch (error) { message(error.message); }
  finally { saving = false; button.disabled = false; button.textContent = 'Save project'; $('#load-project').disabled = saveOptions.disabled = false; }
}
$('#save-project').addEventListener('click', () => saveProject());
$('#save-copy').addEventListener('click', () => saveProject({ copy: true }));
$('#download-project').addEventListener('click', () => saveProject({ downloadFile: true }));

async function restoreProjectFile(file, saved = null) {
  if (file.type.startsWith('image/')) throw new Error('Use Open image for pictures. Import project expects an editable project.');
  if (file.size > MAX_PROJECT_BYTES) throw new Error('Choose a project smaller than 32 MB.');
  const generation = ++projectLoadGeneration;
  $('#save-project').disabled = saveOptions.disabled = true;
  let image;
  try {
    const loaded = parseProjectFile(await file.text());
    if (loaded.source) image = await decodeProjectImage(loaded.source);
    if (generation !== projectLoadGeneration) return false;
    if (loaded.source) {
      importGeneration++;
      renderer.setSource(image);
      $('#image-name').textContent = loaded.source.name;
      renderReference();
    } else if (renderer.sourceCanvas) importGeneration++;
    project = loaded.project;
    if (saved) project.name = saved.name;
    activeProjectId = saved?.id || null; projectSession++;
    selectionEditor.stop();
    original = false; $('#compare').setAttribute('aria-pressed', false);
    selectedId = project.layers.at(-1)?.id;
    $('#background').value = project.background; $('#source-tint').value = project.sourceTint;
    $('#source-opacity').value = project.sourceOpacity; $('#source-opacity-value').textContent = percent(project.sourceOpacity);
    renderUI(); scheduleRender();
    if (!loaded.source) message('Loaded settings. The current reference image stays in place.');
    return true;
  } finally { if (image) image.src = ''; if (!saving) $('#save-project').disabled = saveOptions.disabled = false; }
}
$('#project-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  const button = $('#load-project'); button.disabled = true; button.textContent = 'Loading…';
  try {
    if (await restoreProjectFile(file)) await saveProject();
  } catch (error) { message(error.message || 'Could not import the project.'); }
  finally { button.disabled = false; button.textContent = 'Load project'; }
});

$('#export-image').addEventListener('click', async () => {
  if (exporting) return;
  exporting = true;
  const button = $('#export-image'); button.disabled = true; button.textContent = 'Exporting…';
  if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; }
  try {
    const blob = await renderer.exportPNG(project, 2048);
    download(blob, `${projectFilename(project.name)}-pixel-weave.png`);
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
    renderer.setSource(source); renderReference(); renderInspector(); scheduleRender();
  }).catch(() => {
    if (generation !== importGeneration) return;
    renderer.setSource(makeSample()); renderReference(); renderInspector(); scheduleRender();
  });
} catch (error) {
  message(error.message);
  $('#export-image').disabled = true;
  $('#open-image').disabled = true;
}
window.addEventListener('pagehide', event => { if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; } if (!event.persisted) { panelResize.dispose(); previewObserver.disconnect(); renderer?.dispose(); } });
window.addEventListener('pageshow', event => { if (event.persisted) { panelResize.refresh(); scheduleRender(); } });
