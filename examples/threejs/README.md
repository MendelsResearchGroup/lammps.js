# Three.js Lennard-Jones Demo

A tiny Vite app that consumes the `lammps.js/client` helper and renders the Lennard-Jones
sample (`tests/fixtures/lj.mini.in`) with Three.js.

## Prerequisites

- Node.js ≥ 18
- The root project built once (`npm install`, `npm run build:wasm`)

## Run locally

```bash
cd examples/threejs
npm install
npm run dev
```

This links the example to the local checkout via `"lammps.js": "file:../../"`.
Once the package is published you can replace it with the npm version.

## Build

```bash
npm run build
npm run preview
```

## Publish to GitHub Pages

```bash
cd examples/threejs
npm install
npm run build
npx gh-pages -d dist
```

The command above uses the `gh-pages` CLI (install with `npm install --global gh-pages` if you don't already have it).
