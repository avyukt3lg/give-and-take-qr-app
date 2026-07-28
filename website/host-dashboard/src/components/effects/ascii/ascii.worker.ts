/// <reference lib="webworker" />

import { AsciiEngine } from "./engine";
import type { AsciiWorkerRequest, AsciiWorkerResponse } from "./protocol";
import type { AsciiEffectConfig } from "./types";

interface WorkerScope {
  onmessage: ((event: MessageEvent<AsciiWorkerRequest>) => void) | null;
  postMessage(message: AsciiWorkerResponse): void;
  close(): void;
}

const scope = globalThis as unknown as WorkerScope;
let engine: AsciiEngine | null = null;
let config: AsciiEffectConfig | null = null;
let source: ImageBitmap | null = null;
let mask: ImageBitmap | null = null;
let paused = true;
let timer: number | null = null;
let lastFrame = -Infinity;

const cancelFrame = (): void => {
  if (timer !== null) {
    globalThis.clearTimeout(timer);
    timer = null;
  }
};

const shouldAnimate = (): boolean =>
  Boolean(config?.animated || config?.renderMode === "matrix");

const renderOnce = (time = 0): void => {
  if (!engine) return;
  engine.render(time);
};

const schedule = (): void => {
  cancelFrame();
  if (paused || !engine || !shouldAnimate()) return;
  const interval = 1_000 / engine.fps;
  const tick = (): void => {
    timer = null;
    if (paused || !engine) return;
    const now = performance.now();
    if (now - lastFrame >= interval) {
      engine.render(now);
      lastFrame = now;
    }
    timer = globalThis.setTimeout(tick, Math.max(4, interval / 2));
  };
  timer = globalThis.setTimeout(tick, 0);
};

const disposeBitmap = (bitmap: ImageBitmap | null): void => {
  try {
    bitmap?.close();
  } catch {
    // Some engines close transferred ImageBitmaps eagerly.
  }
};

const reportError = (error: unknown): void => {
  scope.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
};

scope.onmessage = (event): void => {
  const message = event.data;
  try {
    switch (message.type) {
      case "init": {
        cancelFrame();
        source = message.source;
        mask = message.mask;
        config = message.config;
        paused = message.paused;
        engine = new AsciiEngine(message.canvas, {
          config,
          solidBackground: message.solidBackground,
          fit: message.fit,
          position: message.position,
          quality: message.quality,
          seed: message.seed,
        });
        engine.resize(message.width, message.height);
        engine.setSource(source);
        engine.setMask(mask);
        renderOnce(0);
        scope.postMessage({ type: "ready" });
        schedule();
        break;
      }
      case "set-config":
        config = message.config;
        engine?.setConfig(config);
        renderOnce(paused ? 0 : performance.now());
        schedule();
        break;
      case "set-source":
        disposeBitmap(source);
        source = message.source;
        engine?.setSource(source);
        renderOnce(paused ? 0 : performance.now());
        schedule();
        break;
      case "set-mask":
        disposeBitmap(mask);
        mask = message.mask;
        engine?.setMask(mask);
        renderOnce(paused ? 0 : performance.now());
        break;
      case "resize":
        engine?.resize(message.width, message.height);
        renderOnce(paused ? 0 : performance.now());
        break;
      case "set-background":
        engine?.setSolidBackground(message.color);
        renderOnce(paused ? 0 : performance.now());
        break;
      case "pause":
        paused = message.paused;
        if (paused) {
          cancelFrame();
          renderOnce(0);
        } else {
          schedule();
        }
        break;
      case "destroy":
        cancelFrame();
        disposeBitmap(source);
        disposeBitmap(mask);
        source = null;
        mask = null;
        engine = null;
        scope.close();
        break;
    }
  } catch (error) {
    cancelFrame();
    reportError(error);
  }
};
