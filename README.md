# Pixel Weave — phase 1

A browser-local image renderer with Pixel, ASCII, Squares, and Shapes layers, each with its own glow controls. Vanilla JavaScript, WebGL 2, no runtime dependencies, no image uploads, and no build step.

[Open the live workspace](https://ascii-effects-studio.ronniegoo.chatgpt.site). The deployment is private and starts with the Pixel dot preset.

Source repository: [iwis19/pixel-weave](https://github.com/iwis19/pixel-weave).

## Run

Requires Node.js 20 or newer for the local server and command-line tests.

```sh
npm run dev
```

Open http://127.0.0.1:5173. `npm install` is unnecessary. The server binds to loopback only.

## Use

- Reference image, image opacity, tint, background, and the layer stack live on the left; the preview stays in the center. The right inspector has direct Shape, Color, Distribution, Glow, and Transform tabs, plus Sampling for ASCII, Squares, and Shapes. Each layer remembers its active tab. The panels replace the long accordion list; drawing stays active across tabs. Tablet layouts put image and layers above the preview, and narrow screens stack the inspector below it.
- Drag either panel's inner edge to resize it. Widths are remembered locally, with limits that preserve space for the preview. Double-click an edge or press Enter while focused to restore its default width. Arrow keys resize in 10 px steps (40 px with Shift); Home/End reach the limits. In tablet layouts only the right inspector is a side panel; stacked phone layouts hide the resize edges.
- The reset arrow beside Tint restores white (#ffffff); the one beside Background restores the default dark canvas (#08090b). Each reset updates the preview immediately and keeps your image opacity, layers, and selections.
- Click the project title beside Pixel Weave to rename it. Enter or clicking away saves; Escape cancels. Project names persist in settings and determine Save and PNG export filenames. Preset changes keep the project name.
- Double-click a layer in the stack or press F2 while it is focused to rename it. The pencil beside the inspector's layer name selects that field for editing. Enter saves, Escape restores the previous name, and empty names return to the layer type. Naming does not change the rendering or preset selection. The starter dot layer is named Pixel.
- Open or drop an image. A prepared peony photo is available immediately with the Pixel preset. Red / lilac applies the layered flower recipe to your current image; its cell sizes adapt to the reference width. Neutral restores the initial basic stack. Edits change the selector to Custom.
- Add Pixel, ASCII, Squares, or Shapes layers. The list displays topmost layers first. Use the arrows to reorder, the eye to hide, and the inspector to duplicate or delete. Glow belongs to each drawing layer.
- ASCII uses custom characters ordered from low to high brightness, with random mapping and reverse order available. Empty character sets draw nothing. Unicode characters use the browser’s monospace font and fallback fonts.
- Squares offers Filled or Hollow styles, with separate spacing, size, and hollow stroke width. Coverage, clumping, painted selection, sampling, color, transforms, and glow are independently editable.
- Shapes starts with one Plus symbol. Choose shapes opens a searchable multi-select grid with Crosses, Stars, and Geometric filters. Toggle symbols, remove selected chips, then Apply; Cancel and Escape discard the draft. Selected shapes mix equally by default. Brightness mapping uses their selection order. Separate Shapes layers can have different colors, coverage, selections, size, and glow. The nine initial symbols are Plus, Cross, Asterisk, Sparkle, Star, Diamond, Triangle, Hollow triangle, and Ring. They render analytically on the GPU without font or image assets. Arrow keys navigate the picker grid.
- Pixel places one circle per grid position. Spacing and Dot diameter are independent reference-pixel controls. Dot coverage retains an exact fraction of eligible positions; Clumping gathers those positions into patches without moving them off the grid. There is no minimum-brightness cutoff, mode switch, or Shuffle control in the Pixel inspector. The default preset keeps the underlying Image visible at 55%.
- Turn Draw selection on, then hold left-click and drag on the image or distribution map. The highlight sets the area for that layer; brush size controls the stroke width. Erase trims it, turning drawing off keeps it, and Clear returns to the full reference image. Spacing, diameter, coverage, and clumping remain active during drawing. Painted selections may include dark or transparent areas; Solid color makes dots visible there. Each layer saves its own compact mask, and importing a new image clears the previous selections.
- Enable Glow on any drawing layer for soft bloom or a square box treatment, with independent Strength and Radius. The halo follows that layer's color, transform, and painted region; hiding or fading the layer also hides or fades its glow. Reordering moves the effect and its glow together.
- Every layer has its own color, opacity, blend, scale, X/Y offset, and glow settings. Cell size and offsets use processed reference-image pixels. Scale transforms the layer around the image center; positive offsets move right/down. Drawing grids scale with the layer and remain consistent when preview resolution changes. Painted selections stay aligned with the canvas while layer transforms move marks through them.
- Colors can come from the image, a shaded tint, a solid color, or a two-color spatial gradient. Solid and gradient colors have adjustable image shading. Image tint affects the underlying photo only; Original bypasses it.
- Linear and radial masks restrict individual layers to a region. They support angle/position or center/radius, feather, inversion, and faded or scattered edges. Masks follow each layer's transform. Glow masks control the emission region before blur.
- Density by tone and Tone curve make marks concentrate in brighter areas, preserving detail in darker petals or other subjects. Cell size supports fractional values; stroke width is a fraction of the cell.
- Ordered spacing uses Bayer coverage to vary density within a regular grid. Random spacing uses the layer's seed. Size by tone varies mark size with brightness. Image detail preserves continuous source texture inside coarse cells; combine it with Image shading for colored cells that retain petal folds.
- Glow radius is also measured in reference-image pixels. Box glow first samples a cell grid and then applies a separable square blur. Soft glow applies a Gaussian-weighted blur.
- Save/Load stores layer settings, glow, and painted selections in `.pixel-weave.json` files. Older `.ascii.json` settings remain supported. Older dot layers load as Pixel, square Pixels load as Squares, and ASCII shape sets load as Shapes; older standalone glows are folded into their drawing layers. Reopen the reference image separately; image data is deliberately excluded from the settings file.
- Export PNG renders the full composition up to a 2048 px long edge. Small images retain their original resolution. Original toggles the preview comparison; export always includes the effects.

## Engine API

The renderer is independent of the inspector and DOM application state:

```js
import { Renderer } from './src/engine.js';
import { createLayer, normalizeProject } from './src/model.js';

const renderer = new Renderer(canvas);
renderer.setSource(image); // HTMLImageElement, ImageBitmap, or canvas

const ascii = createLayer('ascii', { characters: '01', cellSize: 10, glowEnabled: true, glowStyle: 'soft' });
const pixels = createLayer('pixel', { cellSize: 24, opacity: 0.3 });
const project = normalizeProject({
  version: 1,
  background: '#08090b',
  sourceOpacity: 0.15,
  layers: [pixels, ascii], // bottom to top; glow belongs to ascii
});

renderer.render(project, { maxEdge: 1280 });
const png = await renderer.exportPNG(project, 2048);
renderer.dispose();
```

Call `render` after changes; the engine has no animation loop. The UI coalesces input changes with one `requestAnimationFrame`. `render` returns output dimensions, draw-call count, estimated texture allocation, and CPU submission time (not GPU frame time). Use `createLayer`/`normalizeProject` for bounded settings and migration of older dot/glow projects.

For geometry inspection, `render(project, { renderScale: 2, maxEdge: 2048, pixelBudget: 16_000_000 })` re-renders procedural shapes at twice the reference resolution. Cell counts and transforms stay tied to the original image, and the source photo texture keeps its original resolution. The same fixed working-pixel budget still applies. Normal preview and PNG export retain their existing resolution behavior.

The engine stores colors with premultiplied alpha internally. Blend modes are normal, screen, add, and multiply. Ordinary marks sample bilinearly at cell centers; grouped dots average a 3 × 3 neighborhood per character. This is an image-based renderer; it does not perform automatic subject segmentation or generate imagery.

## Performance limits

- Reference images are downsampled to a maximum 2048 px long edge once on import; full decoded originals are released afterward.
- Preview has an 8-million working-pixel budget for the five main render surfaces. Higher requested resolutions can be reduced automatically, and the actual dimensions appear beside the preview.
- Export temporarily allows 16 million working pixels so 2048 × 2048 output fits. Preview allocation is restored afterward.
- Five framebuffer surfaces are reused for the whole stack: two composition targets, one drawing target, and two half-resolution glow targets. Layer count does not allocate additional full-size textures.
- Layer glow reuses that layer's drawing in the shared scratch surface. Small text glyph atlases are cached per ASCII layer and rebuilt only when symbols change. Geometric symbol layers need no atlas.
- Grouped dots share one small analysis surface across all dot layers, capped at 512 × 512 character cells (two RGBA8 texels per cell, at most 2 MiB). The cap is applied in reference coordinates so preview and export preserve the same glyph populations. A small mask/shape table is cached per layer, at most 44 KB. Tone/edge analysis runs once per character cell; the full-size drawing pass only reads the selected mask and draws analytic circles. It does not run a glyph search per output pixel.
- Single dots use a cached one-byte occupancy map per layer, capped below 512 × 512 positions. Only source, distribution, transform, or mask changes rebuild it; diameter, opacity, and color changes reuse it. Painting uses a 160 × 128 bitmap (2.5 KiB before base64), with no per-layer full-size render surfaces. A source thumbnail is sampled once on import. Coverage is ranked on the small grid; the GPU draws crisp analytic circles.
- Up to 12 layers and 64 characters per layer. Blur uses two fixed 17-tap passes; radius does not increase shader-loop cost.
- Image files are limited to 50 MB; settings files to 1 MB. Animated inputs use a still frame.
- WebGL 2 is required. Context loss pauses rendering, with automatic resource restoration when the browser restores the context.

The interface uses a Vercel-inspired dark palette with Geist Sans, Geist Mono for values, neutral borders, and monochrome controls. Both variable fonts are served locally (about 138 KiB together); no external font requests or runtime UI framework are involved. Typeface credits and the included license are in `assets/ATTRIBUTION.md` and `assets/fonts/LICENSE.txt`.

No server rendering, analytics, or cloud services are involved.

## First visual benchmark

Open http://127.0.0.1:5173/examples/peony.html to compare the prepared source, the user-supplied target, and the actual renderer output. The target is never used as the renderer input. The source uses a different flower, as authorized; the current recipe uses coarse colored cells and actual circular dots. The flower geometry follows that source photograph.

The recipe is ordinary layer state in `src/presets.js`: textured red cells and lilac cells with wide faded masks, a single-dot field, and targeted dot glow. Colored coarse cells use continuous image detail. All controls remain live and editable. The flower palette is still an exploratory recipe; it is not a claim of a finished match to the target. No image-specific path is added to the shaders.

Open http://127.0.0.1:5173/examples/dots.html for the dot comparison: source photo, the static reference from the user-linked [pixel-to-character tool](https://pixel-to-character.vercel.app/), and the current Pixel preset. This preset contains one Pixel layer using the Dot shape, with a lilac color and the Image at 55%. The comparison's reference PNG is never used as an engine input. The legacy grouped renderer remains available internally for compatibility; the inspector uses single-dot Pixel layers and their distribution controls.

Export detail re-renders the same recipe at twice the resolution, crops a petal region, and displays it at 480 × 480. It checks the actual circle geometry without magnifying the low-resolution raster alone. It adds no source photograph detail and restores the normal preview surfaces immediately afterward. The dot antialiasing uses continuous coordinates, avoiding derivative jumps at grid boundaries that previously broke fine marks into corner fragments.

The 65 KB prepared sample is loaded directly. Cropping and background extraction were performed once, not at app startup. Source photo credit and regeneration steps are in `assets/ATTRIBUTION.md`.

## Verification

```sh
npm test
npm run check
```

With the server running, open http://127.0.0.1:5173/tests/render.html for real WebGL pixel checks: independent symbol sets, empty selections, layer order, blend modes, opacity, transparency, transforms, sampling, targeted glow, distinct glow styles, consistent preview scaling, bounded framebuffer allocation, and nonblank PNG export.

The automated test page checks rendering output, not just shader compilation. Additional checks cover mask regions and inversion, hollow-square holes and stroke width, gradient colors, brightness-driven density, untinted Original comparison, circular dot geometry, fractional-grid gaps, exact ordered coverage, texture inside coarse cells, size response, and consistent supersampled coverage. Grouped-dot checks verify discrete populations at black/half/white tones, directional edge matching without changing tone, independent layer settings, transforms, shared allocation, and stable supersampling. For UI verification, test image import, explicit shape selection, creating separate ASCII layers, live changes, presets, and settings save/load in the browser.
