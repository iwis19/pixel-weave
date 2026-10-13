import { createLayer } from './model.js';

// Every part of this look is regular, editable renderer state. No flower-specific shader.
export function peonyProject(referenceWidth = 900) {
  const unit = referenceWidth / 900;
  const red = createLayer('pixel', {
    name: 'Red cells', id: 'peony-red', cellSize: 18 * unit, size: 1,
    colorMode: 'solid', color: '#ff0603', colorShading: 1, detail: 1,
    contrast: 1.3, opacity: 0.93, threshold: 0.16,
    density: 1, densityPattern: 'ordered', maskMode: 'linear', maskAngle: 55,
    maskPosition: 0.52, maskFeather: 0.64, maskEdges: 'fade',
  });
  const pale = createLayer('pixel', {
    name: 'Lilac cells', id: 'peony-lilac', cellSize: 15 * unit, size: 0.96,
    colorMode: 'solid', color: '#af7aff', colorShading: 1, detail: 1,
    opacity: 0.42, threshold: 0.5, contrast: 1.2,
    maskMode: 'linear', maskAngle: 55, maskPosition: 0.52,
    maskFeather: 0.64, maskInvert: true, density: 1, densityPattern: 'ordered',
  });
  const dots = createLayer('ascii', {
    name: 'Dot field', id: 'peony-dots', symbolMode: 'dots',
    dotRows: 4, dotAspect: 0.6, dotEdges: 0.6, dotGamma: 1,
    cellSize: 6.5 * unit, size: 0.65, opacity: 1,
    colorMode: 'gradient', color: '#ffe0c8', color2: '#dfafff',
    colorAngle: -15, colorShading: 0.4, threshold: 0.1, contrast: 1.2,
    density: 1, densityGamma: 1, brightness: 1, blend: 'screen',
  });
  const glow = createLayer('glow', {
    name: 'Dot glow', id: 'peony-glow', glowSource: dots.id,
    radius: 2.5 * unit, strength: 0.22, opacity: 0.35, threshold: 0.2,
  });
  return { version: 1, background: '#000000', sourceOpacity: 0.35, sourceTint: '#ffedda', layers: [red, pale, dots, glow] };
}

export function dotsProject(referenceWidth = 900) {
  const dots = createLayer('ascii', {
    name: 'Dots', id: 'dots', symbolMode: 'dots',
    cellSize: referenceWidth / 140, size: 0.51,
    dotRows: 4, dotAspect: 0.6, dotEdges: 0.6, dotGamma: 1,
    contrast: 1.2, threshold: 0, density: 1, densityGamma: 1,
  });
  return { version: 1, background: '#0b0b0b', sourceOpacity: 0, sourceTint: '#ffffff', layers: [dots] };
}

export async function loadPeonySource() {
  const image = new Image();
  image.src = new URL('../assets/peony-source.webp', import.meta.url).href;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  image.src = '';
  return canvas;
}
