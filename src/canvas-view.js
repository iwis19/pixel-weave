import { ViewTransform, MIN_ZOOM, MAX_ZOOM } from './view-transform.js';

const typing = target => target?.isContentEditable || target?.matches('input, textarea, select');

export class CanvasView {
  constructor({ viewport, surface, controls, getDrawing = () => false, onPanStart = () => {} }) {
    Object.assign(this, { viewport, surface, controls, getDrawing, onPanStart });
    this.transform = new ViewTransform(); this.hand = false; this.space = false; this.spaceHandled = false; this.drag = null; this.listeners = [];
    const listen = (target, type, fn, options) => { target.addEventListener(type, fn, options); this.listeners.push(() => target.removeEventListener(type, fn, options)); };
    listen(controls.out, 'click', () => this.zoomBy(1 / 1.25));
    listen(controls.in, 'click', () => this.zoomBy(1.25));
    listen(controls.level, 'click', () => { this.transform.actual(); this.update(); });
    listen(controls.fit, 'click', () => this.fit());
    listen(controls.hand, 'click', () => { this.hand = !this.hand; this.update(); });
    listen(viewport, 'wheel', event => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.transform.height : 1;
      if (event.shiftKey) this.transform.pan(-(event.deltaX || event.deltaY) * units, 0);
      else this.transform.zoom(this.transform.scale * Math.exp(-Math.max(-400, Math.min(400, event.deltaY * units)) * .002), event.clientX - rect.left - this.padding.left, event.clientY - rect.top - this.padding.top);
      this.update();
    }, { passive: false });
    listen(viewport, 'pointerdown', event => {
      if (![0, 1].includes(event.button) || !(event.button === 1 || this.space || this.hand || (event.pointerType === 'touch' && !this.getDrawing()))) return;
      if (this.space) this.spaceHandled = true;
      event.preventDefault(); event.stopImmediatePropagation(); this.onPanStart();
      viewport.focus({ preventScroll: true }); viewport.setPointerCapture(event.pointerId);
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; this.update();
    }, true);
    listen(viewport, 'pointermove', event => {
      if (this.drag?.id !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.transform.pan(event.clientX - this.drag.x, event.clientY - this.drag.y);
      this.drag.x = event.clientX; this.drag.y = event.clientY; this.update();
    }, true);
    const finish = event => {
      if (this.drag?.id !== event.pointerId) return;
      event.stopImmediatePropagation(); this.drag = null;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      this.update();
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(viewport, type, finish, true);
    listen(viewport, 'auxclick', event => { if (event.button === 1) event.preventDefault(); });
    listen(document, 'keydown', event => {
      const spaceKey = event.code === 'Space' || event.key === ' ';
      const nonTextInput = event.target?.matches('input[type="range"], input[type="checkbox"]');
      if ((typing(event.target) && !(spaceKey && nonTextInput)) || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      const canvasFocus = event.target === document.body || viewport.contains(event.target) || controls.toolbar.contains(event.target);
      if (spaceKey) {
        this.spaceHandled = this.spaceHandled || canvasFocus;
        if (this.spaceHandled) event.preventDefault();
        if (!this.space) this.onPanStart(); this.space = true; this.update(); return;
      }
      if (!canvasFocus) return;
      if (['+', '=', '-', '0', '1'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '0') this.fit();
        else if (event.key === '1') { this.transform.actual(); this.update(); }
        else this.zoomBy(event.key === '-' ? 1 / 1.25 : 1.25);
      } else if (event.target === viewport && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const amount = event.shiftKey ? 100 : 30;
        this.transform.pan(event.key === 'ArrowLeft' ? amount : event.key === 'ArrowRight' ? -amount : 0, event.key === 'ArrowUp' ? amount : event.key === 'ArrowDown' ? -amount : 0); this.update();
      }
    });
    listen(document, 'keyup', event => {
      if ((event.code === 'Space' || event.key === ' ') && this.space) {
        if (this.spaceHandled) event.preventDefault(); this.space = this.spaceHandled = false; this.update();
      }
    });
    listen(window, 'blur', () => {
      this.space = this.spaceHandled = false; const id = this.drag?.id; this.drag = null;
      if (id !== undefined && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
      this.update();
    });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(viewport);
    this.resize();
  }

  resize() {
    const style = getComputedStyle(this.viewport);
    this.padding = { left: parseFloat(style.paddingLeft), top: parseFloat(style.paddingTop) };
    const width = this.viewport.clientWidth - this.padding.left - parseFloat(style.paddingRight);
    const height = this.viewport.clientHeight - this.padding.top - parseFloat(style.paddingBottom);
    this.transform.resize(width, height); this.update();
  }
  setImageSize(width, height, { reset = false } = {}) {
    this.transform.resize(this.transform.width, this.transform.height, width, height);
    if (reset) this.transform.fit(); this.update();
  }
  fit() { this.transform.fit(); this.update(); }
  zoomBy(factor) { this.transform.zoom(this.transform.scale * factor); this.update(); }
  update() {
    const view = this.transform;
    this.surface.style.width = `${view.imageWidth}px`; this.surface.style.height = `${view.imageHeight}px`;
    this.surface.style.transform = `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    this.controls.level.textContent = `${Math.round(view.scale * 100)}%`;
    this.controls.in.disabled = view.scale >= MAX_ZOOM; this.controls.out.disabled = view.scale <= MIN_ZOOM;
    this.controls.hand.setAttribute('aria-pressed', String(this.hand));
    this.viewport.classList.toggle('can-pan', this.hand || this.space);
    this.viewport.classList.toggle('is-panning', Boolean(this.drag));
  }
  dispose() { this.observer.disconnect(); this.listeners.forEach(remove => remove()); }
}
