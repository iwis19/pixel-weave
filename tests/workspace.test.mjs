import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from '../src/edit-history.js';
import { ViewTransform, MIN_ZOOM, MAX_ZOOM } from '../src/view-transform.js';
import { CanvasView } from '../src/canvas-view.js';

const source = { canvas: { width: 100, height: 80 } };
const state = (value, image = source) => ({ project: JSON.stringify({ value }), source: image, selectedId: 'pixel' });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('undo and redo restore settings and masks without changing snapshots', () => {
  const history = new EditHistory();
  const before = { ...state(1), project: JSON.stringify({ layers: [{ selectionBits: 'before' }] }) };
  const after = { ...state(2), project: JSON.stringify({ layers: [{ selectionBits: 'after' }] }) };
  history.reset(before); history.record(after);
  const undone = history.undo(); assert.equal(undone.project, before.project);
  undone.project = 'mutated caller'; assert.equal(history.redo().project, after.project);
  assert.equal(history.undo().project, before.project);
});
test('a continuous slider drag or stroke is one undo step', () => {
  const history = new EditHistory(); history.reset(state(0)); history.begin(state(0));
  for (let value = 1; value <= 50; value++) history.record(state(value));
  history.end(); assert.equal(history.states.length, 2);
  assert.equal(history.undo().project, state(0).project); assert.equal(history.redo().project, state(50).project);
});
test('separate gestures remain separate steps and a new edit clears redo', () => {
  const history = new EditHistory(); history.reset(state(0));
  history.begin(state(0)); history.record(state(1)); history.end();
  history.begin(state(1)); history.record(state(2)); history.end();
  assert.equal(history.undo().project, state(1).project);
  history.record(state(3)); assert.equal(history.canRedo, false);
  assert.equal(history.undo().project, state(1).project);
});
test('cancelled edits restore their baseline and retain the previous redo branch', () => {
  const history = new EditHistory(); history.reset(state(0)); history.record(state(1)); history.undo();
  history.begin(state(0)); history.record(state(2)); history.record(state(0)); history.end();
  assert.equal(history.canUndo, false); assert.equal(history.redo().project, state(1).project);
});
test('view and selection metadata do not create content history entries', () => {
  const history = new EditHistory(); history.reset(state(0));
  history.record({ ...state(0), selectedId: 'another' }); assert.equal(history.canUndo, false);
  history.record(state(1)); assert.equal(history.undo().selectedId, 'another');
});
test('source replacement restores the matching image and counts it only once per history', () => {
  const history = new EditHistory(); history.reset(state(0)); history.record(state(1));
  const other = { canvas: { width: 100, height: 80 } }; history.record(state(2, other));
  assert.equal(history.undo().source, source); assert.equal(history.redo().source, other);
  assert.equal(history.bytes, 2 * 100 * 80 * 4 + history.states.reduce((sum, entry) => sum + entry.project.length * 2, 0));
});
test('history drops old entries when its step or memory budget is reached', () => {
  const history = new EditHistory({ limit: 3 }); history.reset(state(0));
  for (let value = 1; value <= 10; value++) history.record(state(value));
  assert.equal(history.states.length, 3); history.undo(); assert.equal(history.undo().project, state(8).project);
  assert.equal(history.canUndo, false);
  const bounded = new EditHistory({ maxBytes: 40_000 }); bounded.reset(state(0));
  bounded.record(state(1, { canvas: { width: 100, height: 80 } }));
  assert.equal(bounded.states.length, 1); assert.ok(bounded.bytes < 40_000);
});
test('loading another project clears history and initial image loading retains earlier edits', () => {
  const history = new EditHistory(); history.reset(state(0, null)); history.record(state(1, null));
  history.attachInitialSource(source); assert.equal(history.undo().source, source);
  history.reset(state(9)); assert.equal(history.canUndo, false); assert.equal(history.canRedo, false);
});
test('fit centers the complete image and follows panel resizes', () => {
  const view = new ViewTransform(); view.resize(450, 500, 900, 720);
  close(view.scale, .5); close(view.x, 0); close(view.y, 0);
  view.resize(360, 500); close(view.scale, .4);
});
test('zoom preserves the image point under the cursor', () => {
  const view = new ViewTransform(); view.resize(450, 500, 900, 720);
  const x = 300, y = 180;
  const before = [(x - view.width / 2 - view.x) / view.scale, (y - view.height / 2 - view.y) / view.scale];
  view.zoom(1, x, y);
  close((x - view.width / 2 - view.x) / view.scale, before[0]);
  close((y - view.height / 2 - view.y) / view.scale, before[1]);
});
test('pan and zoom are bounded and Fit restores the centered view', () => {
  const view = new ViewTransform(); view.resize(450, 500, 900, 720); view.zoom(1); view.pan(90, -40);
  close(view.x, 90); close(view.y, -40); view.resize(500, 500); close(view.scale, 1);
  view.pan(1e6, 1e6); assert.ok(view.x < 700 && view.y < 650);
  view.zoom(1e6); close(view.scale, MAX_ZOOM); view.zoom(0); close(view.scale, MIN_ZOOM);
  view.fit(); close(view.scale, 500 / 900); close(view.x, 0); close(view.y, 0);
});
test('100% is reference-image size regardless of viewport dimensions', () => {
  const view = new ViewTransform(); view.resize(300, 200, 900, 720); view.actual();
  close(view.scale, 1); close(view.x, 0); view.resize(450, 300); close(view.scale, 1);
});

