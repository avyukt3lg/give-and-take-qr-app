import { RENDER_MODE_REGISTRY } from "./renderers";
import {
  adjustCellColor,
  clamp,
  createRasterCanvas,
  drawFittedSource,
  effectiveLuminance,
  getRasterContext,
  hash32,
  passesProgressiveReveal,
  prepareRaster,
  seededUnit,
  shouldRenderCell,
} from "./sampling";
import {
  AsciiEffectConfigSchema,
  QUALITY_TIERS,
  type AsciiEffectConfig,
  type AsciiRenderOptions,
  type ObjectFit,
  type ObjectPosition,
  type PreparedRaster,
  type QualityTier,
  type RasterCanvas,
  type RasterCell,
  type RasterContext,
  type RasterImageSource,
  type ReadonlyAsciiEffectConfig,
} from "./types";

export const DEFAULT_RENDER_SEED = 0x47_49_56_45;
const TAU = Math.PI * 2;

const resizeCanvas = (
  canvas: RasterCanvas,
  width: number,
  height: number,
): void => {
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
};

const cloneCanvas = (source: RasterCanvas): RasterCanvas => {
  const clone = createRasterCanvas(source.width, source.height);
  getRasterContext(clone).drawImage(source, 0, 0);
  return clone;
};

const rgb = (red: number, green: number, blue: number): string =>
  `rgb(${Math.round(clamp(red, 0, 255))} ${Math.round(clamp(green, 0, 255))} ${Math.round(clamp(blue, 0, 255))})`;

function renderBackground(
  context: RasterContext,
  prepared: PreparedRaster,
  config: ReadonlyAsciiEffectConfig,
  solidBackground: string,
): void {
  const { width, height } = prepared;
  context.clearRect(0, 0, width, height);
  context.save();
  context.globalAlpha = config.bgOpacity / 100;

  switch (config.bgMode) {
    case "solid":
      context.fillStyle = solidBackground;
      context.fillRect(0, 0, width, height);
      break;
    case "original":
      context.drawImage(prepared.source, 0, 0);
      break;
    case "blurred": {
      const blur = config.bgBlur;
      context.filter = `blur(${blur}px)`;
      const overscan = blur * 2;
      context.drawImage(
        prepared.source,
        -overscan,
        -overscan,
        width + overscan * 2,
        height + overscan * 2,
      );
      context.filter = "none";
      break;
    }
    case "none":
      break;
  }

  context.restore();
}

interface MotionTransform {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly opacity: number;
}

export function calculateMotionTransform(
  cell: RasterCell,
  prepared: Pick<PreparedRaster, "width" | "height">,
  config: ReadonlyAsciiEffectConfig,
  time: number,
  seed: number,
): MotionTransform {
  if (
    !config.animated ||
    !config.animSpeed.enabled ||
    !config.animIntensity.enabled
  ) {
    return { offsetX: 0, offsetY: 0, scale: 1, opacity: 1 };
  }

  const speed = 0.25 + (config.animSpeed.intensity / 100) * 1.75;
  const intensity = config.animIntensity.intensity / 100;
  const seconds = time / 1_000;
  const normalizedX = (cell.x + cell.width / 2) / prepared.width;
  const normalizedY = (cell.y + cell.height / 2) / prepared.height;
  const phase = seconds * speed * TAU;

  switch (config.animStyle) {
    case "wave":
      return {
        offsetX: 0,
        offsetY:
          Math.sin(phase + normalizedX * TAU * 1.7) *
          cell.height *
          0.22 *
          intensity,
        scale: 1,
        opacity: 1,
      };
    case "pulse":
      return {
        offsetX: 0,
        offsetY: 0,
        scale:
          1 +
          Math.sin(phase + (normalizedX + normalizedY) * Math.PI) *
            0.22 *
            intensity,
        opacity: 1,
      };
    case "shimmer": {
      const band = Math.sin(
        (normalizedX * 1.4 + normalizedY * 0.45) * TAU - phase,
      );
      return {
        offsetX: 0,
        offsetY: 0,
        scale: 1 + Math.max(0, band) * 0.08 * intensity,
        opacity: clamp(0.72 + (band + 1) * 0.14 * intensity, 0.45, 1),
      };
    }
    case "ripple": {
      const dx = normalizedX - config.blurCenterX / 100;
      const dy = normalizedY - config.blurCenterY / 100;
      const distance = Math.hypot(dx, dy);
      const ripple = Math.sin(distance * TAU * 4 - phase * 1.35);
      const strength = ripple * intensity * cell.width * 0.12;
      const safeDistance = Math.max(0.001, distance);
      return {
        offsetX: (dx / safeDistance) * strength,
        offsetY: (dy / safeDistance) * strength,
        scale: 1 + ripple * 0.08 * intensity,
        opacity: 1,
      };
    }
    case "flicker": {
      // 400 ms buckets cap random state changes at 2.5 flashes per second.
      const frame = Math.floor(time / 400);
      const random = seededUnit(
        seed,
        cell.column,
        cell.row,
        frame,
        0x66_6c_69_63,
      );
      return {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        opacity: clamp(1 - random * 0.5 * intensity, 0.42, 1),
      };
    }
  }
}

