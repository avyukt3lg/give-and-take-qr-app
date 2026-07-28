import { useState } from "react";

import productBox from "@/assets/product-box-1024.avif";
import { Button } from "@/components/ui/button";
import {
  ANIMATION_STYLES,
  AsciiEffectConfigSchema,
  BACKGROUND_MODES,
  BLEND_MODES,
  BLUR_TYPES,
  RENDER_MODES,
  type AsciiEffectConfig,
  type QualityTier,
} from "./types";
import { AsciiRasterCanvas } from "./AsciiRasterCanvas";
import { cloneAsciiPreset } from "./preset";

type NumericConfigKey = {
  [Key in keyof AsciiEffectConfig]: AsciiEffectConfig[Key] extends number
    ? Key
    : never;
}[keyof AsciiEffectConfig];

const NUMBER_CONTROLS = [
  { key: "bgBlur", label: "Background blur", min: 0, max: 100, step: 1 },
  { key: "density", label: "Density", min: -100, max: 100, step: 1 },
  { key: "cellSize", label: "Cell size", min: 2, max: 128, step: 1 },
  { key: "contrast", label: "Contrast", min: 0, max: 300, step: 1 },
  { key: "coverage", label: "Coverage", min: 0, max: 100, step: 1 },
  { key: "bgOpacity", label: "Background opacity", min: 0, max: 100, step: 1 },
  { key: "blurAngle", label: "Blur angle", min: -360, max: 360, step: 1 },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100, step: 1 },
  { key: "lensFocus", label: "Lens focus", min: 0, max: 100, step: 1 },
  { key: "tiltFocus", label: "Tilt focus", min: 0, max: 100, step: 1 },
  { key: "blurAmount", label: "Blur amount", min: 0, max: 100, step: 1 },
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
  { key: "saturation", label: "Saturation", min: 0, max: 300, step: 1 },
  { key: "blurCenterX", label: "Blur center X", min: 0, max: 100, step: 1 },
  { key: "blurCenterY", label: "Blur center Y", min: 0, max: 100, step: 1 },
  { key: "tiltFeather", label: "Tilt feather", min: 0, max: 100, step: 1 },
  { key: "tintOpacity", label: "Tint opacity", min: 0, max: 100, step: 1 },
  { key: "edgeEmphasis", label: "Edge emphasis", min: 0, max: 100, step: 1 },
  { key: "tiltPosition", label: "Tilt position", min: 0, max: 100, step: 1 },
  {
    key: "progressivePosition",
    label: "Progressive position",
    min: 0,
    max: 100,
    step: 1,
  },
] as const satisfies readonly {
  key: NumericConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
}[];

const PFX_KEYS = [
  "pixelate",
  "halftone",
  "bloom",
  "chromatic",
  "glitch",
  "scanLines",
  "filmGrain",
  "filmDust",
  "vignette",
] as const satisfies readonly (keyof AsciiEffectConfig["pfx"])[];

const labelForKey = (key: string): string =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());

function cloneConfig(config: AsciiEffectConfig): AsciiEffectConfig {
  return structuredClone(config);
}

