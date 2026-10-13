export const SHAPE_CATALOG = [
  { id: 'cross', name: 'Plus', category: 'Crosses', path: 'M4 12h16M12 4v16', stroke: true },
  { id: 'x', name: 'Cross', category: 'Crosses', path: 'M5 5l14 14M19 5L5 19', stroke: true },
  { id: 'asterisk', name: 'Asterisk', category: 'Crosses', path: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9', stroke: true },
  { id: 'star', name: 'Sparkle', category: 'Stars', path: 'M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z' },
  { id: 'star5', name: 'Star', category: 'Stars', path: 'M12 2l2.9 6.2 6.8 1-4.9 4.8 1.2 6.8-6-3.2-6 3.2 1.2-6.8-4.9-4.8 6.8-1Z' },
  { id: 'diamond', name: 'Diamond', category: 'Geometric', path: 'M12 3l9 9-9 9-9-9Z', stroke: true },
  { id: 'triangle', name: 'Triangle', category: 'Geometric', path: 'M12 3l9 16H3Z' },
  { id: 'triangle-outline', name: 'Hollow triangle', category: 'Geometric', path: 'M12 3l9 16H3Z', stroke: true },
  { id: 'ring', name: 'Ring', category: 'Geometric', path: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', stroke: true },
];
// Older mixed sets stay visible and removable, but squares and dots have their own layer types.
const legacy = [
  { id: 'square', name: 'Square', path: 'M3 3h18v18H3Z' },
  { id: 'box', name: 'Hollow square', path: 'M3 3h18v18H3Z', stroke: true },
  { id: 'dot', name: 'Dot', path: 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z' },
];
export function shapeInfo(id) { return [...SHAPE_CATALOG, ...legacy].find(shape => shape.id === id); }

export function shapeIcon(id) {
  const shape = shapeInfo(id);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('shape-icon');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', shape?.path || '');
  path.setAttribute('fill', shape?.stroke ? 'none' : 'currentColor');
  if (shape?.stroke) { path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); }
  svg.append(path); return svg;
}

export function openShapePicker({ selected, onApply, trigger }) {
  const draft = new Set(selected);
  const el = (tag, className = '', text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
  const dialog = el('dialog', 'shape-picker'); dialog.setAttribute('aria-labelledby', 'shape-picker-title');
  const header = el('div', 'picker-header');
  const title = el('h2', '', 'Shapes'); title.id = 'shape-picker-title';
  const close = el('button', 'picker-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close shape picker');
  close.addEventListener('click', () => dialog.close()); header.append(title, close);
  const filters = el('div', 'picker-filters');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search'; search.setAttribute('aria-label', 'Search shapes');
  const category = el('select'); category.setAttribute('aria-label', 'Shape category');
  for (const name of ['All', 'Crosses', 'Stars', 'Geometric']) { const option = el('option', '', name); option.value = name; category.append(option); }
  filters.append(search, category);
  const chosen = el('div', 'picker-selected'); chosen.setAttribute('role', 'group'); chosen.setAttribute('aria-label', 'Selected shapes');
  const grid = el('div', 'picker-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Available shapes');
  const empty = el('div', 'picker-empty', 'No shapes found');
  const footer = el('div', 'picker-footer');
  const count = el('span', 'picker-count'); count.setAttribute('role', 'status');
  const cancel = el('button', '', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => dialog.close());
  const apply = el('button', 'picker-apply', 'Apply'); apply.type = 'button';
  apply.addEventListener('click', () => { onApply([...draft]); dialog.close(); });
  footer.append(count, cancel, apply);
  const updateSelection = () => {
    chosen.replaceChildren();
    for (const id of draft) {
      const chip = el('button', 'selected-shape'); chip.type = 'button';
      chip.setAttribute('aria-label', `Remove ${shapeInfo(id)?.name || id}`);
      chip.append(shapeIcon(id), el('span', '', shapeInfo(id)?.name || id), el('span', 'chip-remove', '×'));
      chip.addEventListener('click', () => { draft.delete(id); updateSelection(); }); chosen.append(chip);
    }
    chosen.hidden = draft.size === 0;
    grid.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(draft.has(button.dataset.shape))));
    count.textContent = `${draft.size} selected`; apply.disabled = draft.size === 0;
  };
  const renderGrid = () => {
    grid.replaceChildren();
    const term = search.value.trim().toLowerCase();
    for (const shape of SHAPE_CATALOG.filter(shape => (category.value === 'All' || category.value === shape.category) && `${shape.name} ${shape.category}`.toLowerCase().includes(term))) {
      const button = el('button', 'picker-symbol'); button.type = 'button'; button.dataset.shape = shape.id;
      button.setAttribute('aria-label', shape.name); button.title = shape.name;
      button.append(shapeIcon(shape.id), el('span', 'symbol-check', '✓'));
      button.addEventListener('click', () => { if (draft.has(shape.id)) draft.delete(shape.id); else draft.add(shape.id); updateSelection(); });
      grid.append(button);
    }
    empty.hidden = grid.childElementCount > 0; updateSelection();
  };
  search.addEventListener('input', renderGrid); category.addEventListener('change', renderGrid);
  // Arrow keys navigate the actual visible grid; native dialog supplies focus trapping and Escape.
  grid.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...grid.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + delta));
    event.preventDefault(); buttons[next].focus();
  });
  dialog.append(header, filters, chosen, grid, empty, footer);
  dialog.addEventListener('close', () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); }, { once: true });
  document.body.append(dialog); renderGrid(); dialog.showModal(); search.focus();
}
