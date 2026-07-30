import { cloneAsciiPreset } from "./preset";
import type { AsciiEffectConfig, QualityTier } from "./types";

/**
 * The entry hero's board sampler.
 *
 * `BENJAMINS_DITHER_PRESET` is the published "All about the Benjamins" recipe
 * and stays byte-identical — the effect lab and its test depend on that. It is
 * tuned to look like a signal, not to be read, and three of its settings make
 * the entry hero illegible:
 *
 *   - `progressivePosition: 55` hides every cell where (x + y) / 2 > 0.55,
 *     which cuts roughly the bottom-right half of the field on a diagonal.
 *     That is the "sparse cells" in defect 4.
 *   - `tint: "#00ff66"` is a pure neon green that belongs to no theme in this
 *     product and fights the moss/parchment/brass palette.
 *   - `glitch` and `chromatic` displace cells, which is exactly the wrong
 *     trade when the point of the frame is that you can recognise the board.
 *
 * The tint and ground are resolved from the live theme rather than hardcoded,
 * so the board reads in Table, Classroom and Contrast.
 */

export const ENTRY_BOARD_CELL_SIZE = 7;

/** The coarse end of the load "resolve into focus" animation. */
export const ENTRY_BOARD_COARSE_CELL_SIZE = 34;

/**
 * A legibility floor. Lower quality tiers cap total cells, so the grid gets
 * coarser on weak hardware; coverage and contrast climb to compensate rather
 * than letting the board decay into noise.
 */
const QUALITY_FLOOR: Record<QualityTier, { coverage: number; contrast: number }> = {
  low: { coverage: 100, contrast: 132 },
  balanced: { coverage: 100, contrast: 124 },
  high: { coverage: 99, contrast: 118 },
};

export interface EntryBoardPresetOptions {
  /** Resolved theme accent used to tint the sampled cells. */
  readonly tint: string;
  /** Resolved theme ground the cells are drawn onto. */
  readonly background: string;
  readonly quality: QualityTier;
  readonly cellSize?: number;
  readonly reducedMotion?: boolean;
}

export function createEntryBoardPreset({
  tint,
  quality,
  cellSize = ENTRY_BOARD_CELL_SIZE,
  reducedMotion = false,
}: EntryBoardPresetOptions): AsciiEffectConfig {
  const config = cloneAsciiPreset();
  const floor = QUALITY_FLOOR[quality];

  // Desaturate first, then tint. Sampling the board's own colours produced a
  // confetti of red, teal and white cells that belonged to no theme and read
  // as noise; a single-hue field reads as one object, which is what the legacy
  // artwork did.
  config.grayscale = 100;
  config.saturation = 100;
  config.tint = tint;
  config.tintOpacity = 92;
  config.overlayBlend = "source-over";

  config.cellSize = cellSize;
  config.coverage = floor.coverage;
  config.contrast = floor.contrast;
  config.brightness = 26;
  config.edgeEmphasis = 68;

  // Render the whole board. The diagonal wipe is what made the frame read as
  // scattered noise rather than as a route.
  config.progressivePosition = 100;
  config.progressiveReverse = false;

  // Displacement effects trade legibility for texture. Keep the grain and the
  // vignette, which sit behind the cells; drop the ones that move them.
  config.pfx.glitch.enabled = false;
  config.pfx.chromatic.enabled = false;
  config.pfx.bloom.intensity = 34;
  config.pfx.filmGrain.intensity = 22;
  config.pfx.scanLines.intensity = 16;
  config.pfx.vignette.intensity = 30;

  // A slow settle rather than a flicker: this sits behind a form, and constant
  // movement behind controls is a defect in its own right.
  config.animated = !reducedMotion;
  config.animStyle = "pulse";
  config.animSpeed.intensity = 26;
  config.animIntensity.intensity = 22;

  return config;
}
