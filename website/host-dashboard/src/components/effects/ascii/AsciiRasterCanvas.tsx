import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";

import { AsciiEngine, DEFAULT_RENDER_SEED } from "./engine";
import { BENJAMINS_DITHER_PRESET } from "./preset";
import type { AsciiWorkerRequest, AsciiWorkerResponse } from "./protocol";
import {
  AsciiEffectConfigSchema,
  QUALITY_TIERS,
  type ObjectFit,
  type ObjectPosition,
  type QualityTier,
  type ReadonlyAsciiEffectConfig,
} from "./types";

type RendererStatus = "loading" | "ready" | "fallback";

export interface AsciiRasterCanvasHandle {
  renderStaticFrame(): void;
}

export interface AsciiRasterCanvasProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  readonly src: string;
  readonly config?: ReadonlyAsciiEffectConfig;
  readonly solidBackground?: string;
  readonly fit?: ObjectFit;
  readonly position?: ObjectPosition;
  readonly paused?: boolean;
  readonly quality?: QualityTier;
  readonly fallbackImage?: string;
  readonly fallbackAlt?: string;
  readonly seed?: number;
  readonly onReady?: () => void;
  readonly onError?: (error: Error) => void;
}

interface Dimensions {
  readonly width: number;
  readonly height: number;
}

