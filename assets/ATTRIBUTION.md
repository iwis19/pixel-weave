# Peony reference photo

`peony-natalia.jpg`: **Two white and pink peonies on a black background**, Natalia Ivanova, Unsplash, published June 1, 2024.

- Photo: https://unsplash.com/photos/two-white-and-pink-peonies-on-a-black-background-zGG1-TiiwR8
- License: https://unsplash.com/license
- Downloaded at 1600 px width for the local rendering sample.

`peony-source.webp` is the prepared sample input. It crops the white flower and applies a one-time neutral-color/brightness alpha extraction, a loose oval crop, and connected-region selection to omit the neighboring magenta flower and dark foliage. Natural petal colors are retained, with WebP compression at quality 0.94. This preparation is independent of the effect renderer and is shown as the source in the visual benchmark. The app loads this 65 KB image directly, with no extraction work during startup. Rebuild it through `/examples/peony.html?prepare`, then Export source; the preparation code is in `examples/source-preparation.js`.

`reference-target.png` is the effect reference supplied by the user. It is used only for comparison, never as the renderer input.

`dot-tool-reference.png` is a PNG exported from the user-linked [pixel-to-character](https://pixel-to-character.vercel.app/) tool, by Matthew Hamilton, using `peony-source.webp` with the tool's default Dots settings. It appears only in the dot comparison page, never as an engine input. The tool's public source is https://github.com/matthewhamilton3141/pixel-to-character.

# Interface fonts

Geist Sans and Geist Mono, copyright 2023 Vercel in collaboration with basement.studio. The unmodified variable WOFF2 files are bundled from the official `geist` npm package, version 1.7.2. They are used for interface typography; the rendering engine's character font remains unchanged.

- Typeface: https://vercel.com/font
- Package: https://www.npmjs.com/package/geist
- SIL Open Font License 1.1: `fonts/LICENSE.txt`
