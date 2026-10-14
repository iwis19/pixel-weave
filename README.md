# Pixel Weave

A lightweight image-effects editor with stackable Pixel, ASCII, Squares, and Shapes layers, glow, painted selections, and live controls.

Built with vanilla JavaScript and WebGL 2. Images and saved projects stay in your browser.

## Development

Requires Node.js 20+ and a browser with WebGL 2. No dependencies to install.

```sh
npm run dev
```

Open http://127.0.0.1:5173.

```sh
npm test
npm run check
npm run build
```

## Deployment

Import the repository into Vercel. `vercel.json` configures the **Other** preset, `npm run build`, and `dist` output. No environment variables are required.

Saved projects are local to each browser and domain. Use Download project file and Import project file to move them.
