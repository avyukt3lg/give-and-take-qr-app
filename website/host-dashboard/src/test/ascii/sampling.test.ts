import { describe, expect, it } from "vitest";

import {
  BENJAMINS_DITHER_PRESET,
  calculateFittedRect,
  calculateMotionTransform,
  cloneAsciiPreset,
  evaluateToneCurve,
  hash32,
  sampleRasterCells,
  seededUnit,
  shouldRenderCell,
  type RasterCell,
} from "../../components/effects/ascii";

const makeImage = (): ImageData =>
  ({
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]),
  }) as ImageData;

const cell: RasterCell = {
  column: 4,
  row: 6,
  x: 40,
  y: 60,
  width: 10,
  height: 10,
  r: 80,
  g: 160,
  b: 100,
  a: 1,
  luminance: 0.5,
  edge: 0.4,
  upper: { r: 70, g: 140, b: 90, luminance: 0.44 },
  lower: { r: 90, g: 180, b: 110, luminance: 0.56 },
};

describe("ASCII sampling and deterministic motion", () => {
  it("samples stable averages and separate upper/lower detail", () => {
    const first = sampleRasterCells(makeImage(), 2, 10);
    const second = sampleRasterCells(makeImage(), 2, 10);
    expect(second).toEqual(first);
    expect(first.cells).toHaveLength(1);
    const sampled = first.cells[0]!;
    expect(sampled.r).toBeCloseTo(127.5);
    expect(sampled.g).toBeCloseTo(127.5);
    expect(sampled.b).toBeCloseTo(127.5);
    expect(sampled.upper.g).toBeCloseTo(127.5);
    expect(sampled.lower.b).toBeCloseTo(255);
  });

  it("keeps fitted geometry deterministic for cover and contain", () => {
    expect(calculateFittedRect(100, 50, 100, 100, "cover", [0.5, 0.5]))
      .toEqual({ x: -50, y: 0, width: 200, height: 100 });
    expect(calculateFittedRect(100, 50, 100, 100, "contain", [0.5, 0.5]))
      .toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });

  it("uses repeatable seeded coverage rather than frame-to-frame popping", () => {
    const config = cloneAsciiPreset();
    config.coverage = 50;
    const values = Array.from({ length: 20 }, (_, index) =>
      shouldRenderCell({ ...cell, column: index }, config, 42),
    );
    expect(
      Array.from({ length: 20 }, (_, index) =>
        shouldRenderCell({ ...cell, column: index }, config, 42),
      ),
    ).toEqual(values);
    expect(values.some(Boolean)).toBe(true);
    expect(values.some((value) => !value)).toBe(true);
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(seededUnit(9, 8, 7)).toBeGreaterThanOrEqual(0);
    expect(seededUnit(9, 8, 7)).toBeLessThan(1);
  });

  it("interpolates tone curves and freezes motion when animation is disabled", () => {
    expect(
      evaluateToneCurve(0.25, [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.8 },
        { x: 1, y: 1 },
      ]),
    ).toBeCloseTo(0.4);

    const config = cloneAsciiPreset();
    config.animated = false;
    expect(
      calculateMotionTransform(
        cell,
        { width: 100, height: 100 },
        config,
        10_000,
        42,
      ),
    ).toEqual({ offsetX: 0, offsetY: 0, scale: 1, opacity: 1 });
  });

  it("changes seeded flicker no more than 2.5 times per second", () => {
    const at399 = calculateMotionTransform(
      cell,
      { width: 100, height: 100 },
      BENJAMINS_DITHER_PRESET,
      399,
      42,
    );
    const at1 = calculateMotionTransform(
      cell,
      { width: 100, height: 100 },
      BENJAMINS_DITHER_PRESET,
      1,
      42,
    );
    const at400 = calculateMotionTransform(
      cell,
      { width: 100, height: 100 },
      BENJAMINS_DITHER_PRESET,
      400,
      42,
    );
    expect(at399).toEqual(at1);
    expect(at400.opacity).not.toBe(at399.opacity);
  });
});
