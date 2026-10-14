// Settings are immutable strings; processed source canvases are shared between steps.
export class EditHistory {
  constructor({ limit = 80, maxBytes = 40 * 1024 * 1024, onChange = () => {} } = {}) {
    Object.assign(this, { limit, maxBytes, onChange });
    this.states = []; this.index = -1; this.group = null;
  }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index >= 0 && this.index < this.states.length - 1; }
  same(a, b) { return a?.project === b?.project && a?.source === b?.source; }

  reset(state) { this.states = [{ ...state }]; this.index = 0; this.group = null; this.onChange(); }
  begin(state) {
    this.end();
    if (this.same(this.states[this.index], state)) this.states[this.index] = { ...state };
    this.group = { start: this.index, redo: null };
  }
  end() { this.group = null; }

  record(state) {
    if (this.index < 0) { this.reset(state); return false; }
    if (this.same(this.states[this.index], state)) { this.states[this.index] = { ...state }; return false; }
    if (this.group && this.same(this.states[this.group.start], state)) {
      this.states.splice(this.group.start + 1, Infinity, ...(this.group.redo || []));
      this.index = this.group.start; this.group.redo = null;
      this.states[this.index] = { ...state }; this.onChange(); return true;
    }
    if (this.group && this.index > this.group.start) this.states[this.index] = { ...state };
    else {
      if (this.group) this.group.redo = this.states.slice(this.index + 1);
      this.states.splice(this.index + 1, Infinity, { ...state }); this.index++;
    }
    this.trim(); this.onChange(); return true;
  }

  undo() { this.end(); if (!this.canUndo) return null; this.index--; this.onChange(); return { ...this.states[this.index] }; }
  redo() { this.end(); if (!this.canRedo) return null; this.index++; this.onChange(); return { ...this.states[this.index] }; }

  attachInitialSource(source) {
    this.states = this.states.map(state => state.source ? state : { ...state, source });
    this.trim(); this.onChange();
  }

  get bytes() {
    const sources = new Set(this.states.map(state => state.source).filter(Boolean));
    return this.states.reduce((sum, state) => sum + state.project.length * 2, 0)
      + [...sources].reduce((sum, source) => sum + source.canvas.width * source.canvas.height * 4, 0);
  }

  trim() {
    while (this.states.length > 1 && (this.states.length > this.limit || this.bytes > this.maxBytes)) {
      this.states.shift(); this.index--;
      if (this.group) { this.group.start--; if (this.group.start < 0) this.group = null; }
    }
  }
}
