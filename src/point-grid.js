import { decodeSelection, selectionAt } from './selection.js';

const rand = (x, y, seed) => { const v = Math.sin(x * 127.1 + y * 311.7 + seed * 19.19) * 43758.5453; return v - Math.floor(v); };
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = rand(ix, iy, seed) * (1 - fx) + rand(ix + 1, iy, seed) * fx;
  const b = rand(ix, iy + 1, seed) * (1 - fx) + rand(ix + 1, iy + 1, seed) * fx;
  return a * (1 - fy) + b * fy;
}

export function buildPointGrid(layer, width, height, source) {
  // A bounded reference-space map keeps preview/export identical and avoids per-pixel sorting.
  const cell = Math.max(layer.cellSize, width / (510 * layer.scale), height / (510 * layer.scale));
  const left = (-width / 2 - layer.offsetX) / layer.scale + width / 2;
  const top = (-height / 2 - layer.offsetY) / layer.scale + height / 2;
  const origin = [Math.floor(left / cell), Math.floor(top / cell)];
  const columns = Math.ceil((width / layer.scale + left) / cell) - origin[0];
  const rows = Math.ceil((height / layer.scale + top) / cell) - origin[1];
  const data = new Uint8Array(columns * rows), candidates = [];
  const mask = layer.selectionActive ? decodeSelection(layer.selectionBits) : null;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const gx = origin[0] + x, gy = origin[1] + y;
    const cx = (gx + .5) * cell, cy = (gy + .5) * cell;
    const wx = (cx - width / 2) * layer.scale + width / 2 + layer.offsetX;
    const wy = (cy - height / 2) * layer.scale + height / 2 + layer.offsetY;
    if (wx < 0 || wy < 0 || wx >= width || wy >= height) continue;
    let alpha;
    if (mask) alpha = selectionAt(mask, wx / width, wy / height);
    else {
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      const i = (Math.min(source.height - 1, Math.floor(cy / height * source.height)) * source.width + Math.min(source.width - 1, Math.floor(cx / width * source.width))) * 4;
      const light = (source.data[i] * .2126 + source.data[i + 1] * .7152 + source.data[i + 2] * .0722) / 255;
      alpha = source.data[i + 3] / 255 * (.5 + .5 * light);
    }
    if (alpha < .04) continue;
    const rank = rand(gx, gy, layer.seed) * (1 - layer.clumping) + noise(cx / 72, cy / 72, layer.seed + 41) * layer.clumping;
    candidates.push({ index: y * columns + x, alpha, rank });
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const count = Math.round(candidates.length * layer.density);
  for (let i = 0; i < count; i++) data[candidates[i].index] = Math.round(candidates[i].alpha * 255);
  return { width: columns, height: rows, origin, cell, data, count, eligible: candidates.length };
}
