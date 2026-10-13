import { createLayer } from './model.js';

// Every part of this look is regular, editable renderer state. No flower-specific shader.
export function peonyProject(referenceWidth = 900) {
  const unit = referenceWidth / 900;
  const red = createLayer('squares', {
    name: 'Red cells', id: 'peony-red', cellSize: 18 * unit, size: 1,
    colorMode: 'solid', color: '#ff0603', colorShading: 1, detail: 1,
    contrast: 1.3, opacity: 0.93, threshold: 0.16,
    density: 1, densityPattern: 'ordered', maskMode: 'linear', maskAngle: 55,
    maskPosition: 0.52, maskFeather: 0.64, maskEdges: 'fade',
  });
  const pale = createLayer('squares', {
    name: 'Lilac cells', id: 'peony-lilac', cellSize: 15 * unit, size: 0.96,
    colorMode: 'solid', color: '#af7aff', colorShading: 1, detail: 1,
    opacity: 0.42, threshold: 0.5, contrast: 1.2,
    maskMode: 'linear', maskAngle: 55, maskPosition: 0.52,
    maskFeather: 0.64, maskInvert: true, density: 1, densityPattern: 'ordered',
  });
  const dots = createLayer('pixel', {
    name: 'Pixel field', id: 'peony-dots', pixelShape: 'dot',
    cellSize: 6.5 * unit, dotDiameter: 2.5, clumping: .48, opacity: 1,
    colorMode: 'gradient', color: '#ffe0c8', color2: '#dfafff',
    colorAngle: -15, colorShading: 0.4, threshold: 0.1, contrast: 1.2,
    density: .9, densityGamma: 1, brightness: 1, blend: 'screen',
    glowEnabled: true, radius: 2.5 * unit, strength: 0.22, glowOpacity: 0.35,
  });
  return { version: 1, background: '#000000', sourceOpacity: 0.35, sourceTint: '#ffedda', layers: [red, pale, dots] };
}

export function dotsProject(referenceWidth = 900) {
  const dots = createLayer('pixel', {
    name: 'Pixels', id: 'dots', pixelShape: 'dot',
    cellSize: Math.max(6, referenceWidth / 100), dotDiameter: 3.25,
    colorMode: 'solid', color: '#eddbff', threshold: 0, density: 0.6, clumping: 0.48,
  });
  return { version: 1, background: '#08090c', sourceOpacity: 0.55, sourceTint: '#ffffff', layers: [dots] };
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
