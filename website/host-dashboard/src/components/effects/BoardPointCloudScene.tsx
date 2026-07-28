import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface BoardPointCloudSceneProps {
  active: boolean;
  progress?: number;
  reducedMotion?: boolean;
  className?: string;
  onError?: (error: Error) => void;
}

interface BoardPoint {
  x: number;
  y: number;
  depth: number;
  color: string;
}

const BOARD_URL = `${import.meta.env.BASE_URL}outputs/final_assets/board/give_and_take_board_web_640.webp`;
const SAMPLE_GRID = 76;
const TARGET_FRAME_MS = 1000 / 24;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function prefersStaticBoard(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return true;
  }
  return (
    window.matchMedia("(max-width: 899px)").matches ||
    (navigator.hardwareConcurrency ?? 8) <= 4
  );
}

function seededDepth(x: number, y: number): number {
  const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function sampleBoard(image: HTMLImageElement): BoardPoint[] {
  const buffer = document.createElement("canvas");
  buffer.width = SAMPLE_GRID;
  buffer.height = SAMPLE_GRID;
  const context = buffer.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas sampling is unavailable.");

  context.drawImage(image, 0, 0, SAMPLE_GRID, SAMPLE_GRID);
  const pixels = context.getImageData(0, 0, SAMPLE_GRID, SAMPLE_GRID).data;
  const points: BoardPoint[] = [];

  for (let y = 0; y < SAMPLE_GRID; y += 1) {
    for (let x = 0; x < SAMPLE_GRID; x += 1) {
      const offset = (y * SAMPLE_GRID + x) * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      if (luminance < 23) continue;
      points.push({
        x: x / (SAMPLE_GRID - 1) - 0.5,
        y: y / (SAMPLE_GRID - 1) - 0.5,
        depth: seededDepth(x, y),
        color: `rgb(${Math.min(255, Math.round(red * 1.12))} ${Math.min(
          255,
          Math.round(green * 1.12),
        )} ${Math.min(255, Math.round(blue * 1.12))})`,
      });
    }
  }

  return points;
}

export function BoardPointCloudScene({
  active,
  progress = 0,
  reducedMotion = false,
  className,
  onError,
}: BoardPointCloudSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(clamp01(progress));
  const [failed, setFailed] = useState(false);
  const [staticFallback, setStaticFallback] = useState(prefersStaticBoard);

  useEffect(() => {
    progressRef.current = clamp01(progress);
  }, [progress]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 899px)");
    const update = () => setStaticFallback(prefersStaticBoard());
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (
      !active ||
      reducedMotion ||
      staticFallback ||
      failed ||
      !canvasRef.current ||
      !hostRef.current
    ) {
      return;
    }

    const canvas = canvasRef.current;
    const host = hostRef.current;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      const error = new Error("The board Canvas2D renderer is unavailable.");
      setFailed(true);
      onError?.(error);
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let lastFrame = 0;
    let points: BoardPoint[] = [];
    let width = 1;
    let height = 1;
    let dpr = 1;
    const pointer = { current: 0, target: 0 };

    const fail = (reason: unknown) => {
      if (disposed) return;
      const error =
        reason instanceof Error ? reason : new Error("Board scene unavailable.");
      setFailed(true);
      onError?.(error);
    };

    const resize = () => {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const drawFloor = (chapter: number) => {
      const centerY = height * (0.83 - chapter * 0.08);
      context.save();
      context.strokeStyle = "rgb(208 169 92 / 0.11)";
      context.lineWidth = 1;
      for (let index = -8; index <= 8; index += 1) {
        const x = width * 0.5 + index * width * 0.055;
        context.beginPath();
        context.moveTo(width * 0.5 + (x - width * 0.5) * 0.16, centerY - 10);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let index = 0; index < 7; index += 1) {
        const amount = index / 6;
        const y = centerY + Math.pow(amount, 1.7) * (height - centerY);
        context.globalAlpha = 0.85 - amount * 0.6;
        context.beginPath();
        context.moveTo(width * 0.08, y);
        context.lineTo(width * 0.92, y);
        context.stroke();
      }
      context.restore();
    };

    const draw = (time: number) => {
      if (disposed) return;
      animationFrame = requestAnimationFrame(draw);
      if (document.hidden || time - lastFrame < TARGET_FRAME_MS) return;
      lastFrame = time;

      const startedAt = performance.now();
      const chapter = progressRef.current;
      const lift = Math.max(0, (chapter - 0.55) / 0.45);
      const scale = Math.min(width, height) * (0.98 - chapter * 0.08);
      const centerX = width * (0.69 - chapter * 0.38);
      const centerY = height * (0.48 + chapter * 0.04);
      const tilt = -0.63 + chapter * 0.12;
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      pointer.current += (pointer.target - pointer.current) * 0.06;
      const rotation = 0.035 + pointer.current * 0.11;
      const cosRotation = Math.cos(rotation);
      const sinRotation = Math.sin(rotation);

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      drawFloor(chapter);
      context.globalCompositeOperation = "lighter";

      for (const point of points) {
        const rotatedX = point.x * cosRotation - point.y * sinRotation;
        const rotatedY = point.x * sinRotation + point.y * cosRotation;
        const z = point.depth * 0.22 * lift;
        const projectedY = rotatedY * cosTilt - z * sinTilt;
        const projectedDepth = rotatedY * sinTilt + z * cosTilt;
        const perspective = 1 / Math.max(0.68, 1 + projectedDepth * 0.55);
        const screenX = centerX + rotatedX * scale * perspective;
        const screenY = centerY + projectedY * scale * perspective;
        const radius = Math.max(0.65, 1.3 * perspective);

        context.globalAlpha = 0.72 + point.depth * 0.24;
        context.fillStyle = point.color;
        context.fillRect(screenX, screenY, radius, radius);

        if (performance.now() - startedAt > 8) break;
      }

      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.fillStyle = "rgb(208 169 92 / 0.82)";
      for (let index = 0; index < 44; index += 1) {
        const angle = (index / 44) * Math.PI * 2 - Math.PI / 2 + rotation;
        const x = Math.cos(angle) * 0.49;
        const y = Math.sin(angle) * 0.49;
        const projectedY = y * cosTilt;
        const depth = y * sinTilt;
        const perspective = 1 / Math.max(0.68, 1 + depth * 0.55);
        context.beginPath();
        context.arc(
          centerX + x * scale * perspective,
          centerY + projectedY * scale * perspective,
          Math.max(1, 1.8 * perspective),
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.target = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
    };
    const onVisibility = () => {
      if (!document.hidden && !animationFrame) {
        animationFrame = requestAnimationFrame(draw);
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    const image = new Image();
    image.decoding = "async";
    image.src = BOARD_URL;
    void image
      .decode()
      .then(() => {
        if (disposed) return;
        points = sampleBoard(image);
        animationFrame = requestAnimationFrame(draw);
      })
      .catch(fail);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, failed, onError, reducedMotion, staticFallback]);

  if (!active) return null;

  const useFallback = failed || reducedMotion || staticFallback;

  return (
    <div
      ref={hostRef}
      className={cn("board-point-scene", className)}
      aria-hidden="true"
      data-renderer={useFallback ? "static" : "canvas2d"}
    >
      <img
        src={BOARD_URL}
        alt=""
        className="board-point-scene__fallback"
        decoding="async"
      />
      {!useFallback ? <canvas ref={canvasRef} /> : null}
    </div>
  );
}
