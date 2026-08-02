import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { BackendSnapshot } from "@/app/contracts";
import { SyncIndicator } from "@/components/layout/SyncIndicator";
import { CopyButton } from "@/components/ui/copy-button";
import { NumberTicker } from "@/components/ui/number-ticker";

function snapshot(patch: Partial<BackendSnapshot> = {}): BackendSnapshot {
  return {
    state: "saved",
    detail: "Shared table up to date",
    revision: 7,
    lastSavedAt: null,
    role: "host",
    ...patch,
  };
}

describe("CopyButton", () => {
  it("confirms at the control once the write lands", async () => {
    const user = userEvent.setup();
    render(
      <CopyButton
        onCopy={() => Promise.resolve(true)}
        label="Copy table code"
        confirmedLabel="Code copied"
      />,
    );

    const button = screen.getByRole("button", { name: "Copy table code" });
    await user.click(button);

    // The label itself changes, so the confirmation does not rest on colour or
    // on a glyph swap alone.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Code copied" }),
      ).toHaveAttribute("data-confirmed"),
    );
  });

  it("does not claim success when the clipboard write fails", async () => {
    const user = userEvent.setup();
    render(
      <CopyButton
        onCopy={() => Promise.resolve(false)}
        label="Copy table code"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy table code" }));

    expect(
      screen.getByRole("button", { name: "Copy table code" }),
    ).not.toHaveAttribute("data-confirmed");
  });
});

describe("SyncIndicator", () => {
  it("gives each connection state its own word and glyph, not just a colour", () => {
    const { rerender } = render(
      <SyncIndicator backend={snapshot()} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Synced");

    rerender(
      <SyncIndicator backend={snapshot({ state: "saving" })} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saving");

    rerender(
      <SyncIndicator backend={snapshot({ state: "offline" })} onRetry={vi.fn()} />,
    );
    // A table that has stopped reaching the server interrupts the host, so it
    // escalates to an alert channel; a routine save must not.
    expect(screen.getByRole("alert")).toHaveTextContent("Offline");
  });

  it("pulses only while a request is genuinely in flight", () => {
    const { rerender } = render(
      <SyncIndicator backend={snapshot({ state: "saving" })} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-busy");

    rerender(<SyncIndicator backend={snapshot()} onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).not.toHaveAttribute("data-busy");

    rerender(
      <SyncIndicator backend={snapshot({ state: "error" })} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).not.toHaveAttribute("data-busy");
  });

  it("offers retry only when the table has stopped reaching the server", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <SyncIndicator backend={snapshot()} onRetry={onRetry} />,
    );
    expect(
      screen.queryByRole("button", { name: "Retry session sync" }),
    ).toBeNull();

    rerender(
      <SyncIndicator backend={snapshot({ state: "error" })} onRetry={onRetry} />,
    );
    expect(
      screen.getByRole("button", { name: "Retry session sync" }),
    ).toBeInTheDocument();
  });
});

describe("NumberTicker", () => {
  it("announces the settled value and never renders a stale one", () => {
    render(<NumberTicker value={42} data-testid="ticker" />);

    // The vendored original rendered `startValue` on mount, so a metric could
    // display 0 while the host was reading it. Without an explicit startValue
    // the committed value is the first paint.
    expect(screen.getByTestId("ticker")).toHaveTextContent("4242");
  });

  it("formats the announced value with the caller's formatter", () => {
    render(
      <NumberTicker
        value={36000}
        format={(n) => `₹${Math.round(n).toLocaleString("en-IN")}`}
        data-testid="ticker"
      />,
    );

    expect(screen.getByTestId("ticker")).toHaveTextContent("₹36,000");
  });

  it("commits a changed value immediately for the in-app motion setting", async () => {
    const { rerender } = render(
      <NumberTicker value={7} reducedMotion data-testid="ticker" />,
    );

    rerender(
      <NumberTicker value={8} reducedMotion data-testid="ticker" />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("ticker")).toHaveTextContent("88"),
    );
  });
});
