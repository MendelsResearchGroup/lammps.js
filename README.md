# lammps.js

[![CI](https://github.com/alexz/lammps.js/actions/workflows/ci.yml/badge.svg)](https://github.com/alexz/lammps.js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/lammps.js.svg)](https://www.npmjs.com/package/lammps.js)

Lightweight typed JavaScript/TypeScript wrapper around LAMMPS. The package exports the compiled `lammps.js` module together with a
modern interface (`LAMMPSWeb`) that exposes snapshots for particles, bonds and simulation box data.

## Usage

```ts
import { createLammps } from "lammps.js/client";

const lammps = await createLammps();

lammps.start().runScript(`
  units lj
  atom_style atomic
  lattice fcc 0.8442
  region box block 0 3 0 3 0 3
  create_box 1 box
  create_atoms 1 box
  mass 1 1.0
  pair_style lj/cut 2.5
  pair_coeff 1 1 1.0 1.0 2.5
  run 1
`);

const particles = lammps.syncParticles({ copy: true });
console.log(`atoms: ${particles.count}`);

const wrapped = lammps.syncParticlesWrapped({ copy: true });
console.log(`wrapped positions length: ${wrapped.positions.length}`);

lammps.dispose();
```

The TypeScript definitions are shipped with the package under
`types/index.d.ts`, so IDEs receive auto-complete everywhere.


### High-level client

For a more ergonomic API, use the helpers in `lammps.js/client`:

```ts
import { createLammps } from "lammps.js/client";

const lammps = await createLammps();
await fetch('/in.lj')
  .then(res => res.text())
  .then(script => lammps.runInput('in.lj', script));

const { positions, count } = lammps.syncParticles({ copy: true });
console.log(count);

lammps.dispose();
```

Use `syncParticles({ wrapped: true })` and `syncBonds({ wrapped: true })` to access
raw periodic coordinates while the default returns minimum-image data, ready for rendering.

Install via npm:

```bash
npm install lammps.js
```

## Building the wasm bundle

```bash
npm run build:wasm
```

This calls `cpp/build.py`, which keeps the upstream LAMMPS checkout in
`cpp/lammps` fresh and emits `cpp/lammps.js` (single-file ES module).

## Test suite

The Vitest suite spins up a jsdom environment, instantiates the wasm module,
loads a miniature Lennard-Jones sample and validates the public interface.

```bash
npm test
```

> The build step fetches the LAMMPS sources on first run. Subsequent runs are
> incremental thanks to the cached checkout and Emscripten cache.

## Examples

A ready-to-run Three.js demo lives in `examples/threejs`:

```bash
cd examples/threejs
npm install
npm run dev
```

It links against the local workspace copy of `lammps.js` and renders the
Lennard-Jones sample (`tests/fixtures/lj.mini.in`).
