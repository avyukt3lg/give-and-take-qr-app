import type {
  ObjectFit,
  ObjectPosition,
  PreparedRaster,
  RasterCanvas,
  RasterCell,
  RasterContext,
  RasterImageSource,
  ReadonlyAsciiEffectConfig,
} from "./types";

const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

export const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, value));

export function hash32(...values: number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const integer = Number.isFinite(value) ? Math.floor(value) : 0;
    hash ^= integer;
    hash = Math.imul(hash, 0x01000193);
    hash ^= integer >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export const seededUnit = (...values: number[]): number =>
  hash32(...values) / UINT32_MAX_PLUS_ONE;

export function createRasterCanvas(width: number, height: number): RasterCanvas {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(safeWidth, safeHeight);
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = safeWidth;
    canvas.height = safeHeight;
    return canvas;
  }

  throw new Error("Canvas2D is unavailable in this environment.");
}

export function getRasterContext(
  canvas: RasterCanvas,
  options: CanvasRenderingContext2DSettings = {},
): RasterContext {
  const context = canvas.getContext("2d", options);
  if (!context) {
    throw new Error("The browser could not create a Canvas2D context.");
  }

  return context;
}

function sourceDimensions(source: RasterImageSource): {
  width: number;
  height: number;
} {
  if (
    typeof HTMLImageElement !== "undefined" &&
    source instanceof HTMLImageElement
  ) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }

  return { width: source.width, height: source.height };
}

export interface FittedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function calculateFittedRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: ObjectFit,
  position: ObjectPosition,
): FittedRect {
  if (fit === "fill") {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  }

  const widthScale = targetWidth / Math.max(1, sourceWidth);
  const heightScale = targetHeight / Math.max(1, sourceHeight);
  const scale =
    fit === "contain"
      ? Math.min(widthScale, heightScale)
      : Math.max(widthScale, heightScale);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (targetWidth - width) * clamp(position[0]);
  const y = (targetHeight - height) * clamp(position[1]);

  return { x, y, width, height };
}

export function drawFittedSource(
  context: RasterContext,
  source: RasterImageSource,
  targetWidth: number,
  targetHeight: number,
  fit: ObjectFit = "cover",
  position: ObjectPosition = [0.5, 0.5],
): void {
  const dimensions = sourceDimensions(source);
  const rect = calculateFittedRect(
    dimensions.width,
    dimensions.height,
    targetWidth,
    targetHeight,
    fit,
    position,
  );

  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}

interface IntegralChannels {
  readonly stride: number;
  readonly red: Float64Array;
  readonly green: Float64Array;
  readonly blue: Float64Array;
  readonly alpha: Float64Array;
  readonly luminance: Float64Array;
  readonly edge: Float64Array;
}

const luminanceOf = (red: number, green: number, blue: number): number =>
  (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;

export function buildIntegralChannels(
  image: ImageData,
): IntegralChannels {
  const { width, height, data } = image;
  const stride = width + 1;
  const size = stride * (height + 1);
  const red = new Float64Array(size);
  const green = new Float64Array(size);
  const blue = new Float64Array(size);
  const alpha = new Float64Array(size);
  const luminance = new Float64Array(size);
  const edge = new Float64Array(size);
  const rawLuminance = new Float32Array(width * height);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const dataIndex = pixel * 4;
    rawLuminance[pixel] = luminanceOf(
      data[dataIndex] ?? 0,
      data[dataIndex + 1] ?? 0,
      data[dataIndex + 2] ?? 0,
    );
  }

  const edgeAt = (x: number, y: number): number => {
    const safeX = Math.min(width - 1, Math.max(0, x));
    const safeY = Math.min(height - 1, Math.max(0, y));
    return rawLuminance[safeY * width + safeX] ?? 0;
  };

  for (let y = 0; y < height; y += 1) {
    let rowRed = 0;
    let rowGreen = 0;
    let rowBlue = 0;
    let rowAlpha = 0;
    let rowLuminance = 0;
    let rowEdge = 0;

    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const dataIndex = pixelIndex * 4;
      const gx =
        -edgeAt(x - 1, y - 1) +
        edgeAt(x + 1, y - 1) -
        2 * edgeAt(x - 1, y) +
        2 * edgeAt(x + 1, y) -
        edgeAt(x - 1, y + 1) +
        edgeAt(x + 1, y + 1);
      const gy =
        -edgeAt(x - 1, y - 1) -
        2 * edgeAt(x, y - 1) -
        edgeAt(x + 1, y - 1) +
        edgeAt(x - 1, y + 1) +
        2 * edgeAt(x, y + 1) +
        edgeAt(x + 1, y + 1);
      const sobel = clamp(Math.hypot(gx, gy) / 4);

      rowRed += data[dataIndex] ?? 0;
      rowGreen += data[dataIndex + 1] ?? 0;
      rowBlue += data[dataIndex + 2] ?? 0;
      rowAlpha += data[dataIndex + 3] ?? 0;
      rowLuminance += rawLuminance[pixelIndex] ?? 0;
      rowEdge += sobel;

      const index = (y + 1) * stride + x + 1;
      const above = index - stride;
      red[index] = (red[above] ?? 0) + rowRed;
      green[index] = (green[above] ?? 0) + rowGreen;
      blue[index] = (blue[above] ?? 0) + rowBlue;
      alpha[index] = (alpha[above] ?? 0) + rowAlpha;
      luminance[index] = (luminance[above] ?? 0) + rowLuminance;
      edge[index] = (edge[above] ?? 0) + rowEdge;
    }
  }

  return { stride, red, green, blue, alpha, luminance, edge };
}

