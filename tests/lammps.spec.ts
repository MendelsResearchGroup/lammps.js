import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BufferView, LAMMPSWeb, LammpsModule } from "../types";

const fixturePath = join(process.cwd(), "tests", "fixtures", "lj.mini.in");

let wasm: LammpsModule;
let lmp: LAMMPSWeb;
let createModule: (typeof import("../cpp/lammps.js"))['default'];

const resolveView = (module: LammpsModule, view: BufferView) => {
  if (!view.ptr || !view.length) {
    return null;
  }

  const { ScalarType } = module;
  switch (view.type) {
    case ScalarType.Float32: {
      const start = view.ptr >> 2;
      return module.HEAPF32.subarray(start, start + view.length);
    }
    case ScalarType.Float64: {
      const start = view.ptr >> 3;
      return module.HEAPF64.subarray(start, start + view.length);
    }
    case ScalarType.Int32: {
      const start = view.ptr >> 2;
      return module.HEAP32.subarray(start, start + view.length);
    }
    case ScalarType.Int64: {
      const start = view.ptr >> 3;
      return module.HEAP64.subarray(start, start + view.length);
    }
    default:
      return null;
  }
};

beforeAll(async () => {
  const script = readFileSync(fixturePath, "utf8");
  const originalProcess = globalThis.process;
  const hadProcess = Object.prototype.hasOwnProperty.call(globalThis, "process");
  // Some Emscripten builds guard against Node execution. Temporarily hide `process`
  // so the module takes the web/worker code path while we instantiate it.
  (globalThis as any).process = undefined;
  try {
    ({ default: createModule } = await import("../cpp/lammps.js"));

    wasm = await createModule({
      print: () => undefined,
      printErr: () => undefined
    });
  } finally {
    if (hadProcess) {
      (globalThis as any).process = originalProcess;
    } else {
      delete (globalThis as any).process;
    }
  }

  try {
    wasm.FS.mkdir("/work");
  } catch {
    // ignore if it already exists
  }
  wasm.FS.chdir("/work");
  wasm.FS.writeFile("in.lj", script);

  lmp = new wasm.LAMMPSWeb();
  lmp.start();
  lmp.runFile("in.lj");
});

afterAll(() => {
  lmp?.stop();
});

describe("lammps.js wasm interface", () => {
  it("exposes particles after running the LJ sample", () => {
    const particles = lmp.syncParticles();
    expect(particles.count).toBeGreaterThan(0);
    const positions = (resolveView(wasm, particles.positions) as Float32Array | null) ?? new Float32Array(0);
    expect(positions.length).toBe(particles.count * 3);
  });

  it("provides simulation box information", () => {
    const box = lmp.syncSimulationBox();
    const origin = (resolveView(wasm, box.origin) as Float32Array | null) ?? new Float32Array(0);
    const lengths = (resolveView(wasm, box.lengths) as Float32Array | null) ?? new Float32Array(0);
    expect(origin.length).toBe(3);
    expect(lengths.length).toBe(3);
    expect(lengths[0]).toBeGreaterThan(0);
  });

  it("advances timesteps via advance()", () => {
    const before = Number(lmp.getCurrentStep());
    lmp.advance(3, false, false);
    const after = Number(lmp.getCurrentStep());
    expect(after).toBe(before + 3);
  });

  it("returns bond snapshots even when no bonds exist", () => {
    const bonds = lmp.syncBonds();
    expect(bonds.count).toBeGreaterThanOrEqual(0);
    const first = (resolveView(wasm, bonds.first) as Float32Array | null) ?? new Float32Array(0);
    const second = (resolveView(wasm, bonds.second) as Float32Array | null) ?? new Float32Array(0);
    expect(first.length).toBe(bonds.count * 3);
    expect(second.length).toBe(bonds.count * 3);
  });
});