function renderPrimitives(
  prepared: PreparedRaster,
  config: ReadonlyAsciiEffectConfig,
  time: number,
  seed: number,
): RasterCanvas {
  const layer = createRasterCanvas(prepared.width, prepared.height);
  const context = getRasterContext(layer);
  context.globalCompositeOperation = config.styleBlend;
  const renderer = RENDER_MODE_REGISTRY[config.renderMode];
  const adjusted = prepared.cells.map((cell) => adjustCellColor(cell, config));
  const luminances = adjusted.map((color, index) =>
    effectiveLuminance(prepared.cells[index]!, color.luminance, config),
  );
  const densityScale = clamp(1 + config.density / 100, 0.2, 1.8);
  const luminanceAt = (column: number, row: number): number => {
    const safeColumn = Math.max(0, Math.min(prepared.columns - 1, column));
    const safeRow = Math.max(0, Math.min(prepared.rows - 1, row));
    return luminances[safeRow * prepared.columns + safeColumn] ?? 0;
  };

  for (let index = 0; index < prepared.cells.length; index += 1) {
    const cell = prepared.cells[index]!;
    if (!shouldRenderCell(cell, config, seed)) continue;
    if (!passesProgressiveReveal(cell, prepared, config)) continue;

    const color = adjusted[index]!;
    const luminance = luminances[index] ?? 0;
    const motion = calculateMotionTransform(cell, prepared, config, time, seed);
    const baseSize = Math.min(cell.width, cell.height) * densityScale;
    const centerX = cell.x + cell.width / 2 + motion.offsetX;
    const centerY = cell.y + cell.height / 2 + motion.offsetY;
    const opacity = clamp(cell.a * motion.opacity);

    context.save();
    renderer({
      context,
      cell,
      centerX,
      centerY,
      width: cell.width,
      height: cell.height,
      size: baseSize * motion.scale,
      luminance,
      color: rgb(color.r, color.g, color.b),
      opacity,
      time,
      seed,
      config,
      columns: prepared.columns,
      rows: prepared.rows,
      luminanceAt,
    });
    context.restore();
  }

  return layer;
}

function applyTint(
  layer: RasterCanvas,
  config: ReadonlyAsciiEffectConfig,
): void {
  if (config.tintOpacity <= 0) return;
  const alphaMask = cloneCanvas(layer);
  const context = getRasterContext(layer);
  context.save();
  context.globalCompositeOperation = config.overlayBlend;
  context.globalAlpha = config.tintOpacity / 100;
  context.fillStyle = config.tint;
  context.fillRect(0, 0, layer.width, layer.height);
  context.globalCompositeOperation = "destination-in";
  context.globalAlpha = 1;
  context.drawImage(alphaMask, 0, 0);
  context.restore();
}

function gaussianBlur(source: RasterCanvas, amount: number): RasterCanvas {
  if (amount <= 0) return cloneCanvas(source);
  const result = createRasterCanvas(source.width, source.height);
  const context = getRasterContext(result);
  context.filter = `blur(${amount}px)`;
  const overscan = amount * 1.5;
  context.drawImage(
    source,
    -overscan,
    -overscan,
    source.width + overscan * 2,
    source.height + overscan * 2,
  );
  context.filter = "none";
  return result;
}

