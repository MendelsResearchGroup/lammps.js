import createModule from "./cpp/lammps.js";

import type {
  LammpsModule,
  LAMMPSWeb,
  ParticleSnapshot,
  BondSnapshot,
  BoxSnapshot
} from "./types/index.js";

const DEFAULT_WORKDIR = "/work";

export interface SyncOptions {
  wrapped?: boolean;
  copy?: boolean;
}

export interface SyncBoxOptions {
  copy?: boolean;
}

export interface LammpsClientOptions {
  workdir?: string;
}

export interface ParticleArrays {
  count: number;
  positions: Float32Array;
  ids: Int32Array | BigInt64Array;
  types: Int32Array;
  snapshot: ParticleSnapshot;
}

export interface BondArrays {
  count: number;
  first: Float32Array;
  second: Float32Array;
  snapshot: BondSnapshot;
}

export interface BoxArrays {
  matrix: Float32Array;
  origin: Float32Array;
  lengths: Float32Array;
  snapshot: BoxSnapshot;
}

type HeapView = Float32Array | Float64Array | Int32Array | BigInt64Array;

function buildHeapMap(module: LammpsModule): Map<number, HeapView> {
  const Scalar = module.ScalarType ?? {};
  const map = new Map<number, HeapView>();
  if (module.HEAPF32) map.set(Scalar.Float32 ?? 0, module.HEAPF32);
  if (module.HEAPF64) map.set(Scalar.Float64 ?? 1, module.HEAPF64);
  if (module.HEAP32) map.set(Scalar.Int32 ?? 2, module.HEAP32);
  if (module.HEAP64) {
    map.set(Scalar.Int64 ?? 3, module.HEAP64);
  } else if (module.HEAP32) {
    map.set(Scalar.Int64 ?? 3, module.HEAP32);
  }
  return map;
}

function buildShiftMap(module: LammpsModule): Map<number, number> {
  const Scalar = module.ScalarType ?? {};
  const map = new Map<number, number>();
  map.set(Scalar.Float32 ?? 0, 2);
  map.set(Scalar.Float64 ?? 1, 3);
  map.set(Scalar.Int32 ?? 2, 2);
  map.set(Scalar.Int64 ?? 3, 3);
  return map;
}

function viewToTyped(
  module: LammpsModule,
  heaps: Map<number, HeapView>,
  shifts: Map<number, number>,
  view: ParticleSnapshot["positions"] | undefined,
  copy: boolean
): HeapView {
  if (!view || !view.ptr || !view.length) {
    const heap = heaps.get(0) ?? module.HEAPF32;
    const empty = heap.subarray(0, 0);
    return copy ? new empty.constructor(empty) : empty;
  }
  const heap = heaps.get(view.type) ?? module.HEAPF32;
  const shift = shifts.get(view.type) ?? 2;
  const start = view.ptr >> shift;
  const typed = heap.subarray(start, start + view.length);
  return copy ? new typed.constructor(typed) : typed;
}

function toParticleResult(client: LammpsClient, wrapped: boolean, copy: boolean): ParticleArrays {
  const snap = wrapped ? client.instance.syncParticlesWrapped() : client.instance.syncParticles();
  const positions = viewToTyped(client.module, client._heaps, client._shifts, snap.positions, copy) as Float32Array;
  const ids = viewToTyped(client.module, client._heaps, client._shifts, snap.ids, copy) as Int32Array | BigInt64Array;
  const types = viewToTyped(client.module, client._heaps, client._shifts, snap.types, copy) as Int32Array;
  return { count: snap.count, positions, ids, types, snapshot: snap };
}

function toBondResult(client: LammpsClient, wrapped: boolean, copy: boolean): BondArrays {
  const snap = wrapped ? client.instance.syncBondsWrapped() : client.instance.syncBonds();
  const first = viewToTyped(client.module, client._heaps, client._shifts, snap.first, copy) as Float32Array;
  const second = viewToTyped(client.module, client._heaps, client._shifts, snap.second, copy) as Float32Array;
  return { count: snap.count, first, second, snapshot: snap };
}

function toBoxResult(client: LammpsClient, copy: boolean): BoxArrays {
  const snap = client.instance.syncSimulationBox();
  const matrix = viewToTyped(client.module, client._heaps, client._shifts, snap.matrix, copy) as Float32Array;
  const origin = viewToTyped(client.module, client._heaps, client._shifts, snap.origin, copy) as Float32Array;
  const lengths = viewToTyped(client.module, client._heaps, client._shifts, snap.lengths, copy) as Float32Array;
  return { matrix, origin, lengths, snapshot: snap };
}

export class LammpsClient {
  readonly module: LammpsModule;
  readonly instance: LAMMPSWeb;
  readonly workdir: string;

  readonly _heaps: Map<number, HeapView>;
  readonly _shifts: Map<number, number>;

  constructor(module: LammpsModule, instance: LAMMPSWeb, options: LammpsClientOptions = {}) {
    this.module = module;
    this.instance = instance;
    this.workdir = options.workdir ?? DEFAULT_WORKDIR;
    this._heaps = buildHeapMap(module);
    this._shifts = buildShiftMap(module);

    try {
      module.FS.mkdir(this.workdir);
    } catch {
      /* already exists */
    }
    module.FS.chdir(this.workdir);
  }

  start(): this {
    this.instance.start();
    return this;
  }

  stop(): this {
    this.instance.stop();
    return this;
  }

  dispose(): void {
    this.stop();
  }

  advance(steps = 1, options: { applyPre?: boolean; applyPost?: boolean } = {}): this {
    const pre = options.applyPre ?? false;
    const post = options.applyPost ?? false;
    this.instance.advance(steps, pre, post);
    return this;
  }

  runCommand(command: string): this {
    this.instance.runCommand(command);
    return this;
  }

  runScript(script: string): this {
    const normalized = script.endsWith("\n") ? script : `${script}\n`;
    this.instance.runScript(normalized);
    return this;
  }

  runInput(path: string, content: string | Uint8Array): this {
    this.writeFile(path, content);
    this.instance.runFile(path);
    return this;
  }

  writeFile(path: string, content: string | Uint8Array): this {
    this.module.FS.writeFile(path, content);
    return this;
  }

  removeFile(path: string): this {
    this.module.FS.unlink(path);
    return this;
  }

  syncParticles(options: SyncOptions = {}): ParticleArrays {
    const wrapped = options.wrapped ?? false;
    const copy = options.copy ?? false;
    return toParticleResult(this, wrapped, copy);
  }

  syncBonds(options: SyncOptions = {}): BondArrays {
    const wrapped = options.wrapped ?? false;
    const copy = options.copy ?? false;
    return toBondResult(this, wrapped, copy);
  }

  syncBox(options: SyncBoxOptions = {}): BoxArrays {
    const copy = options.copy ?? false;
    return toBoxResult(this, copy);
  }

  getCurrentStep(): number {
    return this.instance.getCurrentStep();
  }

  getTimestepSize(): number {
    return this.instance.getTimestepSize();
  }
}

export async function createLammps(
  moduleOptions: Record<string, unknown> = {},
  clientOptions: LammpsClientOptions = {}
): Promise<LammpsClient> {
  const module = (await createModule(moduleOptions)) as LammpsModule;
  const instance = new module.LAMMPSWeb();
  return new LammpsClient(module, instance, clientOptions);
}

export { createModule };
