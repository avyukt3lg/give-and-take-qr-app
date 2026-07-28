import { z } from "zod";

export const RENDER_MODES = [
  "characters",
  "dither",
  "mosaic",
  "pixel",
  "dots",
  "cross",
  "diamond",
  "voxel",
  "lego",
  "mixed",
  "lines",
  "diagonal",
  "braille",
  "disco",
  "hexdump",
  "matrix",
  "rings",
  "hearts",
  "stars",
  "hexagons",
  "triangles",
  "bubbles",
  "hatch",
  "contour",
  "halfblocks",
] as const;

export const ANIMATION_STYLES = [
  "wave",
  "pulse",
  "shimmer",
  "ripple",
  "flicker",
] as const;

export const BACKGROUND_MODES = [
  "blurred",
  "solid",
  "original",
  "none",
] as const;

export const BLUR_TYPES = [
  "off",
  "gaussian",
  "directional",
  "radial",
  "lens",
  "tilt",
] as const;

export const BLEND_MODES = [
  "source-over",
  "source-in",
  "source-out",
  "source-atop",
  "destination-over",
  "destination-in",
  "destination-out",
  "destination-atop",
  "lighter",
  "copy",
  "xor",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

const percentage = z.number().finite().min(0).max(100);
const normalized = z.number().finite().min(0).max(1);

export const EffectToggleSchema = z
  .object({
    enabled: z.boolean(),
    intensity: percentage,
  })
  .strict();

export const PostEffectsSchema = z
  .object({
    bloom: EffectToggleSchema,
    glitch: EffectToggleSchema,
    filmDust: EffectToggleSchema,
    halftone: EffectToggleSchema,
    pixelate: EffectToggleSchema,
    vignette: EffectToggleSchema,
    chromatic: EffectToggleSchema,
    filmGrain: EffectToggleSchema,
    scanLines: EffectToggleSchema,
  })
  .strict();

export const MaskSchema = z
  .object({
    tool: z.string(),
    invert: z.boolean(),
    shapes: z.array(z.unknown()),
    dataUrl: z.string().nullable(),
    enabled: z.boolean(),
    brushSize: z.number().finite().positive(),
    showOverlay: z.boolean(),
  })
  .strict();

export const LightPointSchema = z
  .object({
    x: normalized,
    y: normalized,
    radius: z.number().finite().positive(),
    intensity: percentage,
    color: z.string().optional(),
  })
  .strict();

export const LightsSchema = z
  .object({
    points: z.array(LightPointSchema),
    enabled: z.boolean(),
  })
  .strict();

export const TonePointSchema = z
  .object({
    x: normalized,
    y: normalized,
  })
  .strict();

export const AsciiEffectConfigSchema = z
  .object({
    pfx: PostEffectsSchema,
    mask: MaskSchema,
    tint: z.string(),
    bgBlur: z.number().finite().min(0).max(100),
    bgMode: z.enum(BACKGROUND_MODES),
    invert: z.boolean(),
    lights: LightsSchema,
    charSet: z.string(),
    density: z.number().finite().min(-100).max(100),
    animated: z.boolean(),
    blurType: z.enum(BLUR_TYPES),
    cellSize: z.number().finite().min(2).max(128),
    contrast: z.number().finite().min(0).max(300),
    coverage: percentage,
    animSpeed: EffectToggleSchema,
    animStyle: z.enum(ANIMATION_STYLES),
    bgOpacity: percentage,
    blurAngle: z.number().finite().min(-360).max(360),
    grayscale: percentage,
    lensFocus: percentage,
    tiltFocus: percentage,
    toneCurve: z.array(TonePointSchema).min(2),
    blurAmount: z.number().finite().min(0).max(100),
    brightness: z.number().finite().min(-100).max(100),
    renderMode: z.enum(RENDER_MODES),
    saturation: z.number().finite().min(0).max(300),
    styleBlend: z.enum(BLEND_MODES),
    blurCenterX: percentage,
    blurCenterY: percentage,
    customChars: z.string(),
    tiltFeather: percentage,
    tintOpacity: percentage,
    edgeEmphasis: percentage,
    overlayBlend: z.enum(BLEND_MODES),
    tiltPosition: percentage,
    animIntensity: EffectToggleSchema,
    progressiveReverse: z.boolean(),
    progressivePosition: percentage,
    directionalBothSides: z.boolean(),
  })
  .strict();

export type RenderMode = (typeof RENDER_MODES)[number];
export type AnimationStyle = (typeof ANIMATION_STYLES)[number];
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];
export type BlurType = (typeof BLUR_TYPES)[number];
export type BlendMode = (typeof BLEND_MODES)[number];
export type AsciiEffectConfig = z.infer<typeof AsciiEffectConfigSchema>;
export type LightPoint = z.infer<typeof LightPointSchema>;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type ReadonlyAsciiEffectConfig = DeepReadonly<AsciiEffectConfig>;

export interface RasterCell {
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  readonly luminance: number;
  readonly edge: number;
  readonly upper: {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly luminance: number;
  };
  readonly lower: {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly luminance: number;
  };
}

export type RasterCanvas = HTMLCanvasElement | OffscreenCanvas;
export type RasterContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type RasterImageSource =
  | HTMLImageElement
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas;

export type ObjectFit = "cover" | "contain" | "fill";
export type ObjectPosition = readonly [number, number];

export interface RasterQuality {
  readonly dprCap: number;
  readonly maxCells: number;
  readonly fps: number;
}

export const QUALITY_TIERS = {
  low: { dprCap: 1, maxCells: 4_500, fps: 15 },
  balanced: { dprCap: 1.25, maxCells: 8_000, fps: 18 },
  high: { dprCap: 1.5, maxCells: 12_000, fps: 24 },
} as const satisfies Record<string, RasterQuality>;

export type QualityTier = keyof typeof QUALITY_TIERS;

export interface PreparedRaster {
  readonly source: RasterCanvas;
  readonly cells: readonly RasterCell[];
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
}

export interface AsciiRenderOptions {
  readonly config: ReadonlyAsciiEffectConfig;
  readonly solidBackground: string;
  readonly time: number;
  readonly seed: number;
  readonly mask?: RasterImageSource | null;
}