const areaSum = (
  channel: Float64Array,
  stride: number,
  x: number,
  y: number,
  width: number,
  height: number,
): number => {
  const left = x;
  const top = y;
  const right = x + width;
  const bottom = y + height;
  return (
    (channel[bottom * stride + right] ?? 0) -
    (channel[top * stride + right] ?? 0) -
    (channel[bottom * stride + left] ?? 0) +
    (channel[top * stride + left] ?? 0)
  );
};

export function sampleRasterCells(
  image: ImageData,
  requestedCellSize: number,
  maxCells = 12_000,
): {
  cells: RasterCell[];
  cellSize: number;
  columns: number;
  rows: number;
} {
  const { width, height } = image;
  const minimumCellSize = Math.max(
    2,
    Math.ceil(Math.sqrt((width * height) / Math.max(1, maxCells))),
  );
  const cellSize = Math.max(minimumCellSize, Math.round(requestedCellSize));
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const integral = buildIntegralChannels(image);
  const cells: RasterCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    const y = row * cellSize;
    const cellHeight = Math.min(cellSize, height - y);

    for (let column = 0; column < columns; column += 1) {
      const x = column * cellSize;
      const cellWidth = Math.min(cellSize, width - x);
      const area = Math.max(1, cellWidth * cellHeight);
      const upperHeight = Math.max(1, Math.ceil(cellHeight / 2));
      const lowerHeight = Math.max(1, cellHeight - upperHeight);
      const average = (channel: Float64Array): number =>
        areaSum(
          channel,
          integral.stride,
          x,
          y,
          cellWidth,
          cellHeight,
        ) / area;
      const halfAverage = (
        channel: Float64Array,
        halfY: number,
        halfHeight: number,
      ): number =>
        areaSum(
          channel,
          integral.stride,
          x,
          halfY,
          cellWidth,
          halfHeight,
        ) / Math.max(1, cellWidth * halfHeight);
      const upperRed = halfAverage(integral.red, y, upperHeight);
      const upperGreen = halfAverage(integral.green, y, upperHeight);
      const upperBlue = halfAverage(integral.blue, y, upperHeight);
      const lowerY = Math.min(height - 1, y + upperHeight);
      const safeLowerHeight = Math.min(lowerHeight, height - lowerY);
      const lowerRed = halfAverage(
        integral.red,
        lowerY,
        Math.max(1, safeLowerHeight),
      );
      const lowerGreen = halfAverage(
        integral.green,
        lowerY,
        Math.max(1, safeLowerHeight),
      );
      const lowerBlue = halfAverage(
        integral.blue,
        lowerY,
        Math.max(1, safeLowerHeight),
      );

      cells.push({
        column,
        row,
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        r: average(integral.red),
        g: average(integral.green),
        b: average(integral.blue),
        a: average(integral.alpha) / 255,
        luminance: average(integral.luminance),
        edge: average(integral.edge),
        upper: {
          r: upperRed,
          g: upperGreen,
          b: upperBlue,
          luminance: luminanceOf(upperRed, upperGreen, upperBlue),
        },
        lower: {
          r: lowerRed,
          g: lowerGreen,
          b: lowerBlue,
          luminance: luminanceOf(lowerRed, lowerGreen, lowerBlue),
        },
      });
    }
  }

  return { cells, cellSize, columns, rows };
}

