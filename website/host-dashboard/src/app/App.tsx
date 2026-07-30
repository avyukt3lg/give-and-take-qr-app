import {
  lazy,
  Suspense,
  useEffect,
  useReducer,
  useState,
  type Dispatch,
} from "react";

import type {
  AccessMode,
  AuthDraft,
  BackendSnapshot,
} from "@/app/contracts";
import {
  createFixtureState,
  requestedFixtureRole,
  type FixtureRole,
} from "@/app/fixture";
import { SceneOrchestrator } from "@/components/brand/SceneOrchestrator";
import { AppShell } from "@/components/layout/AppShell";
import { LiveMessage } from "@/components/layout/LiveMessage";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { Button } from "@/components/ui/button";
import {
  adjustPlayer,
  applyPrintedCard,
  applyChoice,
  buyInvestment,
  chooseEthics,
  completeRebalance,
  completeResolution,
  confirmPawnPosition,
  cancelRoll,
  endTurn,
  passInvestment,
  revealMarketEvent,
  resolveActionCard,
  rollDie,
  scoreReflection,
  sellHolding,
  setPhysicalCheck,
  startSession,
  updateDraft,
  takeNextSyncedCard,
  undoManualAdjustment,
} from "@/domain/game-engine";
import {
  deckKeyForCardId,
  normaliseCardId,
} from "@/domain/game-config";
import { exportCsv, exportEvidence } from "@/domain/exports";
import type {
  AdjustablePlayerField,
  GameDefinition,
  PhysicalCheckKey,
  ViewId,
} from "@/domain/types";
import { EntryScreen } from "@/features/entry/EntryScreen";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSystemReducedMotion } from "@/hooks/useReducedMotion";
import { useTableRuntime } from "@/hooks/useTableRuntime";
import {
  hydrateStorage,
  loadGameConfig,
  type StorageHydration,
} from "@/services";
import {
  appReducer,
  createInitialAppState,
  selectCanEditSession,
  selectAssistPlayer,
  selectCurrentSetupChecklist,
  selectEffectiveCompanionMode,
  type AppAction,
  type AppState,
} from "@/state";
import "@/styles/surfaces.css";

const SetupView = lazy(async () => ({
  default: (await import("@/features/setup/SetupView")).SetupView,
}));
const PlayView = lazy(async () => ({
  default: (await import("@/features/play/PlayView")).PlayView,
}));
const MarketView = lazy(async () => ({
  default: (await import("@/features/market/MarketView")).MarketView,
}));
const LedgerView = lazy(async () => ({
  default: (await import("@/features/ledger/LedgerView")).LedgerView,
}));
const ScoresView = lazy(async () => ({
  default: (await import("@/features/scoring/ScoresView")).ScoresView,
}));
const ExportView = lazy(async () => ({
  default: (await import("@/features/export/ExportView")).ExportView,
}));
const HelpView = lazy(async () => ({
  default: (await import("@/features/help/HelpView")).HelpView,
}));
const TableDisplay = lazy(async () => ({
  default: (await import("@/features/modes/TableDisplay")).TableDisplay,
}));
const PlayerAssist = lazy(async () => ({
  default: (await import("@/features/modes/PlayerAssist")).PlayerAssist,
}));

function SurfaceLoading() {
  return (
    <div className="surface-loading" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <p>Preparing this table instrument…</p>
    </div>
  );
}

function LazySurface({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<SurfaceLoading />}>{children}</Suspense>;
}

interface BootstrapState {
  game: GameDefinition | null;
  hydration: StorageHydration | null;
  fixtureRole: FixtureRole | null;
  error: Error | null;
}

const EMPTY_HYDRATION: StorageHydration = {
  ok: false,
  auth: null,
  backend: null,
  session: null,
  ui: {},
  clientId: null,
  errors: ["Browser storage was unavailable during startup."],
};

function backendSnapshot(state: AppState): BackendSnapshot {
  const mappedState: BackendSnapshot["state"] =
    state.backend.saveState === "connected"
      ? "idle"
      : state.backend.saveState === "synced"
        ? "saved"
        : state.backend.saveState === "failed"
          ? state.backend.online
            ? "error"
            : "offline"
          : state.backend.saveState;
  return {
    state: mappedState,
    detail:
      state.backend.unavailableReason ||
      (state.backend.saveState === "synced"
        ? "Shared table up to date"
        : "Supabase session sync"),
    revision: state.backend.revision,
    lastSavedAt: state.backend.lastSavedAt,
    role: state.backend.clientRole,
  };
}