function canvasFixture() {
  class Target {
    constructor(kind = 'button') { this.kind = kind; this.handlers = new Map(); this.style = {}; this.clientWidth = 450; this.clientHeight = 500; this.captures = new Set(); this.classList = { toggle() {} }; }
    addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
    removeEventListener(type, fn) { this.handlers.set(type, (this.handlers.get(type) || []).filter(value => value !== fn)); }
    contains(target) { return target === this || target.parent === this; }
    matches(selector) { return this.kind === 'text' && selector === 'input, textarea, select'; }
    setAttribute() {}
    focus() {}
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
    querySelector() { return null; }
    send(type, values = {}) {
      const event = { target: this, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...values };
      for (const fn of this.handlers.get(type) || []) fn(event);
      return event;
    }
  }
  const previous = Object.fromEntries(['document', 'window', 'ResizeObserver', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const doc = new Target('document'), win = new Target('window'); doc.body = new Target('body');
  Object.assign(globalThis, { document: doc, window: win, ResizeObserver: class { observe() {} disconnect() {} }, getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' }) });
  const viewport = new Target('viewport'), surface = new Target(), paint = new Target(); paint.parent = viewport;
  const controls = Object.fromEntries(['toolbar', 'out', 'in', 'level', 'fit', 'hand'].map(key => [key, new Target()]));
  const view = new CanvasView({ viewport, surface, controls, getDrawing: () => true }); view.setImageSize(900, 720);
  return { doc, viewport, paint, view, button: new Target(), text: new Target('text'), dispose() { view.dispose(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

test('Space-drag pans while drawing is enabled, including after focusing an inspector button', () => {
  const f = canvasFixture();
  try {
    f.doc.send('keydown', { target: f.button, key: ' ', code: 'Space' });
    const down = f.viewport.send('pointerdown', { target: f.paint, button: 0, pointerId: 1, clientX: 200, clientY: 200 });
    assert.equal(down.prevented, true); assert.equal(down.stopped, true, 'Pointer must not reach the brush');
    f.viewport.send('pointermove', { pointerId: 1, clientX: 280, clientY: 240 });
    close(f.view.transform.x, 80); close(f.view.transform.y, 40);
    f.viewport.send('pointerup', { pointerId: 1 });
    assert.equal(f.doc.send('keyup', { target: f.viewport, key: ' ', code: 'Space' }).prevented, true);
    assert.equal(f.view.space, false);
  } finally { f.dispose(); }
});
test('Space in a text field does not switch the canvas to pan', () => {
  const f = canvasFixture();
  try {
    assert.equal(f.doc.send('keydown', { target: f.text, key: ' ', code: 'Space' }).prevented, false);
    assert.equal(f.view.space, false);
  } finally { f.dispose(); }
});
test('Space still activates ordinary buttons when no canvas gesture follows', () => {
  const f = canvasFixture();
  try {
    assert.equal(f.doc.send('keydown', { target: f.button, key: ' ', code: 'Space' }).prevented, false);
    assert.equal(f.doc.send('keyup', { target: f.button, key: ' ', code: 'Space' }).prevented, false);
    assert.equal(f.view.space, false);
  } finally { f.dispose(); }
});
