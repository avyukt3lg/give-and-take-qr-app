import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANIMATION_STYLES,
  BLUR_TYPES,
  RENDER_MODES,
  cloneAsciiPreset,
  renderAsciiFrame,
  type AnimationStyle,
  type AsciiEffectConfig,
  type BlurType,
  type PreparedRaster,
  type RasterCanvas,
  type RasterCell,
  type RasterContext,
  type RasterImageSource,
  type RenderMode,
} from "@/components/effects/ascii";

type PostEffectKey = keyof AsciiEffectConfig["pfx"];
type TraceEntry = readonly unknown[];

let trace: TraceEntry[] = [];
let canvasSequence = 0;
let gradientSequence = 0;

class RecordingGradient {
  readonly id = ++gradientSequence;

  addColorStop(offset: number, color: string): void {
    trace.push(["gradient-stop", this.id, rounded(offset), color]);
  }
}

const stateKeys = [
  "fillStyle",
  "strokeStyle",
  "globalAlpha",
  "globalCompositeOperation",
  "filter",
  "imageSmoothingEnabled",
  "font",
  "textAlign",
  "textBaseline",
  "lineWidth",
] as const;

function rounded(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
}

function normalized(value: unknown): unknown {
  if (typeof value === "number") return rounded(value);
  if (value instanceof RecordingCanvas) return `canvas:${value.id}`;
  if (value instanceof RecordingGradient) return `gradient:${value.id}`;
  return value;
}

function recordingContext(owner: RecordingCanvas): RasterContext {
  const target: Record<PropertyKey, unknown> = {
    canvas: owner,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    imageSmoothingEnabled: true,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    lineWidth: 1,
  };
  const stack: Array<Record<string, unknown>> = [];

  return new Proxy(target, {
    get(object, property) {
      if (property === "save") {
        return () => {
          stack.push(
            Object.fromEntries(stateKeys.map((key) => [key, object[key]])),
          );
          trace.push(["call", owner.id, "save"]);
        };
      }
      if (property === "restore") {
        return () => {
          const restored = stack.pop();
          if (restored) Object.assign(object, restored);
          trace.push(["call", owner.id, "restore"]);
        };
      }
      if (
        property === "createLinearGradient" ||
        property === "createRadialGradient"
      ) {
        return (...args: unknown[]) => {
          const gradient = new RecordingGradient();
          trace.push([
            "call",
            owner.id,
            String(property),
            gradient.id,
            ...args.map(normalized),
          ]);
          return gradient;
        };
      }
      if (Reflect.has(object, property)) return Reflect.get(object, property);
      return (...args: unknown[]) => {
        trace.push([
          "call",
          owner.id,
          String(property),
          ...args.map(normalized),
        ]);
      };
    },
    set(object, property, value) {
      Reflect.set(object, property, value);
      trace.push([
        "set",
        owner.id,
        String(property),
        normalized(value),
      ]);
      return true;
    },
  }) as unknown as RasterContext;
}

class RecordingCanvas {
  readonly id = ++canvasSequence;
  readonly context = recordingContext(this);

  constructor(
    public width: number,
    public height: number,
  ) {
    trace.push(["canvas", this.id, width, height]);
  }

  getContext(type: string): RasterContext | null {
    return type === "2d" ? this.context : null;
  }
}

const cells: readonly RasterCell[] = [
  {
    column: 0,
    row: 0,
    x: 0,
    y: 0,
    width: 12,
    height: 12,
    r: 28,
    g: 68,
    b: 42,
    a: 1,
    luminance: 0.2,
    edge: 0.12,
    upper: { r: 20, g: 54, b: 32, luminance: 0.15 },
    lower: { r: 36, g: 82, b: 52, luminance: 0.25 },
  },
  {
    column: 1,
    row: 0,
    x: 12,
    y: 0,
    width: 12,
    height: 12,
    r: 72,
    g: 146,
    b: 98,
    a: 0.92,
    luminance: 0.51,
    edge: 0.82,
    upper: { r: 62, g: 126, b: 84, luminance: 0.43 },
    lower: { r: 82, g: 166, b: 112, luminance: 0.58 },
  },
  {
    column: 0,
    row: 1,
    x: 0,
    y: 12,
    width: 12,
    height: 12,
    r: 168,
    g: 196,
    b: 92,
    a: 0.86,
    luminance: 0.73,
    edge: 0.44,
    upper: { r: 144, g: 176, b: 76, luminance: 0.64 },
    lower: { r: 192, g: 216, b: 108, luminance: 0.81 },
  },
  {
    column: 1,
    row: 1,
    x: 12,
    y: 12,
    width: 12,
    height: 12,
    r: 226,
    g: 242,
    b: 210,
    a: 1,
    luminance: 0.93,
    edge: 0.91,
    upper: { r: 210, g: 230, b: 194, luminance: 0.87 },
    lower: { r: 242, g: 252, b: 226, luminance: 0.97 },
  },
];

