import type {
  AsciiEffectConfig,
  ObjectFit,
  ObjectPosition,
  QualityTier,
} from "./types";

export type AsciiWorkerRequest =
  | {
      readonly type: "init";
      readonly canvas: OffscreenCanvas;
      readonly source: ImageBitmap;
      readonly mask: ImageBitmap | null;
      readonly width: number;
      readonly height: number;
      readonly config: AsciiEffectConfig;
      readonly solidBackground: string;
      readonly fit: ObjectFit;
      readonly position: ObjectPosition;
      readonly quality: QualityTier;
      readonly seed: number;
      readonly paused: boolean;
    }
  | {
      readonly type: "set-config";
      readonly config: AsciiEffectConfig;
    }
  | {
      readonly type: "set-source";
      readonly source: ImageBitmap;
    }
  | {
      readonly type: "set-mask";
      readonly mask: ImageBitmap | null;
    }
  | {
      readonly type: "resize";
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly type: "set-background";
      readonly color: string;
    }
  | {
      readonly type: "pause";
      readonly paused: boolean;
    }
  | {
      readonly type: "destroy";
    };

export type AsciiWorkerResponse =
  | { readonly type: "ready" }
  | { readonly type: "error"; readonly message: string };