function directionalBlur(
  source: RasterCanvas,
  amount: number,
  angle: number,
): RasterCanvas {
  const result = createRasterCanvas(source.width, source.height);
  const context = getRasterContext(result);
  const samples = Math.max(3, Math.min(18, Math.ceil(amount / 2)));
  const radians = (angle * Math.PI) / 180;
  context.globalAlpha = 1 / samples;
  for (let sample = 0; sample < samples; sample += 1) {
    const progress = sample / Math.max(1, samples - 1) - 0.5;
    context.drawImage(
      source,
      Math.cos(radians) * progress * amount,
      Math.sin(radians) * progress * amount,
    );
  }
  return result;
}

function focusBlur(
  source: RasterCanvas,
  blurred: RasterCanvas,
  config: ReadonlyAsciiEffectConfig,
  mode: "radial" | "lens" | "tilt",
): RasterCanvas {
  const result = cloneCanvas(blurred);
  const sharp = cloneCanvas(source);
  const sharpContext = getRasterContext(sharp);
  sharpContext.globalCompositeOperation = "destination-in";
  let gradient: CanvasGradient;

  if (mode === "tilt") {
    const center = (config.tiltPosition / 100) * source.height;
    const focus = (config.tiltFocus / 100) * source.height * 0.5;
    const feather = Math.max(
      1,
      (config.tiltFeather / 100) * source.height * 0.5,
    );
    gradient = sharpContext.createLinearGradient(0, 0, 0, source.height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(
      clamp((center - focus - feather) / source.height),
      "rgba(0,0,0,0)",
    );
    gradient.addColorStop(
      clamp((center - focus) / source.height),
      "rgba(0,0,0,1)",
    );
    gradient.addColorStop(
      clamp((center + focus) / source.height),
      "rgba(0,0,0,1)",
    );
    gradient.addColorStop(
      clamp((center + focus + feather) / source.height),
      "rgba(0,0,0,0)",
    );
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    const centerX = (config.blurCenterX / 100) * source.width;
    const centerY = (config.blurCenterY / 100) * source.height;
    const maximum = Math.hypot(source.width, source.height) * 0.5;
    const focus =
      (mode === "lens" ? config.lensFocus : config.tiltFocus) / 100;
    const inner = maximum * focus * 0.55;
    const outer = Math.max(inner + 1, inner + maximum * 0.22);
    gradient = sharpContext.createRadialGradient(
      centerX,
      centerY,
      inner,
      centerX,
      centerY,
      outer,
    );
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  }

  sharpContext.fillStyle = gradient;
  sharpContext.fillRect(0, 0, source.width, source.height);
  getRasterContext(result).drawImage(sharp, 0, 0);
  return result;
}

function applyBlur(
  source: RasterCanvas,
  config: ReadonlyAsciiEffectConfig,
): RasterCanvas {
  if (config.blurType === "off" || config.blurAmount <= 0) {
    return source;
  }

  const amount = (config.blurAmount / 100) * 24;
  if (config.blurType === "directional") {
    return directionalBlur(source, amount, config.blurAngle);
  }

  const blurred = gaussianBlur(source, amount);
  if (
    config.blurType === "radial" ||
    config.blurType === "lens" ||
    config.blurType === "tilt"
  ) {
    return focusBlur(source, blurred, config, config.blurType);
  }

  return blurred;
}

function applyPixelate(target: RasterCanvas, intensity: number): void {
  const context = getRasterContext(target);
  const scale = clamp(1 - intensity / 112, 0.08, 0.96);
  const smallWidth = Math.max(1, Math.round(target.width * scale));
  const smallHeight = Math.max(1, Math.round(target.height * scale));
  const small = createRasterCanvas(smallWidth, smallHeight);
  const smallContext = getRasterContext(small);
  smallContext.imageSmoothingEnabled = false;
  smallContext.drawImage(target, 0, 0, smallWidth, smallHeight);
  context.save();
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(small, 0, 0, target.width, target.height);
  context.restore();
}

function applyHalftone(target: RasterCanvas, intensity: number): void {
  const context = getRasterContext(target);
  const spacing = Math.max(4, 14 - Math.round(intensity / 10));
  const radius = Math.max(0.5, (spacing * intensity) / 260);
  context.save();
  context.globalCompositeOperation = "multiply";
  context.fillStyle = "rgba(0,0,0,0.75)";
  for (let y = spacing / 2; y < target.height; y += spacing) {
    for (let x = spacing / 2; x < target.width; x += spacing) {
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
    }
  }
  context.restore();
}

function applyBloom(target: RasterCanvas, intensity: number): void {
  const context = getRasterContext(target);
  const snapshot = cloneCanvas(target);
  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = (intensity / 100) * 0.65;
  context.filter = `blur(${2 + intensity * 0.12}px) brightness(1.2)`;
  context.drawImage(snapshot, 0, 0);
  context.filter = "none";
  context.restore();
}

function tintedSnapshot(
  source: RasterCanvas,
  color: string,
): RasterCanvas {
  const result = cloneCanvas(source);
  const context = getRasterContext(result);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, result.width, result.height);
  return result;
}

