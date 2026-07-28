import {
  adjustCellColor,
  clamp,
  effectiveLuminance,
  seededUnit,
} from "./sampling";
import {
  RENDER_MODES,
  type RasterCell,
  type RasterContext,
  type ReadonlyAsciiEffectConfig,
  type RenderMode,
} from "./types";

export interface PrimitiveInput {
  readonly context: RasterContext;
  readonly cell: RasterCell;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly luminance: number;
  readonly color: string;
  readonly opacity: number;
  readonly time: number;
  readonly seed: number;
  readonly config: ReadonlyAsciiEffectConfig;
  readonly columns: number;
  readonly rows: number;
  readonly luminanceAt: (column: number, row: number) => number;
}

export type PrimitiveRenderer = (input: PrimitiveInput) => void;

const TAU = Math.PI * 2;
const BAYER_4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
] as const;

const CHARACTER_SETS: Record<string, string> = {
  ascii: " .,:;irsXA253hMHGS#9B&@",
  binary: "01",
  blocks: " ░▒▓█",
  currency: " .$¢€£¥₹",
  minimal: " .:+#",
};

const setPaint = (
  context: RasterContext,
  color: string,
  opacity: number,
): void => {
  context.globalAlpha = clamp(opacity);
  context.fillStyle = color;
  context.strokeStyle = color;
};

const roundedRect = (
  context: RasterContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
};

