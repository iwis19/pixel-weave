import { Renderer } from '../src/engine.js';
import { peonyProject, loadPeonySource } from '../src/presets.js';

const source = new URLSearchParams(location.search).has('prepare') ? await (await import('./source-preparation.js')).preparePeonySource() : await loadPeonySource();
const sourceCanvas = document.querySelector('#source');
sourceCanvas.width = source.width; sourceCanvas.height = source.height;
sourceCanvas.getContext('2d').drawImage(source, 0, 0);
const renderer = new Renderer(document.querySelector('#result'));
renderer.setSource(source);
const project = peonyProject();
function render() {
  const stats = renderer.render(project, { maxEdge: 1280 });
  document.querySelector('#status').textContent = `${stats.width} × ${stats.height} · ${stats.drawCalls} passes · ${(stats.surfaceBytes / 1048576).toFixed(1)} MB textures`;
}
render();
document.querySelector('#export-source').addEventListener('click', () => {
  source.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'peony-source.webp'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/webp', 0.94);
});
document.querySelector('#export').addEventListener('click', async () => {
  const blob = await renderer.exportPNG(project);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'peony-recreation.png'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); render();
});
document.querySelector('#export-detail').addEventListener('click', () => {
  // Re-render the same analytic circles at 2x resolution; the photo texture stays unchanged.
  renderer.render(project, { maxEdge: 2048, renderScale: 2, pixelBudget: 16_000_000 });
  const scale = renderer.width / renderer.referenceWidth;
  const detail = document.createElement('canvas'); detail.width = detail.height = 480;
  const ctx = detail.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(renderer.canvas, 520 * scale, 285 * scale, 120 * scale, 120 * scale, 0, 0, 480, 480);
  detail.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'peony-dot-detail.png'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
  render();
});
