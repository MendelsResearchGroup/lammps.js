export enum ScalarType {
  Float32 = 0,
  Float64 = 1,
  Int32 = 2,
  Int64 = 3
}

export interface BufferView {
  /** Pointer within the Emscripten heap. Use HEAP* views to read data. */
  ptr: number;
  /** Total number of scalar values exposed via this view. */
  length: number;
  /** Number of components per logical element (e.g. 3 for xyz positions). */
  components: number;
  /** Underlying scalar representation for this view. */
  type: ScalarType;
}

export interface ParticleSnapshot {
  positions: BufferView;
  ids: BufferView;
  types: BufferView;
  count: number;
}

export interface BondSnapshot {
  first: BufferView;
  second: BufferView;
  count: number;
}

export interface BoxSnapshot {
  matrix: BufferView;
  origin: BufferView;
  lengths: BufferView;
}

export interface LAMMPSWeb {
  start(): void;
  stop(): void;
  advance(steps: number, applyPre?: boolean, applyPost?: boolean): void;
  runCommand(command: string): void;
  runScript(script: string): void;
  runFile(path: string): void;

  isReady(): boolean;
  getIsRunning(): boolean;
  getCurrentStep(): number;
  getTimestepSize(): number;

  syncParticles(): ParticleSnapshot;
  syncBonds(): BondSnapshot;
  syncSimulationBox(): BoxSnapshot;
}

export interface LammpsModule {
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
  HEAP32: Int32Array;
  HEAP64: BigInt64Array;
  FS: {
    mkdir(path: string): void;
    chdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    unlink(path: string): void;
    readFile(path: string, opts?: { encoding: "utf8" }): string;
  };
  LAMMPSWeb: new () => LAMMPSWeb;
  ScalarType: typeof ScalarType;
  [key: string]: unknown;
}

export interface ModuleOptions {
  print?: (...args: unknown[]) => void;
  printErr?: (...args: unknown[]) => void;
  locateFile?: (path: string, prefix?: string) => string;
  [key: string]: unknown;
}

declare function createModule(options?: ModuleOptions): Promise<LammpsModule>;

export default createModule;
