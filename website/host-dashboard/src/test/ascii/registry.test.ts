import { describe, expect, it } from "vitest";

import {
  BENJAMINS_DITHER_PRESET,
  RENDER_MODES,
  RENDER_MODE_REGISTRY,
  assertCompleteRendererRegistry,
  type RasterCell,
} from "../../components/effects/ascii";
import type { PrimitiveInput } from "../../components/effects/ascii/renderers";
import type { RasterContext } from "../../components/effects/ascii/types";

const cell: RasterCell = {
  column: 2,
  row: 3,
  x: 20,
  y: 30,
  width: 10,
  height: 10,
  r: 42,
  g: 180,
  b: 104,
  a: 1,
  luminance: 0.56,
  edge: 0.3,
  upper: { r: 30, g: 150, b: 80, luminance: 0.46 },
  lower: { r: 60, g: 210, b: 120, luminance: 0.67 },
};

function recordingContext(trace: unknown[]): RasterContext {
  const target: Record<PropertyKey, unknown> = {};
  return new Proxy(target, {
    get(_object, property) {
      if (property in target) return target[property];
      return (...args: unknown[]) => {
        trace.push(["call", String(property), ...args]);
      };
    },
    set(_object, property, value) {
      target[property] = value;
      trace.push(["set", String(property), value]);
      return true;
    },
  }) as unknown as RasterContext;
}

function renderTrace(mode: (typeof RENDER_MODES)[number]): unknown[] {
  const trace: unknown[] = [];
  const input: PrimitiveInput = {
    context: recordingContext(trace),
    cell,
    centerX: 25,
    centerY: 35,
    width: 10,
    height: 10,
    size: 9,
    luminance: 0.95,
    color: "rgb(42 180 104)",
    opacity: 0.9,
    time: 1_600,
    seed: 0x47495645,
    config: BENJAMINS_DITHER_PRESET,
    columns: 8,
    rows: 8,
    luminanceAt: (column, row) => ((column + row) % 7) / 6,
  };
  RENDER_MODE_REGISTRY[mode](input);
  return trace;
}

describe("ASCII renderer registry", () => {
  it("contains exactly the 25 requested render modes", () => {
    expect(RENDER_MODES).toHaveLength(25);
    expect(Object.keys(RENDER_MODE_REGISTRY).sort()).toEqual(
      [...RENDER_MODES].sort(),
    );
    expect(assertCompleteRendererRegistry).not.toThrow();
  });

  it.each(RENDER_MODES)("%s emits deterministic drawing commands", (mode) => {
    const first = renderTrace(mode);
    const second = renderTrace(mode);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});
