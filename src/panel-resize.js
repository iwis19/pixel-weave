const STORAGE_KEY = 'ascii-effects.panel-widths';
const MIN = { left: 180, right: 260 };
const MAX = { left: 480, right: 520 };

export function initPanelResize(main) {
  const handles = [...main.querySelectorAll('[data-panel-resize]')];
  const panels = { left: main.querySelector('.library-panel'), right: main.querySelector('.inspector-panel') };
  const events = new AbortController();
  let preferences = {}, drag = null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    for (const side of ['left', 'right']) if (Number.isFinite(saved?.[side])) preferences[side] = saved[side];
  } catch { /* Width preferences are optional when storage is unavailable. */ }
  const mode = () => main.clientWidth <= 640 ? 'stacked' : main.clientWidth <= 900 ? 'tablet' : 'desktop';
  const active = side => mode() === 'desktop' || (side === 'right' && mode() === 'tablet');
  const defaults = side => parseFloat(getComputedStyle(main).getPropertyValue(`--${side}-panel-default`));
  const width = side => panels[side].getBoundingClientRect().width;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const limit = side => Math.min(MAX[side], main.clientWidth - (mode() === 'desktop' ? width(side === 'left' ? 'right' : 'left') + 300 : 240));
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Keep resizing available. */ } };
  const updateHandles = () => {
    main.style.setProperty('--panel-resize-top', mode() === 'tablet' ? `${panels.left.getBoundingClientRect().height}px` : '0px');
    for (const handle of handles) {
      const side = handle.dataset.panelResize;
      handle.hidden = !active(side);
      handle.setAttribute('aria-valuemin', MIN[side]);
      handle.setAttribute('aria-valuemax', Math.round(Math.max(MIN[side], limit(side))));
      handle.setAttribute('aria-valuenow', Math.round(width(side)));
      handle.setAttribute('aria-valuetext', `${Math.round(width(side))} pixels`);
    }
  };
  const setWidth = (side, value) => {
    const next = clamp(value, MIN[side], limit(side));
    main.style.setProperty(`--${side}-panel-width`, `${next}px`);
    updateHandles();
    return next;
  };
  const finish = (cancel = false) => {
    if (!drag) return;
    const previous = drag; drag = null;
    if (cancel) setWidth(previous.side, previous.startWidth);
    else { preferences[previous.side] = width(previous.side); save(); }
    document.body.classList.remove('resizing-panels');
    previous.handle.classList.remove('is-resizing');
    if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
  };
  const refresh = () => {
    finish();
    let left = clamp(preferences.left ?? defaults('left'), MIN.left, MAX.left);
    let right = clamp(preferences.right ?? defaults('right'), MIN.right, MAX.right);
    if (mode() === 'desktop') {
      const extra = left + right - MIN.left - MIN.right;
      const factor = extra ? Math.min(1, (main.clientWidth - 300 - MIN.left - MIN.right) / extra) : 1;
      left = MIN.left + (left - MIN.left) * factor;
      right = MIN.right + (right - MIN.right) * factor;
    } else if (mode() === 'tablet') right = Math.min(right, main.clientWidth - 240);
    main.style.setProperty('--left-panel-width', `${left}px`);
    main.style.setProperty('--right-panel-width', `${right}px`);
    updateHandles();
  };
  const reset = side => { finish(); delete preferences[side]; save(); refresh(); };
  for (const handle of handles) {
    const side = handle.dataset.panelResize;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !active(side) || drag) return;
      event.preventDefault(); handle.focus({ preventScroll: true });
      drag = { side, handle, pointerId: event.pointerId, startX: event.clientX, startWidth: width(side) };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('is-resizing'); document.body.classList.add('resizing-panels');
    }, { signal: events.signal });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.handle !== handle || event.pointerId !== drag.pointerId) return;
      setWidth(side, drag.startWidth + (event.clientX - drag.startX) * (side === 'left' ? 1 : -1));
    }, { signal: events.signal });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(event, () => finish(), { signal: events.signal });
    handle.addEventListener('dblclick', () => reset(side), { signal: events.signal });
    handle.addEventListener('keydown', event => {
      if (!active(side)) return;
      if (event.key === 'Escape' && drag) { event.preventDefault(); finish(true); return; }
      if (event.key === 'Enter') { event.preventDefault(); reset(side); return; }
      const amount = event.shiftKey ? 40 : 10;
      let next;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = width(side) + (event.key === 'ArrowRight' ? amount : -amount) * (side === 'left' ? 1 : -1);
      else if (event.key === 'Home') next = MIN[side];
      else if (event.key === 'End') next = limit(side);
      if (next === undefined) return;
      event.preventDefault(); preferences[side] = setWidth(side, next); save();
    }, { signal: events.signal });
  }
  const observer = new ResizeObserver(refresh); observer.observe(main);
  refresh();
  return { refresh, dispose() { finish(); observer.disconnect(); events.abort(); } };
}
