import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import rawGame from "../../../../../game_data/game_config.json";
import {
  DRAW_DECK_KEYS,
  DRAW_DECK_LABELS,
  PLAYER_TOKEN_COLORS,
} from "@/domain/constants";
import { normaliseGame } from "@/domain/game-config";
import { BoardRouteRelief } from "@/features/entry/BoardRouteRelief";

const game = normaliseGame(rawGame);

function renderRelief(
  options: {
    variant?: "hero" | "chapter" | "mini";
    reducedMotion?: boolean;
    interactive?: boolean;
  } = {},
) {
  return render(
    <BoardRouteRelief
      spaces={game.boardSpaces}
      reducedMotion={options.reducedMotion ?? false}
      variant={options.variant}
      interactive={options.interactive}
    />,
  );
}

function finePointerMedia(): MediaQueryList {
  return {
    matches: true,
    media: "(pointer: fine)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

describe("Board Route Relief", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the exact S00–S43 contract once and in source order", () => {
    const { container } = renderRelief();
    const spaces = Array.from(
      container.querySelectorAll<HTMLElement>("[data-space-id]"),
    );

    expect(spaces).toHaveLength(44);
    expect(spaces.map((space) => space.dataset.spaceId)).toEqual(
      game.boardSpaces.map((space) => space.id),
    );
    expect(new Set(spaces.map((space) => space.dataset.spaceId)).size).toBe(44);
  });

  it("maps the printed 13–9–13–9 perimeter instead of inventing a ring", () => {
    const { container } = renderRelief();
    const spaces = Array.from(
      container.querySelectorAll<HTMLElement>("[data-space-id]"),
    );

    expect(
      spaces.slice(0, 13).map((space) => [
        space.style.gridRow,
        space.style.gridColumn,
      ]),
    ).toEqual(
      Array.from({ length: 13 }, (_, index) => ["1", String(index + 1)]),
    );
    expect(
      spaces.slice(13, 22).map((space) => [
        space.style.gridRow,
        space.style.gridColumn,
      ]),
    ).toEqual(
      Array.from({ length: 9 }, (_, index) => [String(index + 2), "13"]),
    );
    expect(
      spaces.slice(22, 35).map((space) => [
        space.style.gridRow,
        space.style.gridColumn,
      ]),
    ).toEqual(
      Array.from({ length: 13 }, (_, index) => ["11", String(13 - index)]),
    );
    expect(
      spaces.slice(35).map((space) => [
        space.style.gridRow,
        space.style.gridColumn,
      ]),
    ).toEqual(
      Array.from({ length: 9 }, (_, index) => [String(10 - index), "1"]),
    );
  });

  it("uses the five real draw decks and five supported pawn colours", () => {
    const { container } = renderRelief();

    expect(container.querySelectorAll(".relief-deck-rack li")).toHaveLength(
      DRAW_DECK_KEYS.length,
    );
    for (const key of DRAW_DECK_KEYS) {
      expect(screen.getByText(DRAW_DECK_LABELS[key])).toBeInTheDocument();
    }
    expect(container.querySelectorAll(".relief-token-tray li")).toHaveLength(
      PLAYER_TOKEN_COLORS.length,
    );
    expect(container.querySelector("canvas")).not.toBeInTheDocument();
  });

  it("keeps the Setup destination compact, static, and accessible", () => {
    const { container } = renderRelief({ variant: "mini" });

    expect(
      screen.getByRole("img", {
        name: "44 space physical board route from S00 to S43",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-space-id]")).toHaveLength(44);
    expect(container.querySelector(".relief-deck-rack")).not.toBeInTheDocument();
    expect(container.querySelector(".relief-token-tray")).not.toBeInTheDocument();
  });

  it("caps decorative mouse depth at two degrees and six pixels", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(finePointerMedia());
    const { container } = renderRelief({ interactive: true });
    const relief = container.querySelector<HTMLElement>(".board-route-relief");
    expect(relief).not.toBeNull();
    vi.spyOn(relief!, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 }),
    );

    fireEvent.pointerMove(relief!, {
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
    });

    await waitFor(() => {
      expect(relief).toHaveStyle({
        "--relief-shift-x": "6.00px",
        "--relief-shift-y": "6.00px",
        "--relief-rotate-x": "-2.00deg",
        "--relief-rotate-y": "2.00deg",
      });
    });
  });

  it("does not apply pointer depth for touch or reduced-motion users", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(finePointerMedia());
    const { container } = renderRelief({
      interactive: true,
      reducedMotion: true,
    });
    const relief = container.querySelector<HTMLElement>(".board-route-relief");
    expect(relief).not.toBeNull();
    vi.spyOn(relief!, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 }),
    );

    fireEvent.pointerMove(relief!, {
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(relief!, {
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
    });

    expect(relief?.style.getPropertyValue("--relief-shift-x")).toBe("");
    expect(relief?.style.getPropertyValue("--relief-rotate-y")).toBe("");
  });
});
