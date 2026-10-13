import * as shaders from './shaders.js';
import { BLENDS, MAX_LAYERS, SHAPES, fitDimensions, hexRGB, symbolsFor } from './model.js';
import { buildDotGlyphs } from './dot-glyphs.js';
import { buildPointGrid } from './point-grid.js';

const GLYPH_SIZE = 32;
const SOURCE_EDGE = 2048;
const MAX_WORKING_PIXELS = 8_000_000;

export class Renderer {
  constructor(canvas, { onError = () => {}, onRestore = () => {} } = {}) {
    this.canvas = canvas;
    this.onError = onError;
    this.onRestore = onRestore;
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!this.gl) throw new Error('WebGL 2 is required. Enable hardware acceleration or try a compatible browser.');
    this.sourceCanvas = null;
    this.width = 0;
    this.height = 0;
    this.atlases = new Map();
    this.dotAtlases = new Map();
    this.pointMaps = new Map();
    this.sourceRevision = 0;
    this.dotMap = null;
    this.targets = [];
    this.disposed = false;
    this.lost = false;
    this.handleLost = event => { event.preventDefault(); this.lost = true; this.onError('Graphics paused. Waiting for the browser to restore the renderer.'); };
    this.handleRestore = () => {
      this.lost = false;
      this.width = this.height = 0;
      this.targets = [];
      this.atlases.clear();
      this.dotAtlases.clear();
      this.pointMaps.clear();
      this.dotMap = null;
      this.initialize();
      if (this.sourceCanvas) this.uploadSource();
      this.onRestore();
    };
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestore);
    this.initialize();
  }

  initialize() {
    const gl = this.gl;
    this.programs = Object.fromEntries(['drawing', 'dotAnalysis', 'dotDrawing', 'pointDrawing', 'extractGlow', 'blur', 'composite', 'base', 'copy'].map(name => [name, this.makeProgram(shaders[name])]));
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.source = this.makeTexture();
    this.empty = this.makeTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.empty);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  makeProgram(fragment) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed: ${info}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, shaders.vertex);
    const pixel = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, pixel);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(pixel);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = new Map();
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms.set(info.name, { location: gl.getUniformLocation(program, info.name), type: info.type });
    }
    return { program, uniforms };
  }

  makeTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  makeTarget(width, height) {
    const gl = this.gl;
    const texture = this.makeTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Unable to allocate rendering surface. Lower the preview resolution.');
    const target = { texture, framebuffer, width, height };
    this.targets.push(target);
    return target;
  }

  releaseTargets() {
    for (const target of this.targets) {
      this.gl.deleteTexture(target.texture);
      this.gl.deleteFramebuffer(target.framebuffer);
    }
    this.targets = [];
    this.dotMap = null;
  }

  setSource(image, { referenceWidth, referenceHeight } = {}) {
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) throw new Error('The reference image has invalid dimensions.');
    const { width, height } = fitDimensions(image.width, image.height, SOURCE_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    this.sourceCanvas = canvas;
    this.referenceWidth = referenceWidth ?? width;
    this.referenceHeight = referenceHeight ?? height;
    const sampling = document.createElement('canvas');
    const sampleSize = fitDimensions(width, height, 512);
    sampling.width = sampleSize.width; sampling.height = sampleSize.height;
    const sampleContext = sampling.getContext('2d');
    sampleContext.drawImage(canvas, 0, 0, sampling.width, sampling.height);
    this.sourcePixels = sampleContext.getImageData(0, 0, sampling.width, sampling.height);
    this.sourceRevision++;
    if (!this.lost) this.uploadSource();
  }

  uploadSource() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.releaseTargets();
    this.width = this.canvas.width = width;
    this.height = this.canvas.height = height;
    this.accum = [this.makeTarget(width, height), this.makeTarget(width, height)];
    this.layerTarget = this.makeTarget(width, height);
    // Reused lower-resolution bloom buffers, independent of the number of layers.
    const bw = Math.max(1, Math.ceil(width / 2));
    const bh = Math.max(1, Math.ceil(height / 2));
    this.bloom = [this.makeTarget(bw, bh), this.makeTarget(bw, bh)];
  }

  atlasFor(layer) {
    const symbols = symbolsFor(layer);
    const key = JSON.stringify([layer.symbolMode, symbols]);
    const cached = this.atlases.get(layer.id);
    if (cached?.key === key) return cached;
    if (cached) this.gl.deleteTexture(cached.texture);
    const canvas = document.createElement('canvas');
    canvas.width = GLYPH_SIZE * Math.max(1, symbols.length);
    canvas.height = GLYPH_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.font = '26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    symbols.forEach((symbol, i) => {
      ctx.save();
      ctx.translate(i * GLYPH_SIZE + GLYPH_SIZE / 2, GLYPH_SIZE / 2);
      if (layer.symbolMode === 'text') ctx.fillText(symbol, 0, 1, 28);
      else { ctx.scale(2 / 3, 2 / 3); ctx.lineWidth = 3; this.drawShape(ctx, symbol); }
      ctx.restore();
    });
    const gl = this.gl;
    const texture = this.makeTexture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const atlas = { key, texture, count: symbols.length };
    this.atlases.set(layer.id, atlas);
    return atlas;
  }

  drawShape(ctx, shape) {
    if (shape === 'square') ctx.fillRect(-17, -17, 34, 34);
    else if (shape === 'box') ctx.strokeRect(-16, -16, 32, 32);
    else if (shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); }
    else if (shape === 'diamond') { ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(18, 0); ctx.lineTo(0, 18); ctx.lineTo(-18, 0); ctx.closePath(); ctx.stroke(); }
    else if (shape === 'cross') { ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.moveTo(0, -16); ctx.lineTo(0, 16); ctx.stroke(); }
    else if (shape === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 - Math.PI / 2;
        const radius = i % 2 ? 5 : 20;
        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    }
  }

  dotAtlasFor(layer) {
    const key = `${layer.dotRows}:${layer.dotAspect}`;
    const cached = this.dotAtlases.get(layer.id);
    if (cached?.key === key) return cached;
    if (cached) { this.gl.deleteTexture(cached.texture); this.gl.deleteTexture(cached.profiles); }
    const table = buildDotGlyphs(layer.dotRows, layer.dotAspect);
    const gl = this.gl;
    const texture = this.makeTexture(), profiles = this.makeTexture();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, table.maskWidth, table.maskHeight, 0, gl.RED, gl.UNSIGNED_BYTE, table.masks);
    gl.bindTexture(gl.TEXTURE_2D, profiles);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, table.profileWidth, table.profileHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, table.profiles);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    const atlas = { key, texture, profiles, grid: [table.width, table.height], bytes: table.masks.byteLength + table.profiles.byteLength };
    this.dotAtlases.set(layer.id, atlas);
    return atlas;
  }

  drawDots(layer) {
    const atlas = this.dotAtlasFor(layer);
    // Cap the analysis grid in reference coordinates so preview/export keep the same glyphs.
    const cell = Math.max(layer.cellSize, this.referenceWidth / 512, this.referenceHeight * layer.dotAspect / 512);
    const referenceScale = this.width / this.referenceWidth;
    const cellSize = [cell * referenceScale, cell / layer.dotAspect * referenceScale];
    const columns = Math.ceil(this.referenceWidth / cell), rows = Math.ceil(this.referenceHeight * layer.dotAspect / cell);
    if (!this.dotMap || this.dotMap.width < columns * 2 || this.dotMap.height < rows) {
      const width = Math.max(columns * 2, this.dotMap?.width || 0), height = Math.max(rows, this.dotMap?.height || 0);
      if (this.dotMap) {
        this.gl.deleteTexture(this.dotMap.texture); this.gl.deleteFramebuffer(this.dotMap.framebuffer);
        this.targets = this.targets.filter(target => target !== this.dotMap);
      }
      this.dotMap = this.makeTarget(width, height);
    }
    const settings = { ...this.uniforms(layer), uDotCell: cellSize, uDotGrid: atlas.grid, uMaskScatter: layer.maskEdges === 'scatter' ? 1 : 0 };
    this.pass('dotAnalysis', this.dotMap, {
      ...settings, uDotEdges: layer.dotEdges, uDotGamma: layer.dotGamma,
      uInvert: layer.invert ? 1 : 0,
    }, { uSource: this.source, uProfiles: atlas.profiles });
    this.pass('dotDrawing', this.layerTarget, settings, { uDotMap: this.dotMap.texture, uDotMasks: atlas.texture });
    return this.layerTarget.texture;
  }

  drawPoints(layer) {
    const key = JSON.stringify([this.sourceRevision, this.referenceWidth, this.referenceHeight, layer.cellSize, layer.scale, layer.offsetX, layer.offsetY, layer.density, layer.clumping, layer.seed, layer.selectionActive, layer.selectionBits]);
    let map = this.pointMaps.get(layer.id);
    if (map?.key !== key) {
      const grid = buildPointGrid(layer, this.referenceWidth, this.referenceHeight, this.sourcePixels);
      const texture = map?.texture || this.makeTexture();
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, grid.width, grid.height, 0, gl.RED, gl.UNSIGNED_BYTE, grid.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      map = { ...grid, texture, key };
      this.pointMaps.set(layer.id, map);
    }
    this.pass('pointDrawing', this.layerTarget, { ...this.uniforms(layer), uPointOrigin: map.origin, uPointCell: map.cell, uDotDiameter: layer.dotDiameter }, { uSource: this.source, uPointMap: map.texture });
    return this.layerTarget.texture;
  }

  pass(name, target, values = {}, textures = {}) {
    const gl = this.gl;
    const { program, uniforms } = this.programs[name];
    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0, 0, target?.width ?? this.width, target?.height ?? this.height);
    let unit = 0;
    for (const [key, texture] of Object.entries(textures)) {
      const uniform = uniforms.get(key);
      if (!uniform) continue;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform.location, unit++);
    }
    for (const [key, value] of Object.entries(values)) {
      const uniform = uniforms.get(key);
      if (!uniform) continue;
      if (uniform.type === gl.INT || uniform.type === gl.BOOL) {
        if (Array.isArray(value)) gl.uniform1iv(uniform.location, value); else gl.uniform1i(uniform.location, value);
      }
      else if (uniform.type === gl.FLOAT_VEC2) gl.uniform2fv(uniform.location, value);
      else if (uniform.type === gl.FLOAT_VEC3) gl.uniform3fv(uniform.location, value);
      else gl.uniform1f(uniform.location, value);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.drawCalls++;
  }

  uniforms(layer) {
    const referenceScale = this.width / this.referenceWidth;
    return {
      uResolution: [this.width, this.height], uReferenceScale: referenceScale,
      uOffset: [layer.offsetX * referenceScale, -layer.offsetY * referenceScale],
      uScale: layer.scale, uCellSize: layer.cellSize, uSize: layer.size,
      uBrightness: layer.brightness, uContrast: layer.contrast, uThreshold: layer.threshold,
      uCeiling: layer.ceiling, uDensity: layer.density, uSeed: layer.seed,
      uDensityShading: layer.densityShading, uDensityGamma: layer.densityGamma,
      uDensityPattern: layer.densityPattern === 'ordered' ? 1 : 0, uToneSize: layer.toneSize, uDetail: layer.detail,
      uColorMode: ['source', 'tint', 'solid', 'gradient'].indexOf(layer.colorMode), uColor: hexRGB(layer.color),
      uColor2: hexRGB(layer.color2), uColorAngle: layer.colorAngle * Math.PI / 180, uColorShading: layer.colorShading,
      uMaskMode: ['none', 'linear', 'radial'].indexOf(layer.maskMode), uMaskAngle: layer.maskAngle * Math.PI / 180,
      uMaskPosition: layer.maskPosition, uMaskFeather: layer.maskFeather, uMaskCenter: [layer.maskX, layer.maskY],
      uMaskRadius: layer.maskRadius, uMaskInvert: layer.maskInvert ? 1 : 0,
    };
  }

  drawLayer(layer) {
    if (layer.type === 'ascii' && layer.symbolMode === 'points') return this.drawPoints(layer);
    if (layer.type === 'ascii' && layer.symbolMode === 'dots') return this.drawDots(layer);
    const shapes = layer.type === 'ascii' && layer.symbolMode === 'shapes';
    const symbols = shapes ? symbolsFor(layer) : [];
    const atlas = layer.type === 'ascii' && !shapes ? this.atlasFor(layer) : { texture: this.empty, count: symbols.length };
    this.pass('drawing', this.layerTarget, {
      ...this.uniforms(layer), uType: layer.type === 'pixel' ? 1 : 0,
      uPixelShape: ['square', 'dot', 'box'].indexOf(layer.pixelShape),
      uSymbolCount: atlas.count, uMapping: layer.mapping === 'random' ? 1 : 0, uInvert: layer.invert ? 1 : 0,
      uShapes: shapes ? 1 : 0, 'uShapeIds[0]': Array.from({ length: 6 }, (_, index) => SHAPES.indexOf(symbols[index] || 'dot')),
      uStroke: layer.stroke, uMaskScatter: layer.maskEdges === 'scatter' ? 1 : 0,
    }, { uSource: this.source, uAtlas: atlas.texture });
    return this.layerTarget.texture;
  }

  drawGlow(layer, source) {
    this.pass('extractGlow', this.bloom[0], { ...this.uniforms(layer), uBox: layer.glowStyle === 'box' ? 1 : 0 }, { uSource: source });
    const radius = layer.radius * this.width / this.referenceWidth;
    const values = { uRadius: radius, uBox: layer.glowStyle === 'box' ? 1 : 0 };
    this.pass('blur', this.bloom[1], { ...values, uDirection: [1 / this.width, 0] }, { uInput: this.bloom[0].texture });
    this.pass('blur', this.bloom[0], { ...values, uDirection: [0, 1 / this.height] }, { uInput: this.bloom[1].texture });
    return this.bloom[0].texture;
  }

  render(project, { maxEdge = 1280, original = false, pixelBudget = MAX_WORKING_PIXELS, renderScale = 1 } = {}) {
    if (!this.sourceCanvas || this.lost || this.disposed) return null;
    const start = performance.now();
    const supersample = Math.max(1, Math.min(3, Number(renderScale) || 1));
    const requested = fitDimensions(this.referenceWidth * supersample, this.referenceHeight * supersample, Math.min(maxEdge, 4096, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)));
    // Five reusable surfaces total 3.5 full-resolution equivalents; enforce a fixed pixel budget.
    const budgetScale = Math.min(1, Math.sqrt(pixelBudget / (requested.width * requested.height * 3.5)));
    const width = Math.max(1, Math.round(requested.width * budgetScale));
    const height = Math.max(1, Math.round(requested.height * budgetScale));
    this.resize(width, height);
    this.drawCalls = 0;
    let front = 0;
    this.pass('base', this.accum[front], { uBackground: hexRGB(project.background), uSourceOpacity: original ? 1 : project.sourceOpacity, uSourceTint: hexRGB(original ? '#ffffff' : project.sourceTint || '#ffffff') }, { uSource: this.source });
    const layers = project.layers.slice(0, MAX_LAYERS);
    const activeIds = new Set(layers.map(layer => layer.id));
    for (const [id, map] of this.pointMaps) {
      if (!layers.some(layer => layer.id === id && layer.symbolMode === 'points')) { this.gl.deleteTexture(map.texture); this.pointMaps.delete(id); }
    }
    for (const [id, atlas] of this.atlases) {
      if (!activeIds.has(id) || !layers.some(layer => layer.id === id && layer.symbolMode === 'text')) { this.gl.deleteTexture(atlas.texture); this.atlases.delete(id); }
    }
    for (const [id, atlas] of this.dotAtlases) {
      if (!activeIds.has(id) || !layers.some(layer => layer.id === id && layer.symbolMode === 'dots')) {
        this.gl.deleteTexture(atlas.texture); this.gl.deleteTexture(atlas.profiles); this.dotAtlases.delete(id);
      }
    }
    if (!original) {
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (!layer.enabled || layer.opacity === 0 || (layer.type === 'glow' && layer.strength === 0)) continue;
        let texture;
        if (layer.type === 'glow') {
          let source = this.source;
          if (layer.glowSource === 'below') source = this.accum[front].texture;
          else if (layer.glowSource !== 'source') {
            const target = layers.slice(0, i).find(candidate => candidate.id === layer.glowSource);
            // Rerender selected drawing layers into one scratch target, avoiding a texture per layer.
            source = target?.enabled && target.type !== 'glow' ? this.drawLayer(target) : this.empty;
          }
          texture = this.drawGlow(layer, source);
        } else texture = this.drawLayer(layer);
        this.pass('composite', this.accum[1 - front], {
          uOpacity: layer.opacity, uStrength: layer.type === 'glow' ? layer.strength : 1,
          uBlend: BLENDS.indexOf(layer.blend),
        }, { uBase: this.accum[front].texture, uLayer: texture });
        front = 1 - front;
      }
    }
    this.pass('copy', null, {}, { uInput: this.accum[front].texture });
    const dotBytes = (this.dotMap ? this.dotMap.width * this.dotMap.height * 4 : 0) + [...this.dotAtlases.values()].reduce((sum, atlas) => sum + atlas.bytes, 0) + [...this.pointMaps.values()].reduce((sum, map) => sum + map.data.byteLength, 0) + this.sourcePixels.data.byteLength;
    const stats = { width, height, drawCalls: this.drawCalls, cpuMs: performance.now() - start, limited: budgetScale < 1, surfaceBytes: Math.round(width * height * 3.5 * 4 + this.sourceCanvas.width * this.sourceCanvas.height * 4 + dotBytes) };
    this.stats = stats;
    return stats;
  }

  async exportPNG(project, maxEdge = 2048) {
    if (this.lost) throw new Error('The renderer is restoring. Try exporting again in a moment.');
    this.render(project, { maxEdge: Math.min(maxEdge, 2048), pixelBudget: 16_000_000 });
    return new Promise((resolve, reject) => this.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the image')), 'image/png'));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestore);
    this.releaseTargets();
    for (const atlas of this.atlases.values()) this.gl.deleteTexture(atlas.texture);
    this.atlases.clear();
    for (const atlas of this.dotAtlases.values()) { this.gl.deleteTexture(atlas.texture); this.gl.deleteTexture(atlas.profiles); }
    this.dotAtlases.clear();
    for (const map of this.pointMaps.values()) this.gl.deleteTexture(map.texture);
    this.pointMaps.clear();
    this.gl.deleteTexture(this.source);
    this.gl.deleteTexture(this.empty);
    for (const { program } of Object.values(this.programs)) this.gl.deleteProgram(program);
    this.gl.deleteVertexArray(this.vao);
    this.sourceCanvas = null;
  }
}