interface MainThreadController {
  readonly engine: AsciiEngine;
  renderStatic(): void;
  start(): void;
  stop(): void;
}

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const DEFAULT_POSITION: ObjectPosition = [0.5, 0.5];

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Could not decode ASCII source image: ${source}`));
    image.src = source;
  });

const bitmapFromImage = (image: HTMLImageElement): Promise<ImageBitmap> =>
  createImageBitmap(image);

const workerIsSupported = (canvas: HTMLCanvasElement): boolean =>
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap === "function" &&
  typeof canvas.transferControlToOffscreen === "function";

const serializeConfig = (config: ReadonlyAsciiEffectConfig): string =>
  JSON.stringify(config);

export const AsciiRasterCanvas = forwardRef<
  AsciiRasterCanvasHandle,
  AsciiRasterCanvasProps
>(function AsciiRasterCanvas(
  {
    src,
    config = BENJAMINS_DITHER_PRESET,
    solidBackground = "#0b0b09",
    fit = "cover",
    position = DEFAULT_POSITION,
    paused = false,
    quality = "high",
    fallbackImage = src,
    fallbackAlt = "",
    seed = DEFAULT_RENDER_SEED,
    className,
    style,
    onReady,
    onError,
    ...containerProps
  },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const mainRef = useRef<MainThreadController | null>(null);
  const dimensionsRef = useRef<Dimensions>({ width: 1, height: 1 });
  const effectivePausedRef = useRef(true);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const configRef = useRef(config);
  const [measured, setMeasured] = useState(false);
  const [intersecting, setIntersecting] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(
    typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const [workerDisabled, setWorkerDisabled] = useState(false);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [status, setStatus] = useState<RendererStatus>("loading");

  // Serializing catches nested effect-lab changes without forcing callers to
  // memoize a large configuration object.
  const incomingConfigSignature = serializeConfig(config);
  const validatedConfig = useMemo(
    () => AsciiEffectConfigSchema.parse(JSON.parse(incomingConfigSignature)),
    [incomingConfigSignature],
  );
  const configSignature = serializeConfig(validatedConfig);
  const [positionX, positionY] = position;
  const stablePosition = useMemo<ObjectPosition>(
    () => [positionX, positionY],
    [positionX, positionY],
  );
  const effectivePaused =
    paused || !intersecting || !documentVisible || reducedMotion;

  configRef.current = validatedConfig;
  effectivePausedRef.current = effectivePaused;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useImperativeHandle(
    forwardedRef,
    () => ({
      renderStaticFrame(): void {
        const message: AsciiWorkerRequest = { type: "pause", paused: true };
        workerRef.current?.postMessage(message);
        mainRef.current?.renderStatic();
      },
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      const dpr =
        typeof window === "undefined"
          ? 1
          : Math.min(window.devicePixelRatio || 1, QUALITY_TIERS[quality].dprCap);
      dimensionsRef.current = {
        width: Math.max(1, Math.round(width * dpr)),
        height: Math.max(1, Math.round(height * dpr)),
      };
      setMeasured(true);

      const resizeMessage: AsciiWorkerRequest = {
        type: "resize",
        ...dimensionsRef.current,
      };
      workerRef.current?.postMessage(resizeMessage);
      mainRef.current?.engine.resize(
        dimensionsRef.current.width,
        dimensionsRef.current.height,
      );
      mainRef.current?.renderStatic();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [quality]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIntersecting(entry.isIntersecting);
      },
      { rootMargin: "160px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () =>
      setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!measured) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let localWorker: Worker | null = null;
    let localController: MainThreadController | null = null;
    let workerAttempted = false;

    setStatus("loading");

    const fail = (error: unknown, canRetryMainThread: boolean): void => {
      if (cancelled) return;
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      localWorker?.terminate();
      if (workerRef.current === localWorker) workerRef.current = null;
      if (canRetryMainThread && !workerDisabled) {
        setWorkerDisabled(true);
        setCanvasEpoch((value) => value + 1);
        return;
      }
      setStatus("fallback");
      onErrorRef.current?.(normalized);
    };

    const startMainThread = (
      image: HTMLImageElement,
      maskImage: HTMLImageElement | null,
    ): void => {
      const engine = new AsciiEngine(canvas, {
        config: configRef.current,
        solidBackground,
        fit,
        position: stablePosition,
        quality,
        seed,
      });
      engine.resize(dimensionsRef.current.width, dimensionsRef.current.height);
      engine.setSource(image);
      engine.setMask(maskImage);
      let frame = 0;
      let lastFrame = -Infinity;

      const controller: MainThreadController = {
        engine,
        renderStatic: () => {
          engine.render(0);
        },
        start: () => {
          cancelAnimationFrame(frame);
          const interval = 1_000 / engine.fps;
          const tick = (time: number): void => {
            if (effectivePausedRef.current) return;
            if (
              !configRef.current.animated &&
              configRef.current.renderMode !== "matrix"
            ) {
              engine.render(0);
              return;
            }
            if (time - lastFrame >= interval) {
              engine.render(time);
              lastFrame = time;
            }
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        },
        stop: () => cancelAnimationFrame(frame),
      };
      localController = controller;
      mainRef.current = controller;
      controller.renderStatic();
      if (!effectivePausedRef.current) controller.start();
      setStatus("ready");
      onReadyRef.current?.();
    };

    const initialize = async (): Promise<void> => {
      try {
        const image = await loadImage(src);
        if (cancelled) return;
        const maskImage =
          configRef.current.mask.enabled && configRef.current.mask.dataUrl
            ? await loadImage(configRef.current.mask.dataUrl)
            : null;
        if (cancelled) return;

        if (!workerDisabled && workerIsSupported(canvas)) {
          workerAttempted = true;
          const [sourceBitmap, maskBitmap] = await Promise.all([
            bitmapFromImage(image),
            maskImage ? bitmapFromImage(maskImage) : Promise.resolve(null),
          ]);
          if (cancelled) {
            sourceBitmap.close();
            maskBitmap?.close();
            return;
          }
          const offscreen = canvas.transferControlToOffscreen();
          const worker = new Worker(new URL("./ascii.worker.ts", import.meta.url), {
            type: "module",
            name: "give-and-take-ascii",
          });
          localWorker = worker;
          workerRef.current = worker;
          worker.onmessage = (
            event: MessageEvent<AsciiWorkerResponse>,
          ): void => {
            if (event.data.type === "ready") {
              setStatus("ready");
              onReadyRef.current?.();
            } else {
              fail(new Error(event.data.message), true);
            }
          };
          worker.onerror = (event) => {
            event.preventDefault();
            fail(
              new Error(event.message || "The ASCII worker crashed."),
              true,
            );
          };
          const message: AsciiWorkerRequest = {
            type: "init",
            canvas: offscreen,
            source: sourceBitmap,
            mask: maskBitmap,
            width: dimensionsRef.current.width,
            height: dimensionsRef.current.height,
            config: AsciiEffectConfigSchema.parse(configRef.current),
            solidBackground,
            fit,
            position: stablePosition,
            quality,
            seed,
            paused: effectivePausedRef.current,
          };
          const transfers: Transferable[] = [offscreen, sourceBitmap];
          if (maskBitmap) transfers.push(maskBitmap);
          worker.postMessage(message, transfers);
          return;
        }

        startMainThread(image, maskImage);
      } catch (error) {
        fail(error, workerAttempted);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      if (localWorker) {
        const destroy: AsciiWorkerRequest = { type: "destroy" };
        localWorker.postMessage(destroy);
        localWorker.terminate();
      }
      localController?.stop();
      if (workerRef.current === localWorker) workerRef.current = null;
      if (mainRef.current === localController) mainRef.current = null;
    };
  }, [
    canvasEpoch,
    fit,
    measured,
    quality,
    seed,
    solidBackground,
    src,
    stablePosition,
    workerDisabled,
  ]);

  useEffect(() => {
    const message: AsciiWorkerRequest = {
      type: "set-config",
      config: validatedConfig,
    };
    workerRef.current?.postMessage(message);
    mainRef.current?.engine.setConfig(validatedConfig);
    mainRef.current?.renderStatic();
    if (!effectivePausedRef.current) mainRef.current?.start();
  }, [configSignature, validatedConfig]);

  useEffect(() => {
    let cancelled = false;
    const updateMask = async (): Promise<void> => {
      const dataUrl = validatedConfig.mask.enabled
        ? validatedConfig.mask.dataUrl
        : null;
      if (!dataUrl) {
        const message: AsciiWorkerRequest = { type: "set-mask", mask: null };
        workerRef.current?.postMessage(message);
        mainRef.current?.engine.setMask(null);
        mainRef.current?.renderStatic();
        return;
      }

      try {
        const image = await loadImage(dataUrl);
        if (cancelled) return;
        if (workerRef.current && typeof createImageBitmap === "function") {
          const bitmap = await bitmapFromImage(image);
          if (cancelled) {
            bitmap.close();
            return;
          }
          const message: AsciiWorkerRequest = {
            type: "set-mask",
            mask: bitmap,
          };
          workerRef.current.postMessage(message, [bitmap]);
        } else if (mainRef.current) {
          mainRef.current.engine.setMask(image);
          mainRef.current.renderStatic();
        }
      } catch (error) {
        onErrorRef.current?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };
    void updateMask();
    return () => {
      cancelled = true;
    };
  }, [
    validatedConfig.mask.dataUrl,
    validatedConfig.mask.enabled,
    canvasEpoch,
  ]);

  useEffect(() => {
    const message: AsciiWorkerRequest = {
      type: "set-background",
      color: solidBackground,
    };
    workerRef.current?.postMessage(message);
    mainRef.current?.engine.setSolidBackground(solidBackground);
    mainRef.current?.renderStatic();
  }, [solidBackground]);

  useEffect(() => {
    const message: AsciiWorkerRequest = {
      type: "pause",
      paused: effectivePaused,
    };
    workerRef.current?.postMessage(message);
    if (effectivePaused) {
      mainRef.current?.stop();
      mainRef.current?.renderStatic();
    } else {
      mainRef.current?.start();
    }
  }, [effectivePaused]);

  const rootStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    isolation: "isolate",
    background: solidBackground,
    ...style,
  };
  const imageStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    width: "100%",
    height: "100%",
    objectFit: fit,
    objectPosition: `${stablePosition[0] * 100}% ${stablePosition[1] * 100}%`,
    opacity: status === "ready" ? 0 : 1,
    transition: "opacity 180ms ease",
  };
  const canvasStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    width: "100%",
    height: "100%",
    opacity: status === "ready" ? 1 : 0,
    transition: "opacity 180ms ease",
  };
  const canvasKey = [
    src,
    fit,
    stablePosition[0],
    stablePosition[1],
    quality,
    seed,
    solidBackground,
    canvasEpoch,
  ].join(":");

  return (
    <div
      {...containerProps}
      ref={containerRef}
      className={className}
      style={rootStyle}
      data-ascii-state={status}
    >
      <img
        src={fallbackImage}
        alt={fallbackAlt}
        draggable={false}
        style={imageStyle}
      />
      <canvas
        key={canvasKey}
        ref={canvasRef}
        aria-hidden="true"
        role="presentation"
        style={canvasStyle}
      />
      {status === "fallback" && (
        <span role="status" style={visuallyHidden}>
          The animated artwork could not load. The original artwork is shown.
        </span>
      )}
    </div>
  );
});