function downloadText(
  filename: string,
  text: string,
  type: string,
): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(
  value: string,
  successMessage: string,
  dispatch: Dispatch<AppAction>,
): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard access is not available in this browser.");
    }
    await navigator.clipboard.writeText(value);
    dispatch({ type: "MESSAGE_SET", message: successMessage });
  } catch (cause) {
    dispatch({
      type: "MESSAGE_SET",
      message:
        cause instanceof Error
          ? `Copy failed: ${cause.message}`
          : "Copy failed. Select and copy the text manually.",
      assertive: true,
    });
  }
}

function focusMain(): void {
  requestAnimationFrame(() => {
    // preventScroll: false let the browser scroll #main-content flush to the
    // viewport top, which slid the first 88px of the surface underneath the
    // sticky workspace header — the Play headline was occluded at rest.
    // Move focus for screen readers, then put the page at the actual top of
    // the new surface ourselves.
    document.getElementById("main-content")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}

function SurfaceRouter({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}) {
  const { game, session } = state;
  const canEdit = selectCanEditSession(state);

  const domain = (result: ReturnType<typeof completeResolution>) =>
    dispatch({ type: "DOMAIN_RESULT", result });

  const resolve = (choice?: string) => {
    const pending = state.session.pendingResolution;
    if (!pending) {
      domain(completeResolution(session));
      return;
    }
    if (choice?.startsWith("card:")) {
      domain(applyPrintedCard(session, game, choice.slice(5)));
      return;
    }
    if (pending.cardDeck && !pending.cardId) {
      domain(takeNextSyncedCard(session, game));
      return;
    }
    if (pending.cardDeck === "investments" && pending.cardId) {
      domain(
        choice === "buy"
          ? buyInvestment(session, game, pending.cardId)
          : passInvestment(session, game, pending.cardId),
      );
      return;
    }
    if (
      pending.cardDeck === "ethics" &&
      (choice === "profit" || choice === "responsible")
    ) {
      domain(chooseEthics(session, game, choice));
      return;
    }
    if (pending.cardDeck === "actions") {
      domain(
        resolveActionCard(
          session,
          game,
          choice?.startsWith("action:") ? choice.slice(7) : "",
        ),
      );
      return;
    }
    if (pending.cardDeck === "reflection") {
      const score = Number(choice?.split(":")[1] ?? 0);
      domain(scoreReflection(session, game, score));
      return;
    }
    if (choice === "rebalance") {
      domain(completeRebalance(session));
      return;
    }
    if (choice?.startsWith("rebalance-sell:")) {
      const player = session.players[session.currentPlayerIndex];
      if (player) {
        domain(
          sellHolding(
            session,
            game,
            player.id,
            choice.slice("rebalance-sell:".length),
            true,
          ),
        );
      }
      return;
    }
    const space = game.boardSpaces.find((item) => item.id === pending.spaceId);
    const choiceIndex = space?.choices?.indexOf(choice ?? "") ?? -1;
    if (choiceIndex >= 0) {
      domain(applyChoice(session, game, choiceIndex));
      return;
    }
    domain(completeResolution(session));
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) {
      dispatch({
        type: "MESSAGE_SET",
        message: "Read-aloud is not supported by this browser.",
      });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  };

  switch (session.view) {
    case "setup":
      return (
        <SetupView
          game={game}
          session={session}
          canEdit={canEdit && !session.started}
          setupChecklist={selectCurrentSetupChecklist(state)}
          onPlayerCountChange={(count) =>
            domain(updateDraft(session, count, session.draft.players))
          }
          onPlayerChange={(index, patch) => {
            const players = session.draft.players.map((player, playerIndex) =>
              playerIndex === index ? { ...player, ...patch } : player,
            );
            domain(updateDraft(session, session.draft.playerCount, players));
          }}
          onStart={() =>
            domain(
              startSession(
                session,
                game,
                session.draft.players.slice(0, session.draft.playerCount),
              ),
            )
          }
          onCopyCode={() =>
            void copyText(
              session.code,
              `${session.code} copied.`,
              dispatch,
            )
          }
          onSetupCheck={(key, checked) =>
            dispatch({ type: "SETUP_CHECK_SET", key, checked })
          }
        />
      );
    case "play":
      return (
        <PlayView
          game={game}
          session={session}
          dieDraft={state.ui.pendingPhysicalDie}
          noteDraft={state.ui.turnNoteDraft}
          cardLookup={state.ui.cardLookupId}
          spaceLookup={state.ui.boardLookupId}
          canEdit={canEdit}
          onDieChange={(die) => dispatch({ type: "DIE_DRAFT_SET", die })}
          onRoll={() => {
            const result = rollDie(
              session,
              game,
              state.ui.pendingPhysicalDie,
            );
            if (result.undoSession) {
              dispatch({
                type: "UNDO_SNAPSHOT_SET",
                session: result.undoSession,
              });
            }
            dispatch({ type: "DOMAIN_RESULT", result });
            dispatch({ type: "DIE_DRAFT_SET", die: null });
          }}
          onConfirmMove={() => domain(confirmPawnPosition(session))}
          onUndoRoll={() => {
            domain(cancelRoll(session, state.ui.undoRollSession));
            dispatch({ type: "UNDO_SNAPSHOT_SET", session: null });
          }}
          onResolve={resolve}
          onNoteChange={(note) => dispatch({ type: "TURN_NOTE_SET", note })}
          onChecklistChange={(key, checked) =>
            domain(
              setPhysicalCheck(
                session,
                key as PhysicalCheckKey,
                checked,
              ),
            )
          }
          onEndTurn={() => {
            domain(endTurn(session, game, state.ui.turnNoteDraft));
            dispatch({ type: "TURN_NOTE_SET", note: "" });
          }}
          onCardLookupChange={(cardLookupId) =>
            dispatch({ type: "UI_PATCH", patch: { cardLookupId } })
          }
          onSpaceLookupChange={(boardLookupId) =>
            dispatch({ type: "UI_PATCH", patch: { boardLookupId } })
          }
          onPreviewCard={(rawId) => {
            const id = normaliseCardId(rawId);
            const deck = deckKeyForCardId(id);
            const card = deck
              ? game.cards[deck].find((item) => item.id === id)
              : null;
            dispatch({
              type: "MESSAGE_SET",
              message: card
                ? `${card.id} · ${card.title}`
                : `No printed card found for ${id || "that ID"}.`,
            });
          }}
          onSpeak={speak}
        />
      );
    case "market":
      return (
        <MarketView
          game={game}
          session={session}
          canEdit={canEdit}
          onReveal={() =>
            domain(
              revealMarketEvent(
                session,
                game,
                "Host manual Market/Life reveal",
              ),
            )
          }
        />
      );
    case "players":
      return (
        <LedgerView
          game={game}
          session={session}
          canEdit={canEdit}
          onAdjust={(playerId, field, delta, reason) =>
            domain(
              adjustPlayer(
                session,
                playerId,
                field as AdjustablePlayerField,
                delta,
                reason,
              ),
            )
          }
          onSell={(playerId, assetId) =>
            domain(sellHolding(session, game, playerId, assetId))
          }
          onUndoAdjustment={() => domain(undoManualAdjustment(session))}
        />
      );
    case "scoring":
      return (
        <ScoresView
          game={game}
          session={session}
          onExport={() => {
            dispatch({ type: "VIEW_SET", view: "export" });
            focusMain();
          }}
          onSpeak={speak}
        />
      );
    case "export":
      return (
        <ExportView
          game={game}
          session={session}
          exportText={state.exportText}
          lastSavedAt={state.backend.lastSavedAt}
          onRefresh={() =>
            dispatch({
              type: "EXPORT_SET",
              text: exportEvidence(session, game),
            })
          }
          onCopy={() =>
            void copyText(
              state.exportText || exportEvidence(session, game),
              "Formatted evidence JSON copied.",
              dispatch,
            )
          }
          onDownload={(kind) => {
            if (kind === "print") {
              window.print();
              return;
            }
            const stem = `give-and-take-${session.code.toLowerCase()}`;
            downloadText(
              `${stem}.${kind}`,
              kind === "csv"
                ? exportCsv(session, game)
                : exportEvidence(session, game),
              kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
            );
          }}
        />
      );
    case "rules":
      return (
        <HelpView
          game={game}
          query={state.ui.rulesQuery}
          onQueryChange={(rulesQuery) =>
            dispatch({ type: "UI_PATCH", patch: { rulesQuery } })
          }
          onSpeak={speak}
        />
      );
  }
}

function TableApplication({
  game,
  hydration,
  fixtureRole,
}: {
  game: GameDefinition;
  hydration: StorageHydration;
  fixtureRole: FixtureRole | null;
}) {
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    () =>
      fixtureRole
        ? createFixtureState(game, hydration, fixtureRole)
        : createInitialAppState(game, hydration),
  );
  const [password, setPassword] = useState("");
  const runtime = useTableRuntime(
    state,
    dispatch,
    hydration,
    fixtureRole !== null,
  );
  const systemReducedMotion = useSystemReducedMotion();
  const reducedMotion = state.ui.reducedMotion || systemReducedMotion;
  const companionMode = selectEffectiveCompanionMode(state);
  const selectedAssist = selectAssistPlayer(state);
  const joinedPlayer =
    state.backend.clientRole === "player"
      ? state.session.players.find(
          (player) =>
            player.name.trim().toLowerCase() ===
            state.auth?.name.trim().toLowerCase(),
        ) ?? null
      : null;
  const backend = backendSnapshot(state);
  const playerLocked = state.backend.clientRole === "player";

  useDocumentTitle(
    state.auth
      ? `${state.session.code} · Give And Take`
      : "Give And Take — Table Companion",
  );

  const setView = (view: ViewId) => {
    dispatch({ type: "VIEW_SET", view });
    focusMain();
  };

  const settings = (
    <SettingsDialog
      theme={state.ui.theme}
      companionMode={companionMode}
      reducedMotion={reducedMotion}
      gameStarted={state.session.started}
      playerLocked={playerLocked}
      onThemeChange={(theme) => dispatch({ type: "THEME_SET", theme })}
      onModeChange={(mode) =>
        dispatch({ type: "COMPANION_MODE_SET", mode })
      }
      onReducedMotionChange={(reduced) =>
        dispatch({ type: "REDUCED_MOTION_SET", reduced })
      }
    />
  );

  if (!state.auth) {
    const authDraft: AuthDraft = {
      ...state.ui.authDraft,
      password,
    };
    return (
      <SceneOrchestrator>
        <EntryScreen
          mode={state.authTab as AccessMode}
          draft={authDraft}
          pending={state.ui.authPending}
          error={state.ui.authError || null}
          backendError={
            state.backend.saveState === "failed"
              ? state.backend.unavailableReason ||
                "Supabase could not be initialized."
              : null
          }
          theme={state.ui.theme}
          reducedMotion={reducedMotion}
          onModeChange={(tab) =>
            dispatch({ type: "AUTH_TAB_SET", tab })
          }
          onDraftChange={(patch) => {
            if (patch.password !== undefined) setPassword(patch.password);
            const authDraftPatch = { ...patch };
            delete authDraftPatch.password;
            dispatch({
              type: "UI_PATCH",
              patch: {
                authDraft: {
                  ...state.ui.authDraft,
                  ...authDraftPatch,
                },
              },
            });
          }}
          onSubmit={(input) => void runtime.submitAuth(input)}
          onRetryBackend={() => void runtime.reinitializeBackend()}
          onThemeChange={(theme) =>
            dispatch({ type: "THEME_SET", theme })
          }
          onReducedMotionChange={(reduced) =>
            dispatch({ type: "REDUCED_MOTION_SET", reduced })
          }
        />
      </SceneOrchestrator>
    );
  }

  if (companionMode === "table" && state.session.started) {
    return (
      <>
        <a className="skip-link" href="#main-content">
          Skip to table display
        </a>
        <LazySurface>
          <TableDisplay
            game={game}
            session={state.session}
            settings={settings}
          />
        </LazySurface>
        <LiveMessage
          message={state.message}
          assertive={state.messageAssertive}
          onDismiss={() => dispatch({ type: "MESSAGE_SET", message: "" })}
        />
      </>
    );
  }

  if (companionMode === "player" && state.session.started) {
    return (
      <>
        <a className="skip-link" href="#main-content">
          Skip to player assist
        </a>
        <LazySurface>
          <PlayerAssist
          game={game}
          session={state.session}
          selectedPlayerId={
            playerLocked
              ? joinedPlayer?.id ?? null
              : state.ui.selectedAssistPlayerId || selectedAssist?.id || null
          }
            playerLocked={playerLocked}
            settings={settings}
          onSelectPlayer={(selectedAssistPlayerId) =>
              dispatch({
                type: "UI_PATCH",
                patch: { selectedAssistPlayerId },
            })
          }
          onLeave={() => void runtime.signOut()}
        />
        </LazySurface>
        <LiveMessage
          message={state.message}
          assertive={state.messageAssertive}
          onDismiss={() => dispatch({ type: "MESSAGE_SET", message: "" })}
        />
      </>
    );
  }

  return (
    <>
      <AppShell
        session={state.session}
        view={state.session.view}
        theme={state.ui.theme}
        companionMode={companionMode}
        reducedMotion={reducedMotion}
        backend={backend}
        hostUnsyncedState={runtime.hostUnsyncedState}
        playerLocked={playerLocked}
        onViewChange={setView}
        onThemeChange={(theme) => dispatch({ type: "THEME_SET", theme })}
        onModeChange={(mode) =>
          dispatch({ type: "COMPANION_MODE_SET", mode })
        }
        onReducedMotionChange={(reduced) =>
          dispatch({ type: "REDUCED_MOTION_SET", reduced })
        }
        onRetrySave={() => void runtime.retrySync()}
        onNewSession={(discardUnsynced) =>
          void runtime.newSession({ discardUnsynced })
        }
        onSignOut={(discardUnsynced) =>
          void runtime.signOut({ discardUnsynced })
        }
      >
        <LazySurface>
          <SurfaceRouter state={state} dispatch={dispatch} />
        </LazySurface>
      </AppShell>
      <LiveMessage
        message={state.message}
        assertive={state.messageAssertive}
        onDismiss={() => dispatch({ type: "MESSAGE_SET", message: "" })}
      />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {state.ui.announcement}
      </div>
    </>
  );
}

export function App() {
  const [attempt, setAttempt] = useState(0);
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    game: null,
    hydration: null,
    fixtureRole: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    void loadGameConfig()
      .then((game) => {
        if (!active) return;
        let hydration = EMPTY_HYDRATION;
        try {
          hydration = hydrateStorage(window.localStorage);
        } catch {
          // EMPTY_HYDRATION explicitly prevents writes after failed hydration.
        }
        setBootstrap({
          game,
          hydration,
          fixtureRole: requestedFixtureRole(),
          error: null,
        });
      })
      .catch((cause) => {
        if (!active) return;
        setBootstrap({
          game: null,
          hydration: null,
          fixtureRole: null,
          error:
            cause instanceof Error
              ? cause
              : new Error("The game configuration could not be loaded."),
        });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (bootstrap.error) {
    return (
      <main id="main-content" className="fatal-stage" tabIndex={-1}>
        <p className="eyebrow">Configuration unavailable</p>
        <h1 className="display-serif">The table cannot open safely.</h1>
        <p>{bootstrap.error.message}</p>
        <Button
          onClick={() => {
            setBootstrap({
              game: null,
              hydration: null,
              fixtureRole: null,
              error: null,
            });
            setAttempt((value) => value + 1);
          }}
        >
          Retry configuration
        </Button>
      </main>
    );
  }

  if (!bootstrap.game || !bootstrap.hydration) {
    return (
      <main id="main-content" className="boot-stage" tabIndex={-1}>
        <span className="boot-mark" aria-hidden="true">
          G/T
        </span>
        <p>Reading the printed game contract…</p>
      </main>
    );
  }

  return (
    <TableApplication
      game={bootstrap.game}
      hydration={bootstrap.hydration}
      fixtureRole={bootstrap.fixtureRole}
    />
  );
}
