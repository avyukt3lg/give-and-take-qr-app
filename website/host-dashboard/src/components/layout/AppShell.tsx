import { RotateCw } from "lucide-react";
import type { PropsWithChildren } from "react";

import type { CompanionMode, GameSession, ThemeId, ViewId } from "@/domain/types";
import type { HostUnsyncedState } from "@/state";
import type { BackendSnapshot } from "@/app/contracts";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "./SettingsDialog";
import { MobileNavigation } from "./MobileNavigation";
import { NAVIGATION_ITEMS, navigationItem } from "./navigation";
import { SessionActions } from "./SessionActions";

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
}: AppShellProps) {
  const current = navigationItem(view);

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
          <small>Revision {backend.revision}</small>
        </div>
        <nav className="desktop-navigation" aria-label="Game sections">
          {NAVIGATION_ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => onViewChange(item.id)}
              >
                <span className="desktop-navigation__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="command-rail__footer">
          <div
            className="save-indicator"
            data-state={backend.state}
            aria-live="polite"
          >
            <span aria-hidden="true" />
            <div>
              <strong>{backend.state === "saved" ? "Synced" : backend.state}</strong>
              <small>{backend.detail}</small>
            </div>
            {(backend.state === "error" || backend.state === "offline") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRetrySave}
                aria-label="Retry session sync"
              >
                <RotateCw aria-hidden="true" />
              </Button>
            )}
          </div>
          <SessionActions
            hostUnsyncedState={hostUnsyncedState}
            playerLocked={playerLocked}
            onNewSession={onNewSession}
            onSignOut={onSignOut}
          />
        </div>
      </aside>

      <section className="app-workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">
              {session.started ? `Turn table · ${session.phase}` : "Table preparation"}
            </p>
            <h1 className="display-serif">{current.label}</h1>
          </div>
          <div className="workspace-header__tools">
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
      </section>

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
