import { Renderer } from '../src/engine.js';
import { dotsProject, loadPeonySource } from '../src/presets.js';

const source = await loadPeonySource();
const sourceCanvas = document.querySelector('#source');
sourceCanvas.width = source.width; sourceCanvas.height = source.height;
sourceCanvas.getContext('2d').drawImage(source, 0, 0);
const renderer = new Renderer(document.querySelector('#result'));
renderer.setSource(source);
const project = dotsProject();
function render() {
  const stats = renderer.render(project, { maxEdge: 1280 });
  document.querySelector('#status').textContent = `${stats.width} × ${stats.height} · ${stats.drawCalls} passes · ${(stats.surfaceBytes / 1048576).toFixed(1)} MB textures`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
render();
document.querySelector('#export').addEventListener('click', async () => { download(await renderer.exportPNG(project), 'peony-dots.png'); render(); });
document.querySelector('#detail').addEventListener('click', () => {
  renderer.render(project, { maxEdge: 2048, renderScale: 2, pixelBudget: 16_000_000 });
  const scale = renderer.width / renderer.referenceWidth;
  const detail = document.createElement('canvas'); detail.width = detail.height = 480;
  const ctx = detail.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(renderer.canvas, 500 * scale, 340 * scale, 120 * scale, 120 * scale, 0, 0, 480, 480);
  detail.toBlob(blob => download(blob, 'peony-dots-detail.png'), 'image/png');
  render();
});
