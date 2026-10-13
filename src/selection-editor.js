import { MASK_WIDTH, MASK_HEIGHT, decodeSelection, encodeSelection, paintSelection } from './selection.js';

export class SelectionEditor {
  constructor({ surface, highlight, cursor, getLayer, getRenderer, onChange, onEditStart = () => {} }) {
    Object.assign(this, { surface, highlight, cursor, getLayer, getRenderer, onChange, onEditStart });
    this.drawing = false;
    this.erase = false;
    this.mask = decodeSelection();
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = highlight.width = MASK_WIDTH;
    this.maskCanvas.height = highlight.height = MASK_HEIGHT;
    this.bind(surface, cursor);
  }

  inspect(parent) {
    const layer = this.getLayer();
    if (this.layerId !== layer.id) this.drawing = false;
    this.layerId = layer.id;
    this.mask = decodeSelection(layer.selectionBits);
    const button = (text, action) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', action); return b; };
    const actions = document.createElement('div'); actions.className = 'selection-actions';
    this.drawButton = button('Draw selection', () => { this.drawing = !this.drawing; this.erase = false; if (this.drawing) this.onEditStart(); this.update(); });
    this.clearButton = button('Clear', () => { this.mask.fill(0); layer.selectionBits = ''; layer.selectionActive = false; this.erase = false; this.update(); this.onChange(); });
    actions.append(this.drawButton, this.clearButton);
    const mapWrap = document.createElement('div'); mapWrap.className = 'selection-map';
    this.map = document.createElement('canvas'); this.map.width = 320; this.map.height = 256;
    this.map.setAttribute('role', 'img'); this.map.setAttribute('aria-label', 'Distribution selection map');
    this.mapSurface = button('', () => {}); this.mapSurface.className = 'paint-surface';
    this.mapSurface.setAttribute('aria-label', 'Draw selection on distribution map. Arrow keys move the brush; Space paints; Escape exits drawing.');
    this.mapCursor = document.createElement('span'); this.mapCursor.className = 'brush-cursor'; this.mapCursor.setAttribute('aria-hidden', 'true');
    mapWrap.append(this.map, this.mapSurface, this.mapCursor);
    this.eraseButton = button('Erase', () => { this.erase = !this.erase; this.update(); });
    this.eraseButton.className = 'erase-selection';
    parent.append(actions, mapWrap, this.eraseButton);
    this.bind(this.mapSurface, this.mapCursor);
    this.update();
  }

  stop() { this.drawing = false; this.update(); }

