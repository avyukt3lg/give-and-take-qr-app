import { MonitorCog, MoonStar, Projector, SunMedium } from "lucide-react";

import type { CompanionMode, ThemeId } from "@/domain/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const themeOptions: Array<{
  id: ThemeId;
  label: string;
  description: string;
  icon: typeof MoonStar;
}> = [
  {
    id: "table",
    label: "Table",
    description: "Warm black with brass table signals.",
    icon: MoonStar,
  },
  {
    id: "classroom",
    label: "Classroom",
    description: "Bone paper composed for projection.",
    icon: SunMedium,
  },
  {
    id: "contrast",
    label: "Contrast",
    description: "Black, white and chartreuse at maximum separation.",
    icon: Projector,
  },
];

const modeOptions: Array<{
  id: CompanionMode;
  label: string;
  description: string;
}> = [
  {
    id: "host",
    label: "Host console",
    description: "Full physical turn workflow and evidence tools.",
  },
  {
    id: "table",
    label: "Table display",
    description: "Large shared status for a classroom screen.",
  },
  {
    id: "player",
    label: "Player assist",
    description: "Focused holdings and current-turn guidance.",
  },
];

export interface SettingsDialogProps {
  theme: ThemeId;
  companionMode: CompanionMode;
  reducedMotion: boolean;
  gameStarted: boolean;
  playerLocked: boolean;
  onThemeChange(theme: ThemeId): void;
  onModeChange(mode: CompanionMode): void;
  onReducedMotionChange(reduced: boolean): void;
}

export function SettingsDialog({
  theme,
  companionMode,
  reducedMotion,
  gameStarted,
  playerLocked,
  onThemeChange,
  onModeChange,
  onReducedMotionChange,
}: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="settings-trigger"
          aria-label="Open display and companion settings"
        >
          <MonitorCog aria-hidden="true" />
          <span>Display</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="settings-dialog">
        <DialogHeader>
          <p className="eyebrow">Game room controls</p>
          <DialogTitle>Display and screen role</DialogTitle>
          <DialogDescription>
            Theme changes never alter game data. Screen roles only change what
            this device shows.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="settings-fieldset">
          <legend>Display theme</legend>
          <div className="settings-choice-grid">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  type="button"
                  key={option.id}
                  className="settings-choice"
                  aria-pressed={theme === option.id}
                  onClick={() => onThemeChange(option.id)}
                >
                  <Icon aria-hidden="true" />
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="settings-fieldset">
          <legend>Companion mode</legend>
          <div className="settings-choice-grid">
            {modeOptions.map((option) => {
              const locked =
                (option.id !== "host" && !gameStarted) ||
                (playerLocked && option.id !== "player");
              return (
                <button
                  type="button"
                  key={option.id}
                  className="settings-choice"
                  aria-pressed={companionMode === option.id}
                  disabled={locked}
                  onClick={() => onModeChange(option.id)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="motion-toggle">
          <span>
            <strong>Reduce motion</strong>
            <small>Stop canvas loops, parallax, flicker and long reveals.</small>
          </span>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => onReducedMotionChange(event.target.checked)}
          />
        </label>
      </DialogContent>
    </Dialog>
  );
}
