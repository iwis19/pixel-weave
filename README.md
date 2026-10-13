# ASCII Effects — phase 1

A browser-local image renderer with independent ASCII, pixel, and glow layers. Vanilla JavaScript, WebGL 2, no runtime dependencies, no image uploads, and no build step. The current interface is a control surface for developing the engine; visual frontend design remains open.

[Open the live workspace](https://ascii-effects-studio.ronniegoo.chatgpt.site). The deployment is private and starts with the Dots preset.

## Run

Requires Node.js 20 or newer for the local server and command-line tests.

```sh
npm run dev
```

Open http://127.0.0.1:5173. `npm install` is unnecessary. The server binds to loopback only.

## Use

- Open or drop an image. A prepared peony photo is available immediately with the Dots preset. Red / lilac applies the layered flower recipe to your current image; its cell sizes adapt to the reference width. Neutral restores the initial basic stack. Edits change the selector to Custom.
- Add ASCII, Pixel, and Glow layers. The list displays topmost layers first. Use the arrows to reorder, the circle to hide, and the inspector to duplicate or delete.
- An ASCII layer explicitly selects Characters, Shapes, or Dot grid. No mixed symbol collection is added automatically. Empty character/shape selections draw nothing. Characters are ordered from low to high brightness; random distribution and reverse order are available. Unicode characters render through the browser's monospace font and fallback fonts. Geometric shapes render analytically on the GPU, with editable stroke width for hollow squares, crosses, and diamonds.
- Dot grid reconstructs the image using groups of circular dots. Each character cell averages a 3 × 3 source neighborhood and selects a discrete dot population by brightness. Edge detail chooses among evenly distributed and directional arrangements with the same population. Dot rows, Cell aspect, Dot size, Density, Tone curve, Gamma, and Reverse order are independent per layer. Cell size refers to the character cell, which contains multiple dots. Select the Dots preset to inspect reconstruction with the underlying Image at 0%.
- Pixel layers offer squares, dots, or hollow squares.
- Glow layers use soft bloom or a square box treatment. Target the original image, an ASCII/pixel layer beneath the glow, or the visible composition beneath it. A targeted layer supplies its drawing before opacity/blending, which also allows glow-only compositions. Hiding a target hides its glow. Target dependencies are kept beneath glow layers when reordering.
- Every layer has its own color, opacity, blend, sampling, scale, and X/Y offset. Cell size and offsets use processed reference-image pixels. Scale transforms the layer around the image center; positive offsets move right/down. Drawing grids scale with the layer and remain consistent when preview resolution changes.
- Colors can come from the image, a shaded tint, a solid color, or a two-color spatial gradient. Solid and gradient colors have adjustable image shading. Image tint affects the underlying photo only; Original bypasses it.
- Linear and radial masks restrict individual layers to a region. They support angle/position or center/radius, feather, inversion, and faded or scattered edges. Masks follow each layer's transform. Glow masks control the emission region before blur.
- Density by tone and Tone curve make marks concentrate in brighter areas, preserving detail in darker petals or other subjects. Cell size supports fractional values; stroke width is a fraction of the cell.
- Ordered spacing uses Bayer coverage to vary density within a regular grid. Random spacing uses the layer's seed. Size by tone varies mark size with brightness. Image detail preserves continuous source texture inside coarse cells; combine it with Image shading for colored cells that retain petal folds.
- Glow radius is also measured in reference-image pixels. Box glow first samples a cell grid and then applies a separable square blur. Soft glow applies a Gaussian-weighted blur.
- Save/Load stores layer settings as JSON. Reopen the reference image separately; image data is deliberately excluded from the settings file.
- Export PNG renders the full composition up to a 2048 px long edge. Small images retain their original resolution. Original toggles the preview comparison; export always includes the effects.

## Engine API

The renderer is independent of the inspector and DOM application state:

```js
import { Renderer } from './src/engine.js';
import { createLayer, normalizeProject } from './src/model.js';

const renderer = new Renderer(canvas);
renderer.setSource(image); // HTMLImageElement, ImageBitmap, or canvas

const ascii = createLayer('ascii', { characters: '01', cellSize: 10 });
const pixels = createLayer('pixel', { cellSize: 24, opacity: 0.3 });
const glow = createLayer('glow', { glowSource: ascii.id, glowStyle: 'soft' });
const project = normalizeProject({
  version: 1,
  background: '#08090b',
  sourceOpacity: 0.15,
  layers: [pixels, ascii, glow], // bottom to top
});

renderer.render(project, { maxEdge: 1280 });
const png = await renderer.exportPNG(project, 2048);
renderer.dispose();
```

Call `render` after changes; the engine has no animation loop. The UI coalesces input changes with one `requestAnimationFrame`. `render` returns output dimensions, draw-call count, estimated texture allocation, and CPU submission time (not GPU frame time). Use `createLayer`/`normalizeProject` for bounded settings; invalid glow targets fall back to the image during project loading.

For geometry inspection, `render(project, { renderScale: 2, maxEdge: 2048, pixelBudget: 16_000_000 })` re-renders procedural shapes at twice the reference resolution. Cell counts and transforms stay tied to the original image, and the source photo texture keeps its original resolution. The same fixed working-pixel budget still applies. Normal preview and PNG export retain their existing resolution behavior.

The engine stores colors with premultiplied alpha internally. Blend modes are normal, screen, add, and multiply. Ordinary marks sample bilinearly at cell centers; grouped dots average a 3 × 3 neighborhood per character. This is an image-based renderer; it does not perform automatic subject segmentation or generate imagery.

## Performance limits

- Reference images are downsampled to a maximum 2048 px long edge once on import; full decoded originals are released afterward.
- Preview has an 8-million working-pixel budget for the five main render surfaces. Higher requested resolutions can be reduced automatically, and the actual dimensions appear beside the preview.
- Export temporarily allows 16 million working pixels so 2048 × 2048 output fits. Preview allocation is restored afterward.
- Five framebuffer surfaces are reused for the whole stack: two composition targets, one drawing target, and two half-resolution glow targets. Layer count does not allocate additional full-size textures.
- A selected glow target is redrawn into the shared scratch surface rather than retained in a separate full-size layer cache. Small text glyph atlases are cached per ASCII layer and rebuilt only when symbols change. Geometric symbol layers need no atlas.
- Grouped dots share one small analysis surface across all dot layers, capped at 512 × 512 character cells (two RGBA8 texels per cell, at most 2 MiB). The cap is applied in reference coordinates so preview and export preserve the same glyph populations. A small mask/shape table is cached per layer, at most 44 KB. Tone/edge analysis runs once per character cell; the full-size drawing pass only reads the selected mask and draws analytic circles. It does not run a glyph search per output pixel.
- Up to 12 layers and 64 characters per layer. Blur uses two fixed 17-tap passes; radius does not increase shader-loop cost.
- Image files are limited to 50 MB; settings files to 1 MB. Animated inputs use a still frame.
- WebGL 2 is required. Context loss pauses rendering, with automatic resource restoration when the browser restores the context.

No server rendering, external fonts, frameworks, analytics, or cloud services are involved.

## First visual benchmark

Open http://127.0.0.1:5173/examples/peony.html to compare the prepared source, the user-supplied target, and the actual renderer output. The target is never used as the renderer input. The source uses a different flower, as authorized; the current recipe uses coarse colored cells and actual circular dots. The flower geometry follows that source photograph.

The recipe is ordinary layer state in `src/presets.js`: textured red cells and lilac cells with wide faded masks, a grouped-dot reconstruction, and targeted dot glow. Dot populations follow brightness and edge arrangements follow petal boundaries. Colored coarse cells use continuous image detail. All controls remain live and editable. The flower palette is still an exploratory recipe; it is not a claim of a finished match to the target. No image-specific path is added to the shaders.

Open http://127.0.0.1:5173/examples/dots.html for the isolated dot comparison: source photo, that photo rendered by the user-linked [pixel-to-character tool](https://pixel-to-character.vercel.app/), and our grouped dots. The Dots preset contains one ASCII layer, uses source colors, and sets Image to 0%. At 900 × 720 it uses five passes and approximately 11.2 MiB of renderer textures. The comparison's reference PNG is static and never used as an engine input. The linked tool's [public source](https://github.com/matthewhamilton3141/pixel-to-character) was inspected to understand its grouped tone/edge approach; the local renderer implements the approach independently with a compact GPU analysis pass.

Export detail re-renders the same recipe at twice the resolution, crops a petal region, and displays it at 480 × 480. It checks the actual circle geometry without magnifying the low-resolution raster alone. It adds no source photograph detail and restores the normal preview surfaces immediately afterward. The dot antialiasing uses continuous coordinates, avoiding derivative jumps at grid boundaries that previously broke fine marks into corner fragments.

The 65 KB prepared sample is loaded directly. Cropping and background extraction were performed once, not at app startup. Source photo credit and regeneration steps are in `assets/ATTRIBUTION.md`.

## Verification

```sh
npm test
npm run check
```

With the server running, open http://127.0.0.1:5173/tests/render.html for real WebGL pixel checks: independent symbol sets, empty selections, layer order, blend modes, opacity, transparency, transforms, sampling, targeted glow, distinct glow styles, consistent preview scaling, bounded framebuffer allocation, and nonblank PNG export.

The automated test page checks rendering output, not just shader compilation. Additional checks cover mask regions and inversion, hollow-square holes and stroke width, gradient colors, brightness-driven density, untinted Original comparison, circular dot geometry, fractional-grid gaps, exact ordered coverage, texture inside coarse cells, size response, and consistent supersampled coverage. Grouped-dot checks verify discrete populations at black/half/white tones, directional edge matching without changing tone, independent layer settings, transforms, shared allocation, and stable supersampling. For UI verification, test image import, explicit shape selection, creating separate ASCII layers, live changes, presets, and settings save/load in the browser.