  update() {
    const layer = this.getLayer();
    const enabled = this.drawing && layer?.symbolMode === 'points';
    this.surface.disabled = !enabled;
    this.highlight.hidden = !enabled;
    if (this.mapSurface) this.mapSurface.disabled = !enabled;
    this.drawButton?.setAttribute('aria-pressed', String(enabled));
    if (this.eraseButton) { this.eraseButton.disabled = !enabled; this.eraseButton.setAttribute('aria-pressed', String(this.erase)); }
    if (!enabled) { this.cursor.style.display = 'none'; if (this.mapCursor) this.mapCursor.style.display = 'none'; }
    if (layer?.symbolMode !== 'points') return;
    const c = this.maskCanvas.getContext('2d');
    const rgba = c.createImageData(MASK_WIDTH, MASK_HEIGHT);
    for (let i = 0; i < this.mask.length; i++) { const p = i * 4; rgba.data[p] = 178; rgba.data[p + 1] = 141; rgba.data[p + 2] = 255; rgba.data[p + 3] = layer.selectionActive ? this.mask[i] * 255 : 0; }
    c.putImageData(rgba, 0, 0);
    const hc = this.highlight.getContext('2d'); hc.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT); hc.drawImage(this.maskCanvas, 0, 0);
    if (this.map) {
      const renderer = this.getRenderer(), source = renderer?.sourceCanvas;
      const height = Math.max(1, Math.round(320 * (source ? source.height / source.width : .8)));
      if (this.map.height !== height) this.map.height = height;
      const mc = this.map.getContext('2d'); mc.fillStyle = '#08090c'; mc.fillRect(0, 0, 320, height);
      if (source) mc.drawImage(source, 0, 0, 320, height);
      mc.globalAlpha = .5; mc.drawImage(this.maskCanvas, 0, 0, 320, height); mc.globalAlpha = 1;
    }
  }

  bind(surface, cursor) {
    let last = null, dragging = false, keyboard = { x: .5, y: .5 };
    const point = e => { const b = surface.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }; };
    const showCursor = p => {
      const layer = this.getLayer(), renderer = this.getRenderer(), b = surface.getBoundingClientRect();
      if (!layer || !renderer?.referenceWidth) return;
      cursor.style.display = 'block'; cursor.style.left = `${p.x * 100}%`; cursor.style.top = `${p.y * 100}%`;
      cursor.style.width = `${layer.brushSize / renderer.referenceWidth * b.width}px`;
      cursor.style.height = `${layer.brushSize / renderer.referenceHeight * b.height}px`;
    };
    const stamp = p => {
      const layer = this.getLayer(), renderer = this.getRenderer();
      if (!layer || !renderer?.referenceWidth || (this.erase && !layer.selectionActive)) return;
      layer.selectionActive = true;
      paintSelection(this.mask, p.x, p.y, layer.brushSize, renderer.referenceWidth, renderer.referenceHeight, this.erase);
    };
    const commit = () => { const layer = this.getLayer(); if (!layer || layer.id !== this.layerId) return; layer.selectionBits = encodeSelection(this.mask); this.update(); this.onChange(); };
    surface.addEventListener('pointerdown', e => {
      if (!this.drawing || surface.disabled || e.button !== 0) return;
      e.preventDefault(); surface.focus({ preventScroll: true }); surface.setPointerCapture(e.pointerId);
      dragging = true; keyboard = last = point(e); showCursor(last); stamp(last); commit();
    });
    surface.addEventListener('pointermove', e => {
      if (!this.drawing || surface.disabled) return;
      const next = point(e); keyboard = next; showCursor(next);
      if (!dragging) return;
      const renderer = this.getRenderer(), layer = this.getLayer();
      const distance = Math.hypot((next.x - last.x) * renderer.referenceWidth, (next.y - last.y) * renderer.referenceHeight);
      const steps = Math.max(1, Math.ceil(distance / Math.max(5, layer.brushSize / 5)));
      for (let i = 1; i <= steps; i++) stamp({ x: last.x + (next.x - last.x) * i / steps, y: last.y + (next.y - last.y) * i / steps });
      last = next; commit();
    });
    const finish = () => { dragging = false; last = null; };
    surface.addEventListener('pointerup', finish); surface.addEventListener('pointercancel', finish); surface.addEventListener('lostpointercapture', finish);
    surface.addEventListener('pointerleave', () => { if (!dragging) cursor.style.display = 'none'; });
    surface.addEventListener('blur', () => { cursor.style.display = 'none'; });
    surface.addEventListener('keydown', e => {
      if (!this.drawing || surface.disabled) return;
      if (e.key === 'Escape') { e.preventDefault(); finish(); this.stop(); this.drawButton?.focus(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); const renderer = this.getRenderer(), amount = this.getLayer().brushSize * (e.shiftKey ? 1 : .25);
      keyboard.x = Math.max(0, Math.min(1, keyboard.x + (e.key === 'ArrowRight' ? amount : e.key === 'ArrowLeft' ? -amount : 0) / renderer.referenceWidth));
      keyboard.y = Math.max(0, Math.min(1, keyboard.y + (e.key === 'ArrowDown' ? amount : e.key === 'ArrowUp' ? -amount : 0) / renderer.referenceHeight));
      showCursor(keyboard);
    });
    surface.addEventListener('click', e => { if (this.drawing && !surface.disabled && e.detail === 0) { stamp(keyboard); showCursor(keyboard); commit(); } });
  }
}