function cleanConfig(): AsciiEffectConfig {
  const config = cloneAsciiPreset();
  for (const effect of Object.values(config.pfx)) {
    effect.enabled = false;
    effect.intensity = 0;
  }
  config.bgMode = "solid";
  config.bgOpacity = 100;
  config.bgBlur = 0;
  config.tintOpacity = 0;
  config.blurType = "off";
  config.blurAmount = 0;
  config.coverage = 100;
  config.density = 0;
  config.edgeEmphasis = 0;
  config.progressivePosition = 100;
  config.progressiveReverse = false;
  config.directionalBothSides = false;
  config.animated = false;
  config.lights.enabled = false;
  config.lights.points = [];
  config.mask.enabled = false;
  return config;
}

function preparedRaster(): {
  prepared: PreparedRaster;
  target: RasterCanvas;
} {
  const source = new RecordingCanvas(24, 24) as unknown as RasterCanvas;
  return {
    target: new RecordingCanvas(24, 24) as unknown as RasterCanvas,
    prepared: {
      source,
      cells,
      width: 24,
      height: 24,
      cellSize: 12,
      columns: 2,
      rows: 2,
    },
  };
}

function fingerprint(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function frameFingerprint(
  mutate: (config: AsciiEffectConfig) => void,
  {
    time = 640,
    withMask = false,
  }: { time?: number; withMask?: boolean } = {},
): string {
  trace = [];
  canvasSequence = 0;
  gradientSequence = 0;
  const config = cleanConfig();
  mutate(config);
  const { prepared, target } = preparedRaster();
  const mask = withMask
    ? (new RecordingCanvas(24, 24) as unknown as RasterImageSource)
    : null;

  renderAsciiFrame(target, prepared, {
    config,
    solidBackground: "#080b09",
    time,
    seed: 0x47_49_56_45,
    mask,
  });

  return fingerprint(trace);
}

const POST_EFFECT_KEYS: readonly PostEffectKey[] = [
  "pixelate",
  "halftone",
  "bloom",
  "chromatic",
  "glitch",
  "scanLines",
  "filmGrain",
  "filmDust",
  "vignette",
];

beforeEach(() => {
  vi.stubGlobal(
    "OffscreenCanvas",
    RecordingCanvas as unknown as typeof OffscreenCanvas,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ASCII deterministic pipeline goldens", () => {
  it("locks the complete 25-mode registry to stable command fingerprints", () => {
    const goldens = Object.fromEntries(
      RENDER_MODES.map((mode) => [
        mode,
        frameFingerprint((config) => {
          config.renderMode = mode;
        }),
      ]),
    ) as Record<RenderMode, string>;

    expect(goldens).toEqual({
      characters: "092199bd",
      dither: "c2caa01a",
      mosaic: "d224584c",
      pixel: "d4cf6879",
      dots: "ecb1d2fd",
      cross: "5d213bc1",
      diamond: "a59d406d",
      voxel: "4b4beca0",
      lego: "cd62964f",
      mixed: "f80ddc6c",
      lines: "3781b2d6",
      diagonal: "38ae7e8c",
      braille: "66e2ec1c",
      disco: "ef8289e8",
      hexdump: "3d973181",
      matrix: "20942e70",
      rings: "fa2abd0d",
      hearts: "691d3e26",
      stars: "44e5ace4",
      hexagons: "17bca538",
      triangles: "bc87dec6",
      bubbles: "7176372b",
      hatch: "5cbe03bd",
      contour: "6fdee717",
      halfblocks: "00deff4a",
    });
  });

  it("locks the documented post-effect order to stable fingerprints", () => {
    const baseline = frameFingerprint((config) => {
      config.renderMode = "dots";
    });
    const goldens = Object.fromEntries(
      POST_EFFECT_KEYS.map((key) => [
        key,
        frameFingerprint((config) => {
          config.renderMode = "dots";
          config.pfx[key] = { enabled: true, intensity: 62 };
        }),
      ]),
    ) as Record<PostEffectKey, string>;

    expect(new Set(Object.values(goldens)).has(baseline)).toBe(false);
    expect(goldens).toEqual({
      pixelate: "0d612c35",
      halftone: "8f37547b",
      bloom: "f586cc08",
      chromatic: "d3326466",
      glitch: "a84e7961",
      scanLines: "9a20de97",
      filmGrain: "fedf1bad",
      filmDust: "e2804b82",
      vignette: "5852c0d9",
    });
  });

  it("locks every blur branch including focus gradients", () => {
    const goldens = Object.fromEntries(
      BLUR_TYPES.map((blurType) => [
        blurType,
        frameFingerprint((config) => {
          config.renderMode = "dots";
          config.blurType = blurType;
          config.blurAmount = blurType === "off" ? 0 : 58;
          config.blurAngle = 37;
          config.blurCenterX = 34;
          config.blurCenterY = 61;
          config.lensFocus = 42;
          config.tiltFocus = 31;
          config.tiltPosition = 57;
          config.tiltFeather = 18;
        }),
      ]),
    ) as Record<BlurType, string>;

    expect(goldens).toEqual({
      off: "ecb1d2fd",
      gaussian: "d06d1d61",
      directional: "1824caa0",
      radial: "d388aff7",
      lens: "eb28fb48",
      tilt: "4dc11d19",
    });
  });

  it("locks lights and both mask polarities after post processing", () => {
    const goldens = {
      lights: frameFingerprint((config) => {
        config.renderMode = "dots";
        config.lights = {
          enabled: true,
          points: [
            {
              x: 0.34,
              y: 0.58,
              radius: 0.42,
              intensity: 76,
              color: "#ffd36b",
            },
          ],
        };
      }),
      mask: frameFingerprint(
        (config) => {
          config.renderMode = "dots";
          config.mask.enabled = true;
          config.mask.invert = false;
        },
        { withMask: true },
      ),
      invertedMask: frameFingerprint(
        (config) => {
          config.renderMode = "dots";
          config.mask.enabled = true;
          config.mask.invert = true;
        },
        { withMask: true },
      ),
    };

    expect(goldens).toEqual({
      lights: "f86e81ad",
      mask: "8adc2fc2",
      invertedMask: "f96ba688",
    });
  });

  it("locks every animation style at two seeded timestamps", () => {
    const goldens = Object.fromEntries(
      ANIMATION_STYLES.map((style) => [
        style,
        [
          frameFingerprint(
            (config) => enableAnimation(config, style),
            { time: 137 },
          ),
          frameFingerprint(
            (config) => enableAnimation(config, style),
            { time: 913 },
          ),
        ],
      ]),
    ) as unknown as Record<AnimationStyle, readonly [string, string]>;

    for (const pair of Object.values(goldens)) {
      expect(pair[0]).not.toBe(pair[1]);
    }
    expect(goldens).toEqual({
      wave: ["4392447b", "c6c913f5"],
      pulse: ["ede4ca46", "a9344521"],
      shimmer: ["1ebe420a", "badd8fab"],
      ripple: ["c8a46831", "28c9f6ed"],
      flicker: ["f4771698", "0d3dfefa"],
    });
  });
});

function enableAnimation(
  config: AsciiEffectConfig,
  style: AnimationStyle,
): void {
  config.renderMode = "dots";
  config.animated = true;
  config.animStyle = style;
  config.animSpeed = { enabled: true, intensity: 83 };
  config.animIntensity = { enabled: true, intensity: 71 };
}