export default function AsciiEffectLab() {
  const [config, setConfig] = useState<AsciiEffectConfig>(cloneAsciiPreset);
  const [quality, setQuality] = useState<QualityTier>("balanced");
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("");
  const [jsonDrafts, setJsonDrafts] = useState(() => ({
    toneCurve: JSON.stringify(config.toneCurve, null, 2),
    lightPoints: JSON.stringify(config.lights.points, null, 2),
    maskShapes: JSON.stringify(config.mask.shapes, null, 2),
    maskDataUrl: config.mask.dataUrl ?? "",
  }));

  const commit = (update: (next: AsciiEffectConfig) => void): void => {
    const next = cloneConfig(config);
    update(next);
    const result = AsciiEffectConfigSchema.safeParse(next);
    if (!result.success) {
      setMessage(result.error.issues[0]?.message ?? "Configuration is invalid.");
      return;
    }
    setConfig(result.data);
    setMessage("");
  };

  const commitJson = (
    key: "toneCurve" | "lightPoints" | "maskShapes",
  ): void => {
    try {
      const value: unknown = JSON.parse(jsonDrafts[key]);
      commit((next) => {
        if (key === "toneCurve") {
          next.toneCurve = value as AsciiEffectConfig["toneCurve"];
        } else if (key === "lightPoints") {
          next.lights.points = value as AsciiEffectConfig["lights"]["points"];
        } else {
          next.mask.shapes = value as AsciiEffectConfig["mask"]["shapes"];
        }
      });
    } catch {
      setMessage(`${labelForKey(key)} must contain valid JSON.`);
    }
  };

  const reset = (): void => {
    const next = cloneAsciiPreset();
    setConfig(next);
    setJsonDrafts({
      toneCurve: JSON.stringify(next.toneCurve, null, 2),
      lightPoints: JSON.stringify(next.lights.points, null, 2),
      maskShapes: JSON.stringify(next.mask.shapes, null, 2),
      maskDataUrl: next.mask.dataUrl ?? "",
    });
    setMessage("Preset restored.");
  };

  const copyConfig = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setMessage("Configuration copied.");
    } catch {
      setMessage("Clipboard unavailable. Select the JSON from developer tools.");
    }
  };

  return (
    <main className="ascii-effect-lab">
      <header className="ascii-effect-lab__header">
        <div>
          <p className="eyebrow">Development-only instrument</p>
          <h1 className="display-serif">ASCII raster effect lab</h1>
          <p>
            This route is compiled out of production. Every recipe parameter is
            exposed without changing the immutable production preset.
          </p>
        </div>
        <div className="ascii-effect-lab__actions">
          <Button type="button" variant="outline" onClick={reset}>
            Reset preset
          </Button>
          <Button type="button" onClick={() => void copyConfig()}>
            Copy JSON
          </Button>
        </div>
      </header>

      <div className="ascii-effect-lab__workspace">
        <section className="ascii-effect-lab__preview" aria-label="Effect preview">
          <AsciiRasterCanvas
            src={productBox}
            config={config}
            paused={paused}
            quality={quality}
            solidBackground="#080b09"
            fallbackImage={productBox}
            fallbackAlt="Give And Take box artwork preview"
          />
          <div>
            <label>
              <input
                type="checkbox"
                checked={paused}
                onChange={(event) => setPaused(event.target.checked)}
              />
              Pause preview
            </label>
            <label>
              Preview quality
              <select
                value={quality}
                onChange={(event) =>
                  setQuality(event.target.value as QualityTier)
                }
              >
                <option value="low">Low</option>
                <option value="balanced">Balanced</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </section>

        <form
          className="ascii-effect-lab__controls"
          onSubmit={(event) => event.preventDefault()}
        >
          <fieldset>
            <legend>Raster and primitive</legend>
            <label>
              Render mode
              <select
                value={config.renderMode}
                onChange={(event) =>
                  commit((next) => {
                    next.renderMode = event.target
                      .value as AsciiEffectConfig["renderMode"];
                  })
                }
              >
                {RENDER_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Character set
              <input
                value={config.charSet}
                onChange={(event) =>
                  commit((next) => {
                    next.charSet = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Custom characters
              <input
                value={config.customChars}
                onChange={(event) =>
                  commit((next) => {
                    next.customChars = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Style blend
              <select
                value={config.styleBlend}
                onChange={(event) =>
                  commit((next) => {
                    next.styleBlend = event.target
                      .value as AsciiEffectConfig["styleBlend"];
                  })
                }
              >
                {BLEND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            {NUMBER_CONTROLS.slice(1, 5).map((control) => (
              <label key={control.key}>
                <span>
                  {control.label}
                  <output>{config[control.key]}</output>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={config[control.key]}
                  onChange={(event) =>
                    commit((next) => {
                      next[control.key] = Number(event.target.value);
                    })
                  }
                />
              </label>
            ))}
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.invert}
                onChange={(event) =>
                  commit((next) => {
                    next.invert = event.target.checked;
                  })
                }
              />
              Invert luminance
            </label>
          </fieldset>

          <fieldset>
            <legend>Background and colour</legend>
            <label>
              Background mode
              <select
                value={config.bgMode}
                onChange={(event) =>
                  commit((next) => {
                    next.bgMode = event.target
                      .value as AsciiEffectConfig["bgMode"];
                  })
                }
              >
                {BACKGROUND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tint
              <input
                type="color"
                value={config.tint}
                onChange={(event) =>
                  commit((next) => {
                    next.tint = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Overlay blend
              <select
                value={config.overlayBlend}
                onChange={(event) =>
                  commit((next) => {
                    next.overlayBlend = event.target
                      .value as AsciiEffectConfig["overlayBlend"];
                  })
                }
              >
                {BLEND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            {[
              NUMBER_CONTROLS[0],
              ...NUMBER_CONTROLS.slice(5, 9),
              ...NUMBER_CONTROLS.slice(11, 13),
              NUMBER_CONTROLS[16],
            ].map((control) => (
              <label key={control.key}>
                <span>
                  {control.label}
                  <output>{config[control.key]}</output>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={config[control.key]}
                  onChange={(event) =>
                    commit((next) => {
                      next[control.key] = Number(event.target.value);
                    })
                  }
                />
              </label>
            ))}
            <label>
              Tone curve JSON
              <textarea
                rows={7}
                value={jsonDrafts.toneCurve}
                onChange={(event) =>
                  setJsonDrafts((current) => ({
                    ...current,
                    toneCurve: event.target.value,
                  }))
                }
                onBlur={() => commitJson("toneCurve")}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>Blur</legend>
            <label>
              Blur type
              <select
                value={config.blurType}
                onChange={(event) =>
                  commit((next) => {
                    next.blurType = event.target
                      .value as AsciiEffectConfig["blurType"];
                  })
                }
              >
                {BLUR_TYPES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            {[
              NUMBER_CONTROLS[6],
              NUMBER_CONTROLS[9],
              NUMBER_CONTROLS[10],
              ...NUMBER_CONTROLS.slice(13, 16),
              NUMBER_CONTROLS[18],
            ].map((control) => (
              <label key={control.key}>
                <span>
                  {control.label}
                  <output>{config[control.key]}</output>
                </span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={config[control.key]}
                  onChange={(event) =>
                    commit((next) => {
                      next[control.key] = Number(event.target.value);
                    })
                  }
                />
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Animation and reveal</legend>
            <label>
              Animation style
              <select
                value={config.animStyle}
                onChange={(event) =>
                  commit((next) => {
                    next.animStyle = event.target
                      .value as AsciiEffectConfig["animStyle"];
                  })
                }
              >
                {ANIMATION_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </label>
            {(["animSpeed", "animIntensity"] as const).map((key) => (
              <div className="ascii-effect-lab__toggle-range" key={key}>
                <label className="ascii-effect-lab__check">
                  <input
                    type="checkbox"
                    checked={config[key].enabled}
                    onChange={(event) =>
                      commit((next) => {
                        next[key].enabled = event.target.checked;
                      })
                    }
                  />
                  {labelForKey(key)}
                </label>
                <label>
                  <span>
                    Intensity
                    <output>{config[key].intensity}</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config[key].intensity}
                    onChange={(event) =>
                      commit((next) => {
                        next[key].intensity = Number(event.target.value);
                      })
                    }
                  />
                </label>
              </div>
            ))}
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.animated}
                onChange={(event) =>
                  commit((next) => {
                    next.animated = event.target.checked;
                  })
                }
              />
              Animate primitives
            </label>
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.progressiveReverse}
                onChange={(event) =>
                  commit((next) => {
                    next.progressiveReverse = event.target.checked;
                  })
                }
              />
              Reverse progressive reveal
            </label>
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.directionalBothSides}
                onChange={(event) =>
                  commit((next) => {
                    next.directionalBothSides = event.target.checked;
                  })
                }
              />
              Reveal from both sides
            </label>
            {NUMBER_CONTROLS.slice(17, 18).concat(NUMBER_CONTROLS.slice(19)).map(
              (control) => (
                <label key={control.key}>
                  <span>
                    {control.label}
                    <output>{config[control.key]}</output>
                  </span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={config[control.key]}
                    onChange={(event) =>
                      commit((next) => {
                        next[control.key] = Number(event.target.value);
                      })
                    }
                  />
                </label>
              ),
            )}
          </fieldset>

          <fieldset>
            <legend>Post effects</legend>
            {PFX_KEYS.map((key) => (
              <div className="ascii-effect-lab__toggle-range" key={key}>
                <label className="ascii-effect-lab__check">
                  <input
                    type="checkbox"
                    checked={config.pfx[key].enabled}
                    onChange={(event) =>
                      commit((next) => {
                        next.pfx[key].enabled = event.target.checked;
                      })
                    }
                  />
                  {labelForKey(key)}
                </label>
                <label>
                  <span>
                    Intensity
                    <output>{config.pfx[key].intensity}</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.pfx[key].intensity}
                    onChange={(event) =>
                      commit((next) => {
                        next.pfx[key].intensity = Number(event.target.value);
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </fieldset>

          <fieldset>
            <legend>Lights</legend>
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.lights.enabled}
                onChange={(event) =>
                  commit((next) => {
                    next.lights.enabled = event.target.checked;
                  })
                }
              />
              Enable normalized light points
            </label>
            <label>
              Light points JSON
              <textarea
                rows={8}
                value={jsonDrafts.lightPoints}
                onChange={(event) =>
                  setJsonDrafts((current) => ({
                    ...current,
                    lightPoints: event.target.value,
                  }))
                }
                onBlur={() => commitJson("lightPoints")}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>Reveal mask</legend>
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.mask.enabled}
                onChange={(event) =>
                  commit((next) => {
                    next.mask.enabled = event.target.checked;
                  })
                }
              />
              Enable mask
            </label>
            <label>
              Mask tool
              <input
                value={config.mask.tool}
                onChange={(event) =>
                  commit((next) => {
                    next.mask.tool = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Brush size
              <input
                type="number"
                min="1"
                value={config.mask.brushSize}
                onChange={(event) =>
                  commit((next) => {
                    next.mask.brushSize = Number(event.target.value);
                  })
                }
              />
            </label>
            <label>
              Mask data URL
              <textarea
                rows={3}
                value={jsonDrafts.maskDataUrl}
                onChange={(event) =>
                  setJsonDrafts((current) => ({
                    ...current,
                    maskDataUrl: event.target.value,
                  }))
                }
                onBlur={() =>
                  commit((next) => {
                    next.mask.dataUrl = jsonDrafts.maskDataUrl.trim() || null;
                  })
                }
              />
            </label>
            <label>
              Mask shapes JSON
              <textarea
                rows={7}
                value={jsonDrafts.maskShapes}
                onChange={(event) =>
                  setJsonDrafts((current) => ({
                    ...current,
                    maskShapes: event.target.value,
                  }))
                }
                onBlur={() => commitJson("maskShapes")}
              />
            </label>
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.mask.invert}
                onChange={(event) =>
                  commit((next) => {
                    next.mask.invert = event.target.checked;
                  })
                }
              />
              Invert mask
            </label>
            <label className="ascii-effect-lab__check">
              <input
                type="checkbox"
                checked={config.mask.showOverlay}
                onChange={(event) =>
                  commit((next) => {
                    next.mask.showOverlay = event.target.checked;
                  })
                }
              />
              Show mask overlay
            </label>
          </fieldset>
        </form>
      </div>

      <p className="ascii-effect-lab__message" role="status" aria-live="polite">
        {message}
      </p>
    </main>
  );
}
