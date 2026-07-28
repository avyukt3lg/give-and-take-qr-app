import type {
  AsciiEffectConfig,
  DeepReadonly,
  ReadonlyAsciiEffectConfig,
} from "./types";

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value as DeepReadonly<T>;
}

const preset: AsciiEffectConfig = {
  pfx: {
    bloom: {
      enabled: true,
      intensity: 60,
    },
    glitch: {
      enabled: true,
      intensity: 20,
    },
    filmDust: {
      enabled: false,
      intensity: 20,
    },
    halftone: {
      enabled: false,
      intensity: 20,
    },
    pixelate: {
      enabled: false,
      intensity: 15,
    },
    vignette: {
      enabled: true,
      intensity: 38,
    },
    chromatic: {
      enabled: true,
      intensity: 40,
    },
    filmGrain: {
      enabled: true,
      intensity: 40,
    },
    scanLines: {
      enabled: true,
      intensity: 28,
    },
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
  lights: {
    points: [],
    enabled: false,
  },
  charSet: "binary",
  density: 0,
  animated: true,
  blurType: "off",
  cellSize: 14,
  contrast: 115,
  coverage: 96,
  animSpeed: {
    enabled: true,
    intensity: 100,
  },
  animStyle: "flicker",
  bgOpacity: 90,
  blurAngle: 0,
  grayscale: 0,
  lensFocus: 40,
  tiltFocus: 35,
  toneCurve: [
    {
      x: 0,
      y: 0,
    },
    {
      x: 1,
      y: 1,
    },
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
  animIntensity: {
    enabled: true,
    intensity: 60,
  },
  progressiveReverse: false,
  progressivePosition: 55,
  directionalBothSides: false,
};

/**
 * The exact 21st-inspired “All about the Benjamins” recipe supplied for this
 * project. It is recursively frozen so development controls can never mutate
 * the production preset by reference.
 */
export const BENJAMINS_DITHER_PRESET: ReadonlyAsciiEffectConfig =
  deepFreeze(preset);

export const cloneAsciiPreset = (): AsciiEffectConfig =>
  structuredClone(BENJAMINS_DITHER_PRESET) as AsciiEffectConfig;
