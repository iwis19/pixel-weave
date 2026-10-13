// A small procedural reference image keeps the first run useful without a network request.
export function makeSample() {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1050;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 81;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const stem = ctx.createLinearGradient(360, 650, 480, 1040);
  stem.addColorStop(0, '#233e83'); stem.addColorStop(1, '#070b14');
  ctx.strokeStyle = stem; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(446, 563); ctx.bezierCurveTo(398, 722, 530, 772, 461, 1090); ctx.stroke();
  ctx.save(); ctx.translate(485, 801); ctx.rotate(-0.7);
  const leaf = ctx.createLinearGradient(0, 0, 135, 0); leaf.addColorStop(0, '#172653'); leaf.addColorStop(0.5, '#316d9e'); leaf.addColorStop(1, '#0c1227');
  ctx.fillStyle = leaf;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(15, -55, 110, -59, 155, -10); ctx.bezierCurveTo(103, 35, 31, 39, 0, 0); ctx.fill(); ctx.restore();
  for (let ring = 0; ring < 6; ring++) {
    const count = 15 + ring * 3;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + ring * 0.41;
      const distance = 168 - ring * 24;
      ctx.save();
      ctx.translate(450 + Math.cos(angle) * distance, 430 + Math.sin(angle) * distance * 0.83);
      ctx.rotate(angle + Math.PI / 2 + (random() - 0.5) * 0.35);
      const w = 57 - ring * 5 + random() * 13;
      const h = 118 - ring * 9 + random() * 19;
      const gradient = ctx.createLinearGradient(-w / 2, h / 2, w / 3, -h / 2);
      gradient.addColorStop(0, '#081a55');
      gradient.addColorStop(0.35, ring % 2 ? '#2543c5' : '#1361ba');
      gradient.addColorStop(0.72, ring % 2 ? '#5887ed' : '#28b6d5');
      gradient.addColorStop(1, '#d1f3fa');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.moveTo(0, h * 0.52);
      ctx.bezierCurveTo(-w, h * 0.08, -w * 0.68, -h * 0.37, 0, -h * 0.52);
      ctx.bezierCurveTo(w * 0.61, -h * 0.25, w * 0.65, h * 0.13, 0, h * 0.52);
      ctx.fill();
      ctx.strokeStyle = 'rgba(128,207,255,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, h * 0.44); ctx.quadraticCurveTo(w * 0.17, 0, 0, -h * 0.42); ctx.stroke();
      ctx.restore();
    }
  }
  return canvas;
}
