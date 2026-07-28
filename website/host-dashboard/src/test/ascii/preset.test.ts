import { describe, expect, it } from "vitest";

import {
  AsciiEffectConfigSchema,
  BENJAMINS_DITHER_PRESET,
  cloneAsciiPreset,
} from "../../components/effects/ascii";

const expectedRecipe = {
  pfx: {
    bloom: { enabled: true, intensity: 60 },
    glitch: { enabled: true, intensity: 20 },
    filmDust: { enabled: false, intensity: 20 },
    halftone: { enabled: false, intensity: 20 },
    pixelate: { enabled: false, intensity: 15 },
    vignette: { enabled: true, intensity: 38 },
    chromatic: { enabled: true, intensity: 40 },
    filmGrain: { enabled: true, intensity: 40 },
    scanLines: { enabled: true, intensity: 28 },
  },
  mask: {
    tool: "freehand",
    invert: false,
    shapes: [],
    dataUrl: null,
    enabled: false,
    brushSize: 30,
    showOverlay: false,
  },
  tint: "#00ff66",
  bgBlur: 12,
  bgMode: "solid",
  invert: false,
  lights: { points: [], enabled: false },
  charSet: "binary",
  density: 0,
  animated: true,
  blurType: "off",
  cellSize: 14,
  contrast: 115,
  coverage: 96,
  animSpeed: { enabled: true, intensity: 100 },
  animStyle: "flicker",
  bgOpacity: 90,
  blurAngle: 0,
  grayscale: 0,
  lensFocus: 40,
  tiltFocus: 35,
  toneCurve: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  blurAmount: 35,
  brightness: 0,
  renderMode: "dither",
  saturation: 100,
  styleBlend: "source-over",
  blurCenterX: 50,
  blurCenterY: 50,
  customChars: "",
  tiltFeather: 15,
  tintOpacity: 45,
  edgeEmphasis: 40,
  overlayBlend: "overlay",
  tiltPosition: 50,
  animIntensity: { enabled: true, intensity: 60 },
  progressiveReverse: false,
  progressivePosition: 55,
  directionalBothSides: false,
};

describe("BENJAMINS_DITHER_PRESET", () => {
  it("matches the supplied recipe exactly and passes runtime validation", () => {
    expect(BENJAMINS_DITHER_PRESET).toEqual(expectedRecipe);
    expect(() => AsciiEffectConfigSchema.parse(BENJAMINS_DITHER_PRESET)).not
      .toThrow();
  });

  it("is recursively immutable while clones remain editor-safe", () => {
    expect(Object.isFrozen(BENJAMINS_DITHER_PRESET)).toBe(true);
    expect(Object.isFrozen(BENJAMINS_DITHER_PRESET.pfx)).toBe(true);
    expect(Object.isFrozen(BENJAMINS_DITHER_PRESET.toneCurve)).toBe(true);
    expect(Object.isFrozen(BENJAMINS_DITHER_PRESET.toneCurve[0])).toBe(true);

    const clone = cloneAsciiPreset();
    clone.coverage = 80;
    clone.pfx.bloom.enabled = false;
    expect(clone.coverage).toBe(80);
    expect(BENJAMINS_DITHER_PRESET.coverage).toBe(96);
    expect(BENJAMINS_DITHER_PRESET.pfx.bloom.enabled).toBe(true);
  });
});