function applyChromatic(target: RasterCanvas, intensity: number): void {
  const context = getRasterContext(target);
  const snapshot = cloneCanvas(target);
  const red = tintedSnapshot(snapshot, "#ff2448");
  const cyan = tintedSnapshot(snapshot, "#00d9ff");
  const offset = Math.max(1, intensity * 0.055);
  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.12 + (intensity / 100) * 0.24;
  context.drawImage(red, -offset, 0);
  context.drawImage(cyan, offset, 0);
  context.restore();
}

function applyGlitch(
  target: RasterCanvas,
  intensity: number,
  time: number,
  seed: number,
): void {
  const context = getRasterContext(target);
  const snapshot = cloneCanvas(target);
  const frame = Math.floor(time / 400);
  const slices = Math.max(1, Math.round(intensity / 12));
  context.save();
  for (let slice = 0; slice < slices; slice += 1) {
    const unitY = seededUnit(seed, frame, slice, 0x67_6c_69);
    const unitHeight = seededUnit(seed, frame, slice, 0x68_67_74);
    const y = Math.floor(unitY * target.height);
    const height = Math.max(1, Math.round(2 + unitHeight * intensity * 0.45));
    const offset =
      (seededUnit(seed, frame, slice, 0x6f_66_66) - 0.5) *
      intensity *
      0.8;
    context.globalAlpha = 0.3 + intensity / 180;
    context.drawImage(
      snapshot,
      0,
      y,
      target.width,
      height,
      offset,
      y,
      target.width,
      height,
    );
  }
  context.restore();
}

function applyScanLines(target: RasterCanvas, intensity: number): void {
  const context = getRasterContext(target);
  const spacing = Math.max(3, Math.round(8 - intensity / 20));
  context.save();
  context.globalCompositeOperation = "multiply";
  context.fillStyle = `rgba(0,0,0,${0.08 + (intensity / 100) * 0.24})`;
  for (let y = 0; y < target.height; y += spacing) {
    context.fillRect(0, y, target.width, 1);
  }
  context.restore();
}

function applyFilmGrain(
  target: RasterCanvas,
  intensity: number,
  time: number,
  seed: number,
): void {
  const context = getRasterContext(target);
  const frame = Math.floor(time / 160);
  const count = Math.min(
    8_000,
    Math.round((target.width * target.height * intensity) / 15_000),
  );
  context.save();
  for (let index = 0; index < count; index += 1) {
    const x = seededUnit(seed, frame, index, 0x67_72_78) * target.width;
    const y = seededUnit(seed, frame, index, 0x67_72_79) * target.height;
    const white = seededUnit(seed, frame, index, 0x67_72_63) > 0.5;
    context.globalAlpha = (intensity / 100) * 0.12;
    context.fillStyle = white ? "#fff" : "#000";
    context.fillRect(x, y, 1, 1);
  }
  context.restore();
}

function applyFilmDust(
  target: RasterCanvas,
  intensity: number,
  time: number,
  seed: number,
): void {
  const context = getRasterContext(target);
  const frame = Math.floor(time / 1_200);
  const count = Math.max(1, Math.round(intensity / 9));
  context.save();
  context.strokeStyle = "rgba(255,248,220,0.55)";
  context.fillStyle = "rgba(255,248,220,0.5)";
  for (let index = 0; index < count; index += 1) {
    const x = seededUnit(seed, frame, index, 0x64_75_78) * target.width;
    const y = seededUnit(seed, frame, index, 0x64_75_79) * target.height;
    const length =
      (2 + seededUnit(seed, frame, index, 0x64_75_6c) * 24) *
      (intensity / 100);
    context.globalAlpha = 0.12 + intensity / 240;
    if (index % 3 === 0) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length * 0.2, y + length);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(x, y, Math.max(0.5, length * 0.08), 0, TAU);
      context.fill();
    }
  }
  context.restore();
}

