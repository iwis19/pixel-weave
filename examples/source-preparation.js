export async function preparePeonySource() {
  const image = new Image();
  image.src = new URL('../assets/peony-natalia.jpg', import.meta.url).href;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 720;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Crop the white flower from the two-flower original; retain the natural petal colors.
  ctx.drawImage(image, 460, 970, 980, 950, 70, 70, 760, 736);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const smooth = (lo, hi, value) => { const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pixels.data.length; i += 4) {
    const r = pixels.data[i] / 255, g = pixels.data[i + 1] / 255, b = pixels.data[i + 2] / 255;
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    // One-time neutral-petal extraction excludes the neighboring magenta flower and dark foliage.
    const neutral = smooth(0.5, 0.78, low / Math.max(high, 0.001));
    const light = smooth(0.065, 0.19, (r + g + b) / 3);
    const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width);
    const region = 1.0 - smooth(1.0, 1.07, Math.hypot((x - 510) / 430, (y - 470) / 395));
    pixels.data[i + 3] *= neutral * light * region;
  }
  // Keep the connected neutral bloom around the crop center, excluding disconnected highlights.
  const count = canvas.width * canvas.height;
  const connected = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let start = -1, distance = Infinity;
  for (let index = 0; index < count; index++) {
    if (pixels.data[index * 4 + 3] < 150) continue;
    const candidate = ((index % canvas.width) - 470) ** 2 + (Math.floor(index / canvas.width) - 430) ** 2;
    if (candidate < distance) { start = index; distance = candidate; }
  }
  if (start < 0) throw new Error('Could not extract the sample flower.');
  let head = 0, tail = 1;
  queue[0] = start; connected[start] = 1;
  while (head < tail) {
    const index = queue[head++];
    const x = index % canvas.width, y = Math.floor(index / canvas.width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= canvas.width || y + dy < 0 || y + dy >= canvas.height) continue;
      const next = (y + dy) * canvas.width + x + dx;
      if (!connected[next] && pixels.data[next * 4 + 3] >= 150) {
        connected[next] = 1; queue[tail++] = next;
      }
    }
  }
  for (let index = 0; index < count; index++) {
    if (connected[index]) continue;
    const x = index % canvas.width, y = Math.floor(index / canvas.width);
    let fringe = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < canvas.width && y + dy >= 0 && y + dy < canvas.height && connected[(y + dy) * canvas.width + x + dx]) fringe = true;
    }
    if (!fringe) pixels.data[index * 4 + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  image.src = '';
  return canvas;
}
