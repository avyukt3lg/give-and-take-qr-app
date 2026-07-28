import { applyMarketEvent, startSession } from "@/domain/game-engine";
import { createSession } from "@/domain/session";
import type { GameDefinition } from "@/domain/types";
import type { StorageHydration } from "@/services";
import { createInitialAppState, type AppState } from "@/state";

export type FixtureRole = "host" | "player";

export function requestedFixtureRole(): FixtureRole | null {
  if (!(import.meta.env.DEV || import.meta.env.MODE === "test")) return null;
  const fixture = new URLSearchParams(window.location.search).get("fixture");
  return fixture === "host" || fixture === "player" ? fixture : null;
}

export function createFixtureState(
  game: GameDefinition,
  hydration: StorageHydration,
  role: FixtureRole,
): AppState {
  const base = createSession(
    game,
    {
      now: () => "2026-07-28T09:30:00.000Z",
      random: () => 0.314,
      createId: () => "fixture-id",
    },
    "GT-4827",
  );
  const profiles = game.cards.starterProfiles.slice(0, 3);
  let session = startSession(
    base,
    game,
    profiles.map((profile, index) => ({
      name: ["Aanya", "Kabir", "Mira"][index] ?? `Player ${index + 1}`,
      profileId: profile.id,
    })),
  ).session;

  const first = session.players[0];
  const second = session.players[1];
  const third = session.players[2];
  if (first) {
    first.cash = 36_000;
    first.position = 12;
    first.turnsTaken = 4;
    first.holdings = { bond: 2, ethical: 1, growth: 1 };
    first.riskEvidence = 3;
    first.ethicsPosition = 2;
    first.reflectionEvidence = 4;
  }
  if (second) {
    second.cash = 28_000;
    second.position = 10;
    second.turnsTaken = 4;
    second.holdings = { index: 2, crypto: 1 };
    second.riskEvidence = 2;
    second.ethicsPosition = 0;
    second.reflectionEvidence = 3;
  }
  if (third) {
    third.cash = 42_000;
    third.position = 8;
    third.turnsTaken = 3;
    third.holdings = { cash: 2, ethical: 2 };
    third.riskEvidence = 4;
    third.ethicsPosition = 3;
    third.reflectionEvidence = 2;
  }

  const event = game.cards.events[0];
  if (event) {
    session = applyMarketEvent(
      session,
      game,
      event,
      "fixture",
      {
        now: () => "2026-07-28T09:35:00.000Z",
        random: () => 0.314,
        createId: () => "fixture-event",
      },
    ).session;
  }
  session.view = "play";

  // Session, auth and backend are discarded so the fixture is deterministic and
  // never touches a real table. UI preferences are kept: theme and reduced
  // motion are display settings, and honouring them is what makes the fixture
  // usable for verifying themes and the reduced-motion path.
  const state = createInitialAppState(
    game,
    { ...hydration, auth: null, backend: null, session: null },
  );
  return {
    ...state,
    auth: {
      mode: "guest",
      id: "fixture-client",
      name: role === "player" ? first?.name ?? "Aanya" : "Fixture Host",
      email: null,
    },
    session,
    backend: {
      ...state.backend,
      online: true,
      saveState: "synced",
      clientRole: role,
      revision: 7,
      lastSavedAt: "2026-07-28T09:35:00.000Z",
    },
    ui: {
      ...state.ui,
      companionMode: role === "player" ? "player" : "host",
      selectedAssistPlayerId: role === "player" ? first?.id ?? "" : "",
    },
  };
}
