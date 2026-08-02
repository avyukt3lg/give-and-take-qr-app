import { useEffect, type PropsWithChildren } from "react";

import type { CompanionMode, GameSession, ThemeId, ViewId } from "@/domain/types";
import type { HostUnsyncedState } from "@/state";
import type { BackendSnapshot } from "@/app/contracts";
import { BrandMark } from "@/components/brand/BrandMark";
import { SettingsDialog } from "./SettingsDialog";
import { MobileNavigation } from "./MobileNavigation";
import { NAVIGATION_ITEMS, navigationItem } from "./navigation";
import { RoutePositionStamp } from "./RoutePositionStamp";
import { SessionActions } from "./SessionActions";
import { SyncIndicator } from "./SyncIndicator";

export interface AppShellProps extends PropsWithChildren {
  session: GameSession;
  view: ViewId;
  theme: ThemeId;
  companionMode: CompanionMode;
  reducedMotion: boolean;
  backend: BackendSnapshot;
  hostUnsyncedState: HostUnsyncedState;
  playerLocked: boolean;
  onViewChange(view: ViewId): void;
  onThemeChange(theme: ThemeId): void;
  onModeChange(mode: CompanionMode): void;
  onReducedMotionChange(reduced: boolean): void;
  onRetrySave(): void;
  onNewSession(discardUnsynced: boolean): void;
  onSignOut(discardUnsynced: boolean): void;
  onReady?(): void;
}

export function AppShell({
  session,
  view,
  theme,
  companionMode,
  reducedMotion,
  backend,
  hostUnsyncedState,
  playerLocked,
  children,
  onViewChange,
  onThemeChange,
  onModeChange,
  onReducedMotionChange,
  onRetrySave,
  onNewSession,
  onSignOut,
  onReady,
}: AppShellProps) {
  const current = navigationItem(view);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  // The header eyebrow used to read "Turn table · <phase>" on every surface,
  // so Market, Ledger, Scores, Export and Help all carried a phase that had
  // nothing to do with them. Whose turn it is and which phase they are in is
  // genuinely persistent context, so state that instead — it is never stale.
  const activePlayer = session.started
    ? session.players[session.currentPlayerIndex]
    : undefined;
  const headerContext = session.started
    ? activePlayer
      ? `${activePlayer.name} · ${session.phase}`
      : session.phase
    : "Table preparation";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to current table view
      </a>

      <aside className="command-rail">
        <BrandMark />
        <div className="table-code-block" aria-label={`Session ${session.code}`}>
          <span>Live table</span>
          <strong>{session.code}</strong>
          {/* The revision moved to the sync indicator, which is where it means
              something — it is the host's proof a save landed, so it belongs next
              to the connection state rather than beside the table code. */}
        </div>
        <nav className="desktop-navigation" aria-label="Game sections">
          {NAVIGATION_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const isCurrent = view === item.id;
            return (
              <button
                type="button"
                key={item.id}
                aria-current={isCurrent ? "page" : undefined}
                aria-label={`${item.label} — ${item.description}`}
                onClick={() => onViewChange(item.id)}
              >
                <span className="desktop-navigation__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  {/* Seven descriptions at once overflowed the rail past the
                      fold. Only the destination you are on has to explain
                      itself; the rest are reachable by label, and the full
                      description stays on every button's aria-label. */}
                  {isCurrent && <small>{item.description}</small>}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="command-rail__footer">
          <SyncIndicator
            backend={backend}
            reducedMotion={reducedMotion}
            onRetry={onRetrySave}
          />
          <SessionActions
            hostUnsyncedState={hostUnsyncedState}
            playerLocked={playerLocked}
            onNewSession={onNewSession}
            onSignOut={onSignOut}
          />
        </div>
      </aside>

      <div className="app-workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{headerContext}</p>
            <h1 className="display-serif">{current.label}</h1>
          </div>
          <div className="workspace-header__tools">
            {activePlayer && <RoutePositionStamp player={activePlayer} />}
            {/* Duplicates the rail's table-code block wherever the rail is
                visible, so it only earns its place once the rail is gone. */}
            <span className="header-code">{session.code}</span>
            <SettingsDialog
              theme={theme}
              companionMode={companionMode}
              reducedMotion={reducedMotion}
              gameStarted={session.started}
              playerLocked={playerLocked}
              onThemeChange={onThemeChange}
              onModeChange={onModeChange}
              onReducedMotionChange={onReducedMotionChange}
            />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="surface-stage">
          {children}
        </main>
      </div>

      <MobileNavigation
        activeView={view}
        hostUnsyncedState={hostUnsyncedState}
        playerLocked={playerLocked}
        onViewChange={onViewChange}
        onNewSession={onNewSession}
        onSignOut={onSignOut}
      />
    </div>
  );
}
