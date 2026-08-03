import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import rawGame from "../../../../../game_data/game_config.json";
import { normaliseGame } from "@/domain/game-config";
import { createSession } from "@/domain/session";
import {
  applyMarketEvent,
  confirmPawnPosition,
  rollDie,
  startSession,
} from "@/domain/game-engine";
import { AccessForm } from "@/features/entry/AccessForm";
import { EntryScreen } from "@/features/entry/EntryScreen";
import { ExportView } from "@/features/export/ExportView";
import { LedgerView } from "@/features/ledger/LedgerView";
import { MarketView } from "@/features/market/MarketView";
import { PlayView } from "@/features/play/PlayView";
import { SetupView } from "@/features/setup/SetupView";

const game = normaliseGame(rawGame);

describe("React production surfaces", () => {
  it("offers a pre-auth retry when the shared backend fails to initialize", async () => {
    const user = userEvent.setup();
    const onRetryBackend = vi.fn();

    render(
      <EntryScreen
        game={game}
        mode="guest"
        draft={{
          name: "",
          email: "",
          password: "",
          code: "GT-",
        }}
        pending={false}
        error={null}
        backendError="Supabase connection timed out."
        theme="table"
        reducedMotion
        onModeChange={vi.fn()}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onRetryBackend={onRetryBackend}
        onThemeChange={vi.fn()}
        onReducedMotionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Supabase connection timed out.",
    );
    await user.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(onRetryBackend).toHaveBeenCalledOnce();
  });

  it("submits the actual GT code and player name from Join", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AccessForm
        mode="join"
        draft={{
          name: "Mira",
          email: "",
          password: "",
          code: "GT-4827",
        }}
        pending={false}
        error={null}
        onDraftChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText("Session code")).toHaveValue("GT-4827");
    await user.click(screen.getByRole("button", { name: /join session/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "join",
      name: "Mira",
      code: "GT-4827",
      email: undefined,
      password: undefined,
    });
  });

  it("renders the real 44-space relief on Entry", () => {
    const { container } = render(
      <EntryScreen
        game={game}
        mode="guest"
        draft={{
          name: "",
          email: "",
          password: "",
          code: "GT-",
        }}
        pending={false}
        error={null}
        backendError={null}
        theme="table"
        reducedMotion
        onModeChange={vi.fn()}
        onDraftChange={vi.fn()}
        onSubmit={vi.fn()}
        onRetryBackend={vi.fn()}
        onThemeChange={vi.fn()}
        onReducedMotionChange={vi.fn()}
      />,
    );

    const hero = container.querySelector(
      '.board-route-relief[data-variant="hero"]',
    );
    const ids = Array.from(
      hero?.querySelectorAll<HTMLElement>("[data-space-id]") ?? [],
      (space) => space.dataset.spaceId,
    );

    expect(ids).toHaveLength(44);
    expect(new Set(ids).size).toBe(44);
    expect(ids).toEqual(game.boardSpaces.map((space) => space.id));
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
  });

  it("renders all 44 physical board spaces and keeps Start gated by setup", () => {
    const session = createSession(game, undefined, "GT-4827");

    render(
      <SetupView
        game={game}
        session={session}
        canEdit
        setupChecklist={{
          "setup-0": true,
          "setup-1": true,
          "setup-2": true,
          "setup-3": true,
          "setup-4": true,
        }}
        onPlayerCountChange={vi.fn()}
        onPlayerChange={vi.fn()}
        onStart={vi.fn()}
        onCopyCode={vi.fn()}
        onSetupCheck={vi.fn()}
      />,
    );

    const route = screen.getByRole("img", {
      name: "44 space physical board route from S00 to S43",
    });
    expect(route.querySelectorAll("[data-space-id]")).toHaveLength(44);
    expect(
      screen.getByRole("button", { name: /start physical game/i }),
    ).toBeEnabled();
    expect(screen.getAllByLabelText(/player name/i)).toHaveLength(2);
  });

  it("records a physical die face through the explicit two-step control", async () => {
    const user = userEvent.setup();
    const base = createSession(game, undefined, "GT-4827");
    const session = startSession(
      base,
      game,
      game.cards.starterProfiles.slice(0, 2).map((profile, index) => ({
        name: index ? "Kabir" : "Aanya",
        profileId: profile.id,
      })),
    ).session;
    const onDieChange = vi.fn();
    const onRoll = vi.fn();

    const { rerender } = render(
      <PlayView
        game={game}
        session={session}
        dieDraft={null}
        noteDraft=""
        cardLookup=""
        spaceLookup=""
        canEdit
        onDieChange={onDieChange}
        onRoll={onRoll}
        onConfirmMove={vi.fn()}
        onUndoRoll={vi.fn()}
        onResolve={vi.fn()}
        onNoteChange={vi.fn()}
        onChecklistChange={vi.fn()}
        onEndTurn={vi.fn()}
        onCardLookupChange={vi.fn()}
        onSpaceLookupChange={vi.fn()}
        onPreviewCard={vi.fn()}
        onSpeak={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Die result 4" }));
    expect(onDieChange).toHaveBeenCalledWith(4);
    rerender(
      <PlayView
        game={game}
        session={session}
        dieDraft={4}
        noteDraft=""
        cardLookup=""
        spaceLookup=""
        canEdit
        onDieChange={onDieChange}
        onRoll={onRoll}
        onConfirmMove={vi.fn()}
        onUndoRoll={vi.fn()}
        onResolve={vi.fn()}
        onNoteChange={vi.fn()}
        onChecklistChange={vi.fn()}
        onEndTurn={vi.fn()}
        onCardLookupChange={vi.fn()}
        onSpaceLookupChange={vi.fn()}
        onPreviewCard={vi.fn()}
        onSpeak={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /record die and show destination/i,
      }),
    );
    expect(onRoll).toHaveBeenCalledOnce();
  });

  it("confirms consequential board choices before recording them", async () => {
    const user = userEvent.setup();
    const base = createSession(game, undefined, "GT-4827");
    const started = startSession(
      base,
      game,
      game.cards.starterProfiles.slice(0, 2).map((profile, index) => ({
        name: index ? "Kabir" : "Aanya",
        profileId: profile.id,
      })),
    ).session;
    const rolled = rollDie(started, game, 4).session;
    const session = confirmPawnPosition(rolled).session;
    const onResolve = vi.fn();

    render(
      <PlayView
        game={game}
        session={session}
        dieDraft={null}
        noteDraft=""
        cardLookup=""
        spaceLookup=""
        canEdit
        onDieChange={vi.fn()}
        onRoll={vi.fn()}
        onConfirmMove={vi.fn()}
        onUndoRoll={vi.fn()}
        onResolve={onResolve}
        onNoteChange={vi.fn()}
        onChecklistChange={vi.fn()}
        onEndTurn={vi.fn()}
        onCardLookupChange={vi.fn()}
        onSpaceLookupChange={vi.fn()}
        onPreviewCard={vi.fn()}
        onSpeak={vi.fn()}
      />,
    );

    const choice = "Safe: gain +1 risk-management evidence.";
    await user.click(screen.getByRole("button", { name: choice }));
    expect(
      screen.getByRole("alertdialog", {
        name: "Confirm the physical board choice",
      }),
    ).toBeVisible();
    expect(onResolve).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Record this choice" }));
    expect(onResolve).toHaveBeenCalledWith(choice);
  });

  it("gates signed ledger corrections and sales behind host edit mode", async () => {
    const user = userEvent.setup();
    const base = createSession(game, undefined, "GT-4827");
    const session = startSession(
      base,
      game,
      game.cards.starterProfiles.slice(0, 2).map((profile, index) => ({
        name: index ? "Kabir" : "Aanya",
        profileId: profile.id,
      })),
    ).session;
    const player = session.players[0]!;
    const asset = game.assets[0]!;
    player.holdings[asset.id] = 2;
    session.manualAdjustments = [
      {
        id: "adj-latest",
        at: session.updatedAt,
        playerId: player.id,
        playerName: player.name,
        field: "cash",
        delta: -1_000,
        before: player.cash + 1_000,
        after: player.cash,
        reason: "Matched the cash tokens.",
      },
    ];
    const onAdjust = vi.fn();
    const onSell = vi.fn();
    const onUndoAdjustment = vi.fn();

    render(
      <LedgerView
        game={game}
        session={session}
        canEdit
        onAdjust={onAdjust}
        onSell={onSell}
        onUndoAdjustment={onUndoAdjustment}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Sell one" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Edit ledger" })[0]!);
    await user.type(screen.getByLabelText("Signed amount"), "-2500");
    await user.type(
      screen.getByLabelText("Human reason"),
      "Matched the physical cash tokens.",
    );
    await user.click(
      screen.getByRole("button", { name: "Apply signed correction" }),
    );

    expect(onAdjust).toHaveBeenCalledWith(
      player.id,
      "cash",
      -2_500,
      "Matched the physical cash tokens.",
    );

    await user.click(screen.getByRole("button", { name: "Sell one" }));
    expect(
      screen.getByRole("alertdialog", {
        name: `Sell one ${asset.name} unit?`,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm sale" }));
    expect(onSell).toHaveBeenCalledWith(player.id, asset.id);

    await user.click(
      screen.getByRole("button", { name: "Undo latest correction" }),
    );
    expect(onUndoAdjustment).toHaveBeenCalledOnce();
  });

  it("keeps manual Market/Life reveals host-only and confirms before applying", async () => {
    const user = userEvent.setup();
    const session = createSession(game, undefined, "GT-4827");
    const onReveal = vi.fn();
    const { rerender } = render(
      <MarketView
        game={game}
        session={session}
        canEdit
        onReveal={onReveal}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Reveal Market/Life" }),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Reveal the next Market/Life event?",
      }),
    ).toBeInTheDocument();
    expect(onReveal).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Reveal and apply event" }),
    );
    expect(onReveal).toHaveBeenCalledOnce();

    rerender(
      <MarketView
        game={game}
        session={session}
        canEdit={false}
        onReveal={onReveal}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Reveal Market/Life" }),
    ).not.toBeInTheDocument();
  });

  it("renders a teacher-review sheet with scores, holdings, notes and market history", () => {
    const base = createSession(game, undefined, "GT-4827");
    let session = startSession(
      base,
      game,
      game.cards.starterProfiles.slice(0, 2).map((profile, index) => ({
        name: index ? "Kabir" : "Aanya",
        profileId: profile.id,
      })),
    ).session;
    const player = session.players[0]!;
    const asset = game.assets[0]!;
    player.holdings[asset.id] = 2;
    player.decisions = [
      {
        at: session.updatedAt,
        turn: 1,
        spaceId: "S04",
        note: "Kept cash available after comparing risk.",
        result: "No purchase made.",
      },
    ];
    const event = game.cards.events[0]!;
    session = applyMarketEvent(
      session,
      game,
      event,
      "Teacher review test",
    ).session;

    render(
      <ExportView
        game={game}
        session={session}
        exportText=""
        lastSavedAt={session.updatedAt}
        onRefresh={vi.fn()}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    const sheet = screen.getByRole("region", { name: "Table GT-4827" });
    expect(
      within(sheet).getByRole("heading", { name: "Score calculation" }),
    ).toBeInTheDocument();
    expect(within(sheet).getByText(asset.name)).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        "Kept cash available after comparing risk.",
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(`${event.id} · ${event.title}`),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByLabelText("Scrollable player score calculation"),
    ).toHaveAttribute("tabindex", "0");
    expect(
      within(sheet).getByLabelText("Scrollable market event history"),
    ).toHaveAttribute("tabindex", "0");
  });
});
