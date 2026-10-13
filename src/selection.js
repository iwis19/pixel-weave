export const MASK_WIDTH = 160;
export const MASK_HEIGHT = 128;
export const MASK_BYTES = MASK_WIDTH * MASK_HEIGHT / 8;

export function decodeSelection(bits = '') {
  const mask = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  if (!bits) return mask;
  try {
    const bytes = atob(bits);
    if (bytes.length !== MASK_BYTES) return mask;
    for (let i = 0; i < mask.length; i++) mask[i] = (bytes.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch { /* Invalid imported masks become empty. */ }
  return mask;
}

export function encodeSelection(mask) {
  const bytes = new Uint8Array(MASK_BYTES);
  for (let i = 0; i < mask.length; i++) if (mask[i]) bytes[i >> 3] |= 1 << (i & 7);
  return btoa(String.fromCharCode(...bytes));
}

export function paintSelection(mask, x, y, diameter, width, height, erase = false) {
  const cx = x * MASK_WIDTH, cy = y * MASK_HEIGHT;
  const rx = diameter / width * MASK_WIDTH / 2, ry = diameter / height * MASK_HEIGHT / 2;
  for (let my = Math.max(0, Math.floor(cy - ry)); my < Math.min(MASK_HEIGHT, Math.ceil(cy + ry)); my++) {
    for (let mx = Math.max(0, Math.floor(cx - rx)); mx < Math.min(MASK_WIDTH, Math.ceil(cx + rx)); mx++) {
      if (((mx + .5 - cx) / rx) ** 2 + ((my + .5 - cy) / ry) ** 2 <= 1) mask[my * MASK_WIDTH + mx] = erase ? 0 : 1;
    }
  }
}

export function selectionAt(mask, x, y) {
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return 0;
  const px = x * MASK_WIDTH - .5, py = y * MASK_HEIGHT - .5;
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const value = (a, b) => mask[Math.max(0, Math.min(MASK_HEIGHT - 1, b)) * MASK_WIDTH + Math.max(0, Math.min(MASK_WIDTH - 1, a))];
  return (value(ix, iy) * (1 - fx) + value(ix + 1, iy) * fx) * (1 - fy) + (value(ix, iy + 1) * (1 - fx) + value(ix + 1, iy + 1) * fx) * fy;
}
