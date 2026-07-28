import { currentPlayer } from "../domain/session";
import type { Player } from "../domain/types";
import type { AppState } from "./app-state";

export function selectCurrentPlayer(state: AppState): Player | null {
  return currentPlayer(state.session);
}

export function selectCanEditSession(state: AppState): boolean {
  return state.backend.clientRole !== "player";
}

export type HostUnsyncedState = "none" | "saving" | "failed";

export function selectHostUnsyncedState(
  state: AppState,
): HostUnsyncedState {
  if (state.backend.clientRole !== "host") return "none";
  if (
    state.backend.saving ||
    state.backend.saveState === "saving"
  ) {
    return "saving";
  }
  if (state.backend.saveState === "failed") return "failed";
  return "none";
}

export function selectHostHasUnsyncedChanges(state: AppState): boolean {
  return selectHostUnsyncedState(state) !== "none";
}

export interface SessionReplacementGuard {
  allowed: boolean;
  requiresConfirmation: boolean;
  inFlight: boolean;
  reason: "player" | "unsynced" | null;
}

export function selectSessionReplacementGuard(
  state: AppState,
): SessionReplacementGuard {
  if (state.backend.clientRole === "player") {
    return {
      allowed: false,
      requiresConfirmation: false,
      inFlight: false,
      reason: "player",
    };
  }
  if (selectHostHasUnsyncedChanges(state)) {
    const inFlight = state.backend.saving;
    return {
      allowed: false,
      requiresConfirmation: !inFlight,
      inFlight,
      reason: "unsynced",
    };
  }
  return {
    allowed: true,
    requiresConfirmation: false,
    inFlight: false,
    reason: null,
  };
}

export function selectEffectiveCompanionMode(
  state: AppState,
): AppState["ui"]["companionMode"] {
  return state.backend.clientRole === "player"
    ? "player"
    : state.ui.companionMode || "host";
}

export function selectAssistPlayer(state: AppState): Player | null {
  const selected = state.session.players.find(
    (player) => player.id === state.ui.selectedAssistPlayerId,
  );
  if (selected) return selected;

  const authName = state.auth?.name.trim().toLowerCase() ?? "";
  const byName = state.session.players.find(
    (player) => player.name.trim().toLowerCase() === authName,
  );
  return (
    byName ??
    selectCurrentPlayer(state) ??
    state.session.players[0] ??
    null
  );
}

export function selectCurrentSetupChecklist(
  state: AppState,
): Record<string, boolean> {
  return state.ui.setupChecklistBySession[state.session.code] ?? {};
}

export function selectCurrentTurnLabel(state: AppState): string {
  const player = selectCurrentPlayer(state);
  if (!state.session.started || !player) return "Setup";
  return `${Math.min(player.turnsTaken + 1, state.game.turnLimit)} / ${
    state.game.turnLimit
  }`;
}

export function selectSaveLabel(state: AppState): string {
  if (state.backend.saving || state.backend.saveState === "saving") {
    return "Saving to Supabase";
  }
  if (state.backend.saveState === "failed") {
    return state.session.started
      ? "Shared sync offline"
      : "Shared table unavailable";
  }
  return "Saved to Supabase";
}