function applyVignette(target: RasterCanvas, intensity: number): void {
  const context = getRasterContext(target);
  const centerX = target.width / 2;
  const centerY = target.height / 2;
  const radius = Math.hypot(centerX, centerY);
  const gradient = context.createRadialGradient(
    centerX,
    centerY,
    radius * 0.2,
    centerX,
    centerY,
    radius,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(
    1,
    `rgba(0,0,0,${0.18 + (intensity / 100) * 0.72})`,
  );
  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, 0, target.width, target.height);
  context.restore();
}

function applyPostEffects(
  target: RasterCanvas,
  config: ReadonlyAsciiEffectConfig,
  time: number,
  seed: number,
): void {
  const { pfx } = config;
  if (pfx.pixelate.enabled) applyPixelate(target, pfx.pixelate.intensity);
  if (pfx.halftone.enabled) applyHalftone(target, pfx.halftone.intensity);
  if (pfx.bloom.enabled) applyBloom(target, pfx.bloom.intensity);
  if (pfx.chromatic.enabled) applyChromatic(target, pfx.chromatic.intensity);
  if (pfx.glitch.enabled)
    applyGlitch(target, pfx.glitch.intensity, time, seed);
  if (pfx.scanLines.enabled) applyScanLines(target, pfx.scanLines.intensity);
  if (pfx.filmGrain.enabled)
    applyFilmGrain(target, pfx.filmGrain.intensity, time, seed);
  if (pfx.filmDust.enabled)
    applyFilmDust(target, pfx.filmDust.intensity, time, seed);
  if (pfx.vignette.enabled) applyVignette(target, pfx.vignette.intensity);
}

