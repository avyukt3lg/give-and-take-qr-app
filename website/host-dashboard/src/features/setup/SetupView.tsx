import { Box, Check, UsersRound } from "lucide-react";

import type { GameDefinition, GameSession } from "@/domain/types";
import { MetalButton } from "@/components/actions/MetalButton";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Metric,
  StatusMark,
  SurfaceIntro,
} from "@/features/shared/SurfacePrimitives";

export interface SetupViewProps {
  game: GameDefinition;
  session: GameSession;
  canEdit: boolean;
  setupChecklist: Record<string, boolean>;
  onPlayerCountChange(count: number): void;
  onPlayerChange(
    index: number,
    patch: { name?: string; profileId?: string },
  ): void;
  onStart(): void;
  /** Resolves true when the write landed, so the control can confirm inline. */
  onCopyCode(): Promise<boolean> | boolean;
  onSetupCheck(key: string, checked: boolean): void;
}

export function SetupView({
  game,
  session,
  canEdit,
  setupChecklist,
  onPlayerCountChange,
  onPlayerChange,
  onStart,
  onCopyCode,
  onSetupCheck,
}: SetupViewProps) {
  const drafts = session.draft.players.slice(0, session.draft.playerCount);
  const named = drafts.every((player) => player.name.trim().length > 0);
  const profiled = drafts.every((player) =>
    game.cards.starterProfiles.some((profile) => profile.id === player.profileId),
  );
  const setupItems = [
    "Shuffle Investment, Market/Life, Ethics, Action, and Reflection decks.",
    "Put every pawn on S00 Student Start.",
    "Keep the physical D6 and price tracker near the host.",
    "Share the GT code with players.",
    "Confirm physical player boards and pencils are ready.",
  ];
  const physicalReady = setupItems.every(
    (_item, index) => setupChecklist[`setup-${index}`],
  );
  const ready = drafts.length >= 2 && named && profiled && physicalReady;

  return (
    <div className="surface setup-surface">
      <SurfaceIntro
        eyebrow="01 · Prepare the physical game"
        title="Seat the players and confirm the printed components."
      />

      <section className="setup-now" aria-labelledby="setup-now-title">
        <div className="setup-now__number" aria-hidden="true">
          01
        </div>
        <div>
          <p className="eyebrow">Now</p>
          <h3 id="setup-now-title" className="display-serif">
            Seat {session.draft.playerCount} players.
          </h3>
          <p>
            Match each person to one printed Starter Profile, then confirm the
            physical table is ready.
          </p>
        </div>
        {/* The code and the action to share it belong together, at the moment
            sharing is what the host actually has to do. */}
        <div className="setup-now__code">
          <Metric
            label="Table code"
            value={session.code}
            detail="Share after seating players"
            signal
          />
          <CopyButton
            onCopy={onCopyCode}
            label="Copy table code"
            confirmedLabel="Code copied"
          />
        </div>
      </section>

      <div className="setup-layout">
        <section className="setup-roster" aria-labelledby="setup-roster-title">
          <header>
            <div>
              <p className="eyebrow">Player register</p>
              <h3 id="setup-roster-title">Who is at this table?</h3>
            </div>
            <div className="player-count" role="group" aria-label="Player count">
              {[2, 3, 4, 5].map((count) => (
                <button
                  type="button"
                  key={count}
                  aria-pressed={session.draft.playerCount === count}
                  disabled={!canEdit}
                  onClick={() => onPlayerCountChange(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </header>

          <ol className="player-register">
            {drafts.map((player, index) => {
              const profile = game.cards.starterProfiles.find(
                (item) => item.id === player.profileId,
              );
              return (
                <li key={`draft-player-${index}`}>
                  <span className="player-register__index">
                    P{String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="field">
                    <Label htmlFor={`player-${index}-name`}>Player name</Label>
                    <Input
                      id={`player-${index}-name`}
                      value={player.name}
                      disabled={!canEdit}
                      maxLength={32}
                      onChange={(event) =>
                        onPlayerChange(index, { name: event.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor={`player-${index}-profile`}>
                      Printed profile
                    </Label>
                    <Select
                      value={player.profileId}
                      disabled={!canEdit}
                      onValueChange={(profileId) =>
                        onPlayerChange(index, { profileId })
                      }
                    >
                      <SelectTrigger id={`player-${index}-profile`}>
                        <SelectValue placeholder="Choose a profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {game.cards.starterProfiles.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.id} · {item.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="profile-proof">
                    <strong>{profile?.title ?? "Choose a printed profile"}</strong>
                    <span>
                      {profile
                        ? `${profile.trait} · starts with ₹${profile.cash.toLocaleString("en-IN")}`
                        : "Profile bonus appears here."}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="readiness-spine" aria-labelledby="readiness-title">
          <header>
            <Box aria-hidden="true" />
            <div>
              <p className="eyebrow">Readiness spine</p>
              <h3 id="readiness-title">Physical table check</h3>
            </div>
          </header>
          <ol>
            <li>
              <StatusMark done={drafts.length >= 2}>
                2–5 players are seated
              </StatusMark>
            </li>
            <li>
              <StatusMark done={named}>Every player name is recorded</StatusMark>
            </li>
            <li>
              <StatusMark done={profiled}>
                Starter Profiles match printed cards
              </StatusMark>
            </li>
            {setupItems.map((item, index) => {
              const key = `setup-${index}`;
              return (
                <li key={key}>
                  <label className="setup-physical-check">
                    <input
                      type="checkbox"
                      checked={Boolean(setupChecklist[key])}
                      disabled={!canEdit}
                      onChange={(event) =>
                        onSetupCheck(key, event.target.checked)
                      }
                    />
                    <StatusMark done={Boolean(setupChecklist[key])}>
                      {item}
                    </StatusMark>
                  </label>
                </li>
              );
            })}
          </ol>

          <div className="board-mini-map" role="img" aria-label="44 space route from S00 to S43">
            {game.boardSpaces.map((space, index) => (
              <span
                key={space.id}
                data-major={index % 6 === 0 || index === 43 || undefined}
                title={`${space.id}: ${space.label}`}
              >
                {index % 6 === 0 || index === 43 ? space.id : ""}
              </span>
            ))}
          </div>

          <MetalButton
            disabled={!ready || !canEdit}
            onClick={onStart}
            className="start-game-action"
          >
            <Check aria-hidden="true" />
            Start physical game
          </MetalButton>
          {!canEdit && (
            <p className="readonly-note">
              Only the host can change setup or start the table.
            </p>
          )}
        </aside>
      </div>
      <p className="surface-footnote">
        <UsersRound aria-hidden="true" /> Names and profile IDs synchronize with
        every joined screen; printed cards remain the source of truth.
      </p>
    </div>
  );
}