export function prepareRaster(
  source: RasterImageSource,
  width: number,
  height: number,
  requestedCellSize: number,
  maxCells: number,
  fit: ObjectFit = "cover",
  position: ObjectPosition = [0.5, 0.5],
): PreparedRaster {
  const canvas = createRasterCanvas(width, height);
  const context = getRasterContext(canvas, { willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  drawFittedSource(context, source, width, height, fit, position);
  const image = context.getImageData(0, 0, width, height);
  const sampled = sampleRasterCells(image, requestedCellSize, maxCells);

  return {
    source: canvas,
    width,
    height,
    ...sampled,
  };
}

export interface AdjustedCellColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly luminance: number;
}

const mix = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

export function evaluateToneCurve(
  input: number,
  points: ReadonlyAsciiEffectConfig["toneCurve"],
): number {
  const ordered = [...points].sort((a, b) => a.x - b.x);
  const x = clamp(input);
  let previous = ordered[0] ?? { x: 0, y: 0 };

  if (x <= previous.x) {
    return clamp(previous.y);
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const next = ordered[index]!;
    if (x <= next.x) {
      const span = Math.max(0.000_001, next.x - previous.x);
      return clamp(mix(previous.y, next.y, (x - previous.x) / span));
    }
    previous = next;
  }

  return clamp(previous.y);
}

/**
 * Per-cell adjustment order is deliberately explicit:
 * brightness → contrast → saturation → grayscale → tone curve.
 * Tint and blur are layer operations performed later by the engine.
 */
export function adjustCellColor(
  cell: RasterCell,
  config: ReadonlyAsciiEffectConfig,
): AdjustedCellColor {
  const brightness = config.brightness * 2.55;
  let red = clamp(cell.r + brightness, 0, 255);
  let green = clamp(cell.g + brightness, 0, 255);
  let blue = clamp(cell.b + brightness, 0, 255);

  const contrast = config.contrast / 100;
  red = clamp((red - 127.5) * contrast + 127.5, 0, 255);
  green = clamp((green - 127.5) * contrast + 127.5, 0, 255);
  blue = clamp((blue - 127.5) * contrast + 127.5, 0, 255);

  const saturation = config.saturation / 100;
  let luminance = luminanceOf(red, green, blue);
  const gray = luminance * 255;
  red = clamp(gray + (red - gray) * saturation, 0, 255);
  green = clamp(gray + (green - gray) * saturation, 0, 255);
  blue = clamp(gray + (blue - gray) * saturation, 0, 255);

  const grayscale = config.grayscale / 100;
  luminance = luminanceOf(red, green, blue);
  const finalGray = luminance * 255;
  red = mix(red, finalGray, grayscale);
  green = mix(green, finalGray, grayscale);
  blue = mix(blue, finalGray, grayscale);

  const curved = evaluateToneCurve(luminanceOf(red, green, blue), config.toneCurve);
  const originalLuminance = Math.max(
    0.000_001,
    luminanceOf(red, green, blue),
  );
  const curveScale = curved / originalLuminance;
  red = clamp(red * curveScale, 0, 255);
  green = clamp(green * curveScale, 0, 255);
  blue = clamp(blue * curveScale, 0, 255);

  return {
    r: red,
    g: green,
    b: blue,
    luminance: luminanceOf(red, green, blue),
  };
}

export function effectiveLuminance(
  cell: RasterCell,
  adjustedLuminance: number,
  config: ReadonlyAsciiEffectConfig,
): number {
  const edgeBlend = config.edgeEmphasis / 100;
  const emphasized = mix(adjustedLuminance, Math.max(adjustedLuminance, cell.edge), edgeBlend);
  return config.invert ? 1 - emphasized : emphasized;
}

export function shouldRenderCell(
  cell: RasterCell,
  config: ReadonlyAsciiEffectConfig,
  seed: number,
): boolean {
  const coverage = config.coverage / 100;
  if (coverage <= 0) return false;
  if (coverage >= 1) return true;
  return seededUnit(seed, cell.column, cell.row, 0x63_6f_76) <= coverage;
}

export function passesProgressiveReveal(
  cell: RasterCell,
  prepared: Pick<PreparedRaster, "columns" | "rows">,
  config: ReadonlyAsciiEffectConfig,
): boolean {
  const x = (cell.column + 0.5) / Math.max(1, prepared.columns);
  const y = (cell.row + 0.5) / Math.max(1, prepared.rows);
  const position = config.progressivePosition / 100;
  const progress = config.directionalBothSides
    ? Math.abs(x - 0.5) * 2
    : (x + y) / 2;
  const visible = progress <= position;
  return config.progressiveReverse ? !visible : visible;
}