function applyLights(
  target: RasterCanvas,
  config: ReadonlyAsciiEffectConfig,
): void {
  if (!config.lights.enabled || config.lights.points.length === 0) return;
  const context = getRasterContext(target);
  context.save();
  context.globalCompositeOperation = "screen";
  for (const point of config.lights.points) {
    const x = point.x * target.width;
    const y = point.y * target.height;
    const radius =
      point.radius <= 1
        ? point.radius * Math.max(target.width, target.height)
        : point.radius;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const color = point.color ?? config.tint;
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.globalAlpha = point.intensity / 100;
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.restore();
}

function revealPlainPhoto(
  target: RasterCanvas,
  prepared: PreparedRaster,
  mask: RasterImageSource,
  config: ReadonlyAsciiEffectConfig,
): void {
  const maskLayer = createRasterCanvas(target.width, target.height);
  const maskContext = getRasterContext(maskLayer);
  if (config.mask.invert) {
    maskContext.fillStyle = "#fff";
    maskContext.fillRect(0, 0, target.width, target.height);
    maskContext.globalCompositeOperation = "destination-out";
    drawFittedSource(
      maskContext,
      mask,
      target.width,
      target.height,
      "fill",
      [0.5, 0.5],
    );
  } else {
    drawFittedSource(
      maskContext,
      mask,
      target.width,
      target.height,
      "fill",
      [0.5, 0.5],
    );
  }

  const reveal = cloneCanvas(prepared.source);
  const revealContext = getRasterContext(reveal);
  revealContext.globalCompositeOperation = "destination-in";
  revealContext.drawImage(maskLayer, 0, 0);
  const targetContext = getRasterContext(target);
  targetContext.save();
  targetContext.globalCompositeOperation = "source-over";
  targetContext.drawImage(reveal, 0, 0);
  targetContext.restore();
}

/**
 * Renders a complete frame in the documented order. At a fixed timestamp and
 * seed this function is deterministic, including grain, glitch and flicker.
 */
export function renderAsciiFrame(
  target: RasterCanvas,
  prepared: PreparedRaster,
  options: AsciiRenderOptions,
): void {
  const { config, solidBackground, time, seed, mask } = options;
  if (target.width !== prepared.width || target.height !== prepared.height) {
    resizeCanvas(target, prepared.width, prepared.height);
  }

  const composition = createRasterCanvas(prepared.width, prepared.height);
  const compositionContext = getRasterContext(composition);
  renderBackground(
    compositionContext,
    prepared,
    config,
    solidBackground,
  );

  const primitives = renderPrimitives(prepared, config, time, seed);
  applyTint(primitives, config);
  const blurred = applyBlur(primitives, config);
  compositionContext.drawImage(blurred, 0, 0);

  applyPostEffects(composition, config, time, seed);
  applyLights(composition, config);
  if (config.mask.enabled && mask) {
    revealPlainPhoto(composition, prepared, mask, config);
  }

  const targetContext = getRasterContext(target);
  targetContext.clearRect(0, 0, target.width, target.height);
  targetContext.drawImage(composition, 0, 0);
}

export interface AsciiEngineOptions {
  readonly config: ReadonlyAsciiEffectConfig;
  readonly solidBackground?: string;
  readonly fit?: ObjectFit;
  readonly position?: ObjectPosition;
  readonly quality?: QualityTier;
  readonly seed?: number;
}

export class AsciiEngine {
  readonly #canvas: RasterCanvas;
  #source: RasterImageSource | null = null;
  #mask: RasterImageSource | null = null;
  #prepared: PreparedRaster | null = null;
  #config: AsciiEffectConfig;
  #solidBackground: string;
  #fit: ObjectFit;
  #position: ObjectPosition;
  #quality: QualityTier;
  #seed: number;
  #width: number;
  #height: number;
  #needsPrepare = true;

  constructor(canvas: RasterCanvas, options: AsciiEngineOptions) {
    this.#canvas = canvas;
    this.#config = AsciiEffectConfigSchema.parse(options.config);
    this.#solidBackground = options.solidBackground ?? "#0b0b09";
    this.#fit = options.fit ?? "cover";
    this.#position = options.position ?? [0.5, 0.5];
    this.#quality = options.quality ?? "high";
    this.#seed = options.seed ?? DEFAULT_RENDER_SEED;
    this.#width = canvas.width;
    this.#height = canvas.height;
  }

  setSource(source: RasterImageSource): void {
    this.#source = source;
    this.#needsPrepare = true;
  }

  setMask(mask: RasterImageSource | null): void {
    this.#mask = mask;
  }

  setConfig(config: ReadonlyAsciiEffectConfig): void {
    const parsed = AsciiEffectConfigSchema.parse(config);
    if (parsed.cellSize !== this.#config.cellSize) {
      this.#needsPrepare = true;
    }
    this.#config = parsed;
  }

  setSolidBackground(color: string): void {
    this.#solidBackground = color;
  }

  setFit(fit: ObjectFit, position: ObjectPosition = this.#position): void {
    if (
      fit !== this.#fit ||
      position[0] !== this.#position[0] ||
      position[1] !== this.#position[1]
    ) {
      this.#fit = fit;
      this.#position = position;
      this.#needsPrepare = true;
    }
  }

  setQuality(quality: QualityTier): void {
    if (quality !== this.#quality) {
      this.#quality = quality;
      this.#needsPrepare = true;
    }
  }

  resize(width: number, height: number): void {
    const roundedWidth = Math.max(1, Math.round(width));
    const roundedHeight = Math.max(1, Math.round(height));
    if (roundedWidth === this.#width && roundedHeight === this.#height) return;
    this.#width = roundedWidth;
    this.#height = roundedHeight;
    resizeCanvas(this.#canvas, roundedWidth, roundedHeight);
    this.#needsPrepare = true;
  }

  render(time = 0): boolean {
    if (!this.#source || this.#width < 1 || this.#height < 1) return false;
    if (this.#needsPrepare || !this.#prepared) {
      const quality = QUALITY_TIERS[this.#quality];
      this.#prepared = prepareRaster(
        this.#source,
        this.#width,
        this.#height,
        this.#config.cellSize,
        quality.maxCells,
        this.#fit,
        this.#position,
      );
      this.#needsPrepare = false;
    }

    renderAsciiFrame(this.#canvas, this.#prepared, {
      config: this.#config,
      solidBackground: this.#solidBackground,
      time,
      seed: this.#seed,
      mask: this.#mask,
    });
    return true;
  }

  get fps(): number {
    return QUALITY_TIERS[this.#quality].fps;
  }

  get fingerprint(): number {
    return hash32(
      this.#width,
      this.#height,
      this.#config.cellSize,
      this.#config.coverage,
      this.#seed,
    );
  }
}
