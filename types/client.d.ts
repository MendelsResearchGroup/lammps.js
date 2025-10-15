import type {
  BondSnapshot,
  BoxSnapshot,
  LAMMPSWeb,
  LammpsModule,
  ModuleOptions,
  ParticleSnapshot
} from "./index.js";

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

export declare class LammpsClient {
  readonly module: LammpsModule;
  readonly instance: LAMMPSWeb;
  readonly workdir: string;

  constructor(module: LammpsModule, instance: LAMMPSWeb, options?: LammpsClientOptions);
  static create(
    moduleOptions?: ModuleOptions,
    clientOptions?: LammpsClientOptions
  ): Promise<LammpsClient>;

  start(): this;
  stop(): this;
  dispose(): void;

  advance(steps?: number, options?: { applyPre?: boolean; applyPost?: boolean }): this;
  runCommand(command: string): this;
  runScript(script: string): this;
  runInput(path: string, content: string | Uint8Array): this;

  writeFile(path: string, content: string | Uint8Array): this;
  removeFile(path: string): this;

  syncParticles(options?: SyncOptions): ParticleArrays;
  syncBonds(options?: SyncOptions): BondArrays;
  syncBox(options?: SyncBoxOptions): BoxArrays;

  getCurrentStep(): number;
  getTimestepSize(): number;
}

export declare function createLammps(
  moduleOptions?: ModuleOptions,
  clientOptions?: LammpsClientOptions
): Promise<LammpsClient>;

export { default as createModule } from "./index.js";
