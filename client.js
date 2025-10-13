import createModule from "./cpp/lammps.js";

const DEFAULT_WORKDIR = "/work";

function buildHeapMap(module) {
  const Scalar = module.ScalarType ?? {};
  const map = new Map();
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

function buildShiftMap(module) {
  const Scalar = module.ScalarType ?? {};
  const map = new Map();
  map.set(Scalar.Float32 ?? 0, 2);
  map.set(Scalar.Float64 ?? 1, 3);
  map.set(Scalar.Int32 ?? 2, 2);
  map.set(Scalar.Int64 ?? 3, 3);
  return map;
}

function viewToTyped(module, heaps, shifts, view, copy) {
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

function toParticleResult(client, wrapped, copy) {
  const snap = wrapped ? client.instance.syncParticlesWrapped() : client.instance.syncParticles();
  const positions = viewToTyped(client.module, client._heaps, client._shifts, snap.positions, copy);
  const ids = viewToTyped(client.module, client._heaps, client._shifts, snap.ids, copy);
  const types = viewToTyped(client.module, client._heaps, client._shifts, snap.types, copy);
  return { count: snap.count, positions, ids, types, snapshot: snap };
}

function toBondResult(client, wrapped, copy) {
  const snap = wrapped ? client.instance.syncBondsWrapped() : client.instance.syncBonds();
  const first = viewToTyped(client.module, client._heaps, client._shifts, snap.first, copy);
  const second = viewToTyped(client.module, client._heaps, client._shifts, snap.second, copy);
  return { count: snap.count, first, second, snapshot: snap };
}

function toBoxResult(client, copy) {
  const snap = client.instance.syncSimulationBox();
  const matrix = viewToTyped(client.module, client._heaps, client._shifts, snap.matrix, copy);
  const origin = viewToTyped(client.module, client._heaps, client._shifts, snap.origin, copy);
  const lengths = viewToTyped(client.module, client._heaps, client._shifts, snap.lengths, copy);
  return { matrix, origin, lengths, snapshot: snap };
}

export class LammpsClient {
  constructor(module, instance, options = {}) {
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

  start() {
    this.instance.start();
    return this;
  }

  stop() {
    this.instance.stop();
    return this;
  }

  dispose() {
    this.stop();
  }

  advance(steps = 1, options = {}) {
    const pre = options.applyPre ?? false;
    const post = options.applyPost ?? false;
    this.instance.advance(steps, pre, post);
    return this;
  }

  runCommand(command) {
    this.instance.runCommand(command);
    return this;
  }

  runScript(script) {
    const normalized = script.endsWith("\n") ? script : `${script}\n`;
    this.instance.runScript(normalized);
    return this;
  }

  runInput(path, content) {
    this.writeFile(path, content);
    this.instance.runFile(path);
    return this;
  }

  writeFile(path, content) {
    this.module.FS.writeFile(path, content);
    return this;
  }

  removeFile(path) {
    this.module.FS.unlink(path);
    return this;
  }

  syncParticles(options = {}) {
    const wrapped = options.wrapped ?? false;
    const copy = options.copy ?? false;
    return toParticleResult(this, wrapped, copy);
  }

  syncBonds(options = {}) {
    const wrapped = options.wrapped ?? false;
    const copy = options.copy ?? false;
    return toBondResult(this, wrapped, copy);
  }

  syncBox(options = {}) {
    const copy = options.copy ?? false;
    return toBoxResult(this, copy);
  }

  getCurrentStep() {
    return this.instance.getCurrentStep();
  }

  getTimestepSize() {
    return this.instance.getTimestepSize();
  }
}

export async function createLammps(moduleOptions = {}, clientOptions = {}) {
  const module = await createModule(moduleOptions);
  const instance = new module.LAMMPSWeb();
  return new LammpsClient(module, instance, clientOptions);
}

export { createModule };