const drawGlyph = (
  input: PrimitiveInput,
  glyph: string,
  fontScale = 0.92,
): void => {
  const { context, centerX, centerY, size, color, opacity } = input;
  setPaint(context, color, opacity);
  context.font = `700 ${Math.max(2, size * fontScale)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(glyph, centerX, centerY);
};

const characters: PrimitiveRenderer = (input) => {
  const configured =
    input.config.customChars ||
    CHARACTER_SETS[input.config.charSet] ||
    CHARACTER_SETS.ascii!;
  const glyphs = Array.from(configured);
  const index = Math.min(
    glyphs.length - 1,
    Math.floor(clamp(input.luminance) * glyphs.length),
  );
  drawGlyph(input, glyphs[Math.max(0, index)] || " ");
};

const dither: PrimitiveRenderer = (input) => {
  const { context, cell, centerX, centerY, size, luminance, color, opacity } =
    input;
  const threshold =
    ((BAYER_4[(cell.row % 4) * 4 + (cell.column % 4)] ?? 0) + 0.5) / 16;
  if (luminance < threshold) return;
  const dot = Math.max(1, size * (0.18 + luminance * 0.5));
  setPaint(context, color, opacity);
  context.fillRect(centerX - dot / 2, centerY - dot / 2, dot, dot);
};

const mosaic: PrimitiveRenderer = (input) => {
  const { context, centerX, centerY, width, height, color, opacity } = input;
  setPaint(context, color, opacity * (0.25 + input.luminance * 0.75));
  context.fillRect(
    centerX - width * 0.49,
    centerY - height * 0.49,
    width * 0.98,
    height * 0.98,
  );
};

const pixel: PrimitiveRenderer = (input) => {
  const side = Math.max(1, input.size * (0.2 + input.luminance * 0.8));
  setPaint(input.context, input.color, input.opacity);
  input.context.fillRect(
    input.centerX - side / 2,
    input.centerY - side / 2,
    side,
    side,
  );
};

const dots: PrimitiveRenderer = (input) => {
  const radius = Math.max(0.5, input.size * input.luminance * 0.48);
  setPaint(input.context, input.color, input.opacity);
  input.context.beginPath();
  input.context.arc(input.centerX, input.centerY, radius, 0, TAU);
  input.context.fill();
};

const cross: PrimitiveRenderer = (input) => {
  const arm = input.size * (0.2 + input.luminance * 0.36);
  const thickness = Math.max(1, arm * 0.26);
  setPaint(input.context, input.color, input.opacity);
  input.context.fillRect(
    input.centerX - arm,
    input.centerY - thickness / 2,
    arm * 2,
    thickness,
  );
  input.context.fillRect(
    input.centerX - thickness / 2,
    input.centerY - arm,
    thickness,
    arm * 2,
  );
};

const diamond: PrimitiveRenderer = (input) => {
  const radius = input.size * (0.15 + input.luminance * 0.42);
  setPaint(input.context, input.color, input.opacity);
  input.context.beginPath();
  input.context.moveTo(input.centerX, input.centerY - radius);
  input.context.lineTo(input.centerX + radius, input.centerY);
  input.context.lineTo(input.centerX, input.centerY + radius);
  input.context.lineTo(input.centerX - radius, input.centerY);
  input.context.closePath();
  input.context.fill();
};

const voxel: PrimitiveRenderer = (input) => {
  const { context, centerX: x, centerY: y, color, opacity } = input;
  const radius = input.size * (0.18 + input.luminance * 0.38);
  setPaint(context, color, opacity);
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y - radius * 0.45);
  context.lineTo(x, y + radius * 0.1);
  context.lineTo(x - radius, y - radius * 0.45);
  context.closePath();
  context.globalAlpha *= 0.92;
  context.fill();
  context.beginPath();
  context.moveTo(x - radius, y - radius * 0.45);
  context.lineTo(x, y + radius * 0.1);
  context.lineTo(x, y + radius);
  context.lineTo(x - radius, y + radius * 0.45);
  context.closePath();
  context.globalAlpha *= 0.76;
  context.fill();
  context.beginPath();
  context.moveTo(x + radius, y - radius * 0.45);
  context.lineTo(x, y + radius * 0.1);
  context.lineTo(x, y + radius);
  context.lineTo(x + radius, y + radius * 0.45);
  context.closePath();
  context.globalAlpha = opacity;
  context.fill();
};

const lego: PrimitiveRenderer = (input) => {
  const { context, centerX, centerY, color, opacity, luminance } = input;
  const width = input.size * (0.35 + luminance * 0.55);
  const height = width * 0.72;
  setPaint(context, color, opacity);
  roundedRect(
    context,
    centerX - width / 2,
    centerY - height / 2 + height * 0.08,
    width,
    height,
    Math.max(1, width * 0.1),
  );
  context.fill();
  context.beginPath();
  context.arc(
    centerX,
    centerY - height * 0.44,
    Math.max(0.75, width * 0.17),
    0,
    TAU,
  );
  context.fill();
};

const lines: PrimitiveRenderer = (input) => {
  const length = input.size * (0.15 + input.luminance * 0.85);
  setPaint(input.context, input.color, input.opacity);
  input.context.lineWidth = Math.max(1, input.size * 0.09);
  input.context.beginPath();
  input.context.moveTo(input.centerX - length / 2, input.centerY);
  input.context.lineTo(input.centerX + length / 2, input.centerY);
  input.context.stroke();
};

const diagonal: PrimitiveRenderer = (input) => {
  const length = input.size * (0.15 + input.luminance * 0.8);
  const reverse = (input.cell.column + input.cell.row) % 2 === 0;
  setPaint(input.context, input.color, input.opacity);
  input.context.lineWidth = Math.max(1, input.size * 0.08);
  input.context.beginPath();
  input.context.moveTo(
    input.centerX - length / 2,
    input.centerY + (reverse ? -length : length) / 2,
  );
  input.context.lineTo(
    input.centerX + length / 2,
    input.centerY + (reverse ? length : -length) / 2,
  );
  input.context.stroke();
};

const braille: PrimitiveRenderer = (input) => {
  let bits = 0;
  const threshold = 1 - input.luminance;
  for (let dot = 0; dot < 8; dot += 1) {
    if (
      seededUnit(input.seed, input.cell.column, input.cell.row, dot) > threshold
    ) {
      bits |= 1 << dot;
    }
  }
  drawGlyph(input, String.fromCodePoint(0x2800 + bits), 0.88);
};

const disco: PrimitiveRenderer = (input) => {
  const hue =
    (input.cell.column * 19 + input.cell.row * 11 + input.time * 0.025) % 360;
  const radius = input.size * (0.16 + input.luminance * 0.34);
  setPaint(
    input.context,
    `hsl(${hue} 92% ${45 + input.luminance * 30}%)`,
    input.opacity,
  );
  input.context.beginPath();
  input.context.arc(input.centerX, input.centerY, radius, 0, TAU);
  input.context.fill();
};

const hexdump: PrimitiveRenderer = (input) => {
  const glyph = Math.round(input.luminance * 15)
    .toString(16)
    .toUpperCase();
  drawGlyph(input, glyph, 0.78);
};

const matrix: PrimitiveRenderer = (input) => {
  const speed = 0.0012 + (input.config.animSpeed.intensity / 100) * 0.0038;
  const columnOffset = seededUnit(input.seed, input.cell.column, 0x6d_61_74);
  const head =
    ((input.time * speed + columnOffset) * Math.max(1, input.rows + 8)) %
    Math.max(1, input.rows + 8);
  const distance = (head - input.cell.row + input.rows) % input.rows;
  const trail = clamp(1 - distance / 8);
  if (trail <= 0.03 && input.luminance < 0.42) return;
  const glyphs = input.config.customChars || "01ｱｲｳｴｵｶｷｸｹｺ";
  const glyphIndex = Math.floor(
    seededUnit(
      input.seed,
      input.cell.column,
      input.cell.row,
      Math.floor(input.time / 180),
    ) * Array.from(glyphs).length,
  );
  const glyph = Array.from(glyphs)[glyphIndex] || "0";
  drawGlyph(
    {
      ...input,
      color: distance < 1 ? "#eafff1" : "#00ff66",
      opacity: input.opacity * Math.max(trail, input.luminance * 0.35),
    },
    glyph,
    0.8,
  );
};

const rings: PrimitiveRenderer = (input) => {
  const radius = input.size * (0.16 + input.luminance * 0.32);
  setPaint(input.context, input.color, input.opacity);
  input.context.lineWidth = Math.max(1, input.size * 0.07);
  input.context.beginPath();
  input.context.arc(input.centerX, input.centerY, radius, 0, TAU);
  input.context.stroke();
};

const hearts: PrimitiveRenderer = (input) => {
  const radius = input.size * (0.12 + input.luminance * 0.36);
  const { context, centerX: x, centerY: y } = input;
  setPaint(context, input.color, input.opacity);
  context.beginPath();
  context.moveTo(x, y + radius * 0.82);
  context.bezierCurveTo(
    x - radius * 1.35,
    y,
    x - radius * 0.8,
    y - radius,
    x,
    y - radius * 0.25,
  );
  context.bezierCurveTo(
    x + radius * 0.8,
    y - radius,
    x + radius * 1.35,
    y,
    x,
    y + radius * 0.82,
  );
  context.fill();
};

const stars: PrimitiveRenderer = (input) => {
  const outer = input.size * (0.14 + input.luminance * 0.34);
  const inner = outer * 0.42;
  setPaint(input.context, input.color, input.opacity);
  input.context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const radius = point % 2 === 0 ? outer : inner;
    const x = input.centerX + Math.cos(angle) * radius;
    const y = input.centerY + Math.sin(angle) * radius;
    if (point === 0) input.context.moveTo(x, y);
    else input.context.lineTo(x, y);
  }
  input.context.closePath();
  input.context.fill();
};

const hexagons: PrimitiveRenderer = (input) => {
  const radius = input.size * (0.2 + input.luminance * 0.34);
  const shiftedX =
    input.centerX + (input.cell.row % 2 === 0 ? 0 : input.width * 0.25);
  setPaint(input.context, input.color, input.opacity);
  input.context.beginPath();
  for (let vertex = 0; vertex < 6; vertex += 1) {
    const angle = (vertex * TAU) / 6;
    const x = shiftedX + Math.cos(angle) * radius;
    const y = input.centerY + Math.sin(angle) * radius;
    if (vertex === 0) input.context.moveTo(x, y);
    else input.context.lineTo(x, y);
  }
  input.context.closePath();
  input.context.lineWidth = Math.max(1, input.size * 0.055);
  input.context.stroke();
  if (input.luminance > 0.66) {
    input.context.globalAlpha *= 0.28;
    input.context.fill();
  }
};

const triangles: PrimitiveRenderer = (input) => {
  const radius = input.size * (0.2 + input.luminance * 0.42);
  const up = (input.cell.column + input.cell.row) % 2 === 0;
  setPaint(input.context, input.color, input.opacity);
  input.context.beginPath();
  input.context.moveTo(
    input.centerX,
    input.centerY + (up ? -radius : radius),
  );
  input.context.lineTo(
    input.centerX + radius,
    input.centerY + (up ? radius : -radius),
  );
  input.context.lineTo(
    input.centerX - radius,
    input.centerY + (up ? radius : -radius),
  );
  input.context.closePath();
  input.context.fill();
};

const bubbles: PrimitiveRenderer = (input) => {
  const radius = input.size * (0.16 + input.luminance * 0.35);
  setPaint(input.context, input.color, input.opacity);
  input.context.lineWidth = Math.max(1, input.size * 0.065);
  input.context.beginPath();
  input.context.arc(input.centerX, input.centerY, radius, 0, TAU);
  input.context.stroke();
  input.context.globalAlpha *= 0.65;
  input.context.beginPath();
  input.context.arc(
    input.centerX - radius * 0.32,
    input.centerY - radius * 0.32,
    Math.max(0.5, radius * 0.14),
    0,
    TAU,
  );
  input.context.fill();
};

const hatch: PrimitiveRenderer = (input) => {
  const count = Math.max(1, Math.ceil(input.luminance * 4));
  const radius = input.size * 0.48;
  setPaint(input.context, input.color, input.opacity * 0.86);
  input.context.lineWidth = Math.max(0.75, input.size * 0.045);
  for (let line = 0; line < count; line += 1) {
    const offset = ((line + 1) / (count + 1) - 0.5) * radius * 1.6;
    input.context.beginPath();
    input.context.moveTo(
      input.centerX - radius,
      input.centerY - radius + offset,
    );
    input.context.lineTo(
      input.centerX + radius,
      input.centerY + radius + offset,
    );
    input.context.stroke();
    if (input.luminance > 0.62) {
      input.context.beginPath();
      input.context.moveTo(
        input.centerX + radius,
        input.centerY - radius + offset,
      );
      input.context.lineTo(
        input.centerX - radius,
        input.centerY + radius + offset,
      );
      input.context.stroke();
    }
  }
};

const contour: PrimitiveRenderer = (input) => {
  const right = input.luminanceAt(input.cell.column + 1, input.cell.row);
  const bottom = input.luminanceAt(input.cell.column, input.cell.row + 1);
  const diagonalValue = input.luminanceAt(
    input.cell.column + 1,
    input.cell.row + 1,
  );
  const levels = 7;
  const currentBand = Math.floor(input.luminance * levels);
  const crossings = [
    Math.floor(right * levels) !== currentBand,
    Math.floor(bottom * levels) !== currentBand,
    Math.floor(diagonalValue * levels) !== currentBand,
  ];
  if (!crossings.some(Boolean)) return;
  setPaint(input.context, input.color, input.opacity);
  input.context.lineWidth = Math.max(0.8, input.size * 0.05);
  input.context.beginPath();
  const left = input.centerX - input.width / 2;
  const top = input.centerY - input.height / 2;
  if (crossings[0] && crossings[1]) {
    input.context.moveTo(input.centerX, top);
    input.context.quadraticCurveTo(
      input.centerX,
      input.centerY,
      left + input.width,
      input.centerY,
    );
  } else if (crossings[0]) {
    input.context.moveTo(input.centerX, top);
    input.context.lineTo(input.centerX, top + input.height);
  } else {
    input.context.moveTo(left, input.centerY);
    input.context.lineTo(left + input.width, input.centerY);
  }
  input.context.stroke();
};

const halfblocks: PrimitiveRenderer = (input) => {
  const upperCell: RasterCell = {
    ...input.cell,
    r: input.cell.upper.r,
    g: input.cell.upper.g,
    b: input.cell.upper.b,
    luminance: input.cell.upper.luminance,
  };
  const lowerCell: RasterCell = {
    ...input.cell,
    r: input.cell.lower.r,
    g: input.cell.lower.g,
    b: input.cell.lower.b,
    luminance: input.cell.lower.luminance,
  };
  const upper = adjustCellColor(upperCell, input.config);
  const lower = adjustCellColor(lowerCell, input.config);
  const upperLuminance = effectiveLuminance(
    upperCell,
    upper.luminance,
    input.config,
  );
  const lowerLuminance = effectiveLuminance(
    lowerCell,
    lower.luminance,
    input.config,
  );
  const left = input.centerX - input.width * 0.48;
  const top = input.centerY - input.height * 0.48;
  const blockWidth = input.width * 0.96;
  const blockHeight = input.height * 0.48;
  input.context.fillStyle = `rgb(${Math.round(upper.r)} ${Math.round(upper.g)} ${Math.round(upper.b)})`;
  input.context.globalAlpha = input.opacity * (0.18 + upperLuminance * 0.82);
  input.context.fillRect(left, top, blockWidth, blockHeight);
  input.context.fillStyle = `rgb(${Math.round(lower.r)} ${Math.round(lower.g)} ${Math.round(lower.b)})`;
  input.context.globalAlpha = input.opacity * (0.18 + lowerLuminance * 0.82);
  input.context.fillRect(left, top + blockHeight, blockWidth, blockHeight);
};

const mixed: PrimitiveRenderer = (input) => {
  const choices = [dots, cross, diamond, lines, diagonal, rings] as const;
  const index = Math.floor(
    seededUnit(input.seed, input.cell.column, input.cell.row, 0x6d_69_78) *
      choices.length,
  );
  choices[Math.min(choices.length - 1, index)]!(input);
};

export const RENDER_MODE_REGISTRY: Readonly<
  Record<RenderMode, PrimitiveRenderer>
> = Object.freeze({
  characters,
  dither,
  mosaic,
  pixel,
  dots,
  cross,
  diamond,
  voxel,
  lego,
  mixed,
  lines,
  diagonal,
  braille,
  disco,
  hexdump,
  matrix,
  rings,
  hearts,
  stars,
  hexagons,
  triangles,
  bubbles,
  hatch,
  contour,
  halfblocks,
});

export function assertCompleteRendererRegistry(): void {
  const missing = RENDER_MODES.filter(
    (mode) => typeof RENDER_MODE_REGISTRY[mode] !== "function",
  );
  if (missing.length > 0) {
    throw new Error(`Missing ASCII renderers: ${missing.join(", ")}`);
  }
}
