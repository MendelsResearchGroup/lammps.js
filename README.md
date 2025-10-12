# lammps.js

[![CI](https://github.com/alexz/lammps.js/actions/workflows/ci.yml/badge.svg)](https://github.com/alexz/lammps.js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@atomify/lammps.svg)](https://www.npmjs.com/package/@atomify/lammps)

Lightweight typed JavaScript/TypeScript wrapper around LAMMPS. The package exports the compiled `lammps.js` module together with a
modern interface (`LAMMPSWeb`) that exposes snapshots for particles, bonds and simulation box data.

## Usage

```ts
import createModule from "lammps.js";

const wasm = await createModule();
const lmp = new wasm.LAMMPSWeb();

lmp.start();
wasm.FS.writeFile("in.lj", "(LAMMPS input script)\n");
lmp.runFile("in.lj");

const particles = lmp.syncParticles();
const snapshot = wasm.HEAPF32.subarray(
  particles.positions.ptr >> 2,
  (particles.positions.ptr >> 2) + particles.positions.length
);
console.log(`atoms: ${particles.count}`);

lmp.stop();
```

The TypeScript definitions are shipped with the package under
`types/index.d.ts`, so IDEs receive auto-complete everywhere.

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
