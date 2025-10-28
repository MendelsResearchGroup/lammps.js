import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LammpsClient } from "../client.js";

const fixturePath = join(process.cwd(), "tests", "fixtures", "lj.mini.in");

let client;

beforeAll(async () => {
  const script = readFileSync(fixturePath, "utf8");
  (globalThis as any).process = undefined;
  let originalProcess: any;
  let hadProcess = false;
  if (typeof process !== "undefined") {
    originalProcess = process;
    hadProcess = true;
  }
  try {
    client = await LammpsClient.create({ print: () => undefined, printErr: () => undefined });
  } finally {
    if (hadProcess) (globalThis as any).process = originalProcess;
    else delete (globalThis as any).process;
  }
  client.start();
  client.runInput("in.lj", script);
});

afterAll(() => {
  client?.dispose();
});

describe("LammpsClient helper", () => {
  it("exposes particle arrays", () => {
    const { count, positions } = client.syncParticles({ copy: true });
    expect(count).toBeGreaterThan(0);
    expect(positions).toBeInstanceOf(Float32Array);
  });

  it("supports wrapped particle data", () => {
    const wrapped = client.syncParticles({ wrapped: true, copy: true });
    expect(wrapped.count).toBeGreaterThan(0);
  });

  it("returns bond arrays", () => {
    const bonds = client.syncBonds({ wrapped: false, copy: true });
    expect(bonds.first.length).toBe(bonds.count * 3);
    expect(bonds.second.length).toBe(bonds.count * 3);
  });

  it("provides simulation box data", () => {
    const box = client.syncBox({ copy: true });
    expect(box.matrix.length).toBe(9);
    expect(box.origin.length).toBe(3);
    expect(box.lengths.length).toBe(3);
  });
});
