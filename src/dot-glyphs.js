// A tone ramp of dot clusters, with alternative arrangements that follow edges.
// Masks and compact shape descriptors are cached; dots themselves stay analytic.
export function buildDotGlyphs(rows = 4, aspect = 0.6) {
  const height = Math.max(2, Math.min(8, Math.round(rows)));
  const width = Math.max(1, Math.min(8, Math.round(height * aspect)));
  const count = width * height;
  const levels = count + 1;
  const cells = Array.from({ length: count }, (_, i) => ({
    i, x: i % width, y: Math.floor(i / width),
  }));
  const spread = ({ x, y }) => {
    let rank = 0;
    for (let bit = 0; bit < 3; bit++) {
      const xb = (x >> bit) & 1, yb = (y >> bit) & 1;
      rank += ((xb ^ yb) * 2 + yb) * 4 ** (2 - bit);
    }
    return rank;
  };
  const directions = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const maskWidth = width * levels, maskHeight = height * directions.length;
  const masks = new Uint8Array(maskWidth * maskHeight);
  const profileWidth = levels * 3;
  const profiles = new Uint8Array(profileWidth * directions.length * 4);
  const bin = dot => Math.min(2, Math.floor((dot.y + 0.5) / height * 3)) * 3 + Math.min(2, Math.floor((dot.x + 0.5) / width * 3));
  const population = new Float32Array(9);
  for (const dot of cells) population[bin(dot)]++;
  directions.forEach(([dx, dy], order) => {
    const sorted = [...cells].sort((a, b) => {
      const projection = dot => dx * (dot.x + 0.5) / width + dy * (dot.y + 0.5) / height;
      return projection(b) - projection(a) || spread(a) - spread(b);
    });
    const occupied = new Float32Array(9);
    for (let filled = 0; filled <= count; filled++) {
      if (filled) occupied[bin(sorted[filled - 1])]++;
      for (let j = 0; j < filled; j++) {
        const dot = sorted[j];
        masks[(order * height + dot.y) * maskWidth + filled * width + dot.x] = 255;
      }
      const vector = Array.from(occupied, (value, k) => (value - population[k] * filled / count) / count);
      const norm = Math.hypot(...vector);
      for (let part = 0; part < 3; part++) {
        const offset = (order * profileWidth + filled * 3 + part) * 4;
        for (let ch = 0; ch < 3; ch++) profiles[offset + ch] = Math.round((norm ? vector[part * 3 + ch] / norm * 0.5 + 0.5 : 0.5) * 255);
        profiles[offset + 3] = Math.round(Math.min(1, norm) * 255);
      }
    }
  });
  return { width, height, count, levels, masks, maskWidth, maskHeight, profiles, profileWidth, profileHeight: directions.length };
}
