import { render, screen } from "@testing-library/react";

import { LiveMessage } from "@/components/layout/LiveMessage";

describe("LiveMessage", () => {
  it("uses an assertive alert channel for blocking errors", () => {
    render(
      <LiveMessage
        message="The physical card belongs to another deck."
        assertive
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveAttribute(
      "aria-live",
      "assertive",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "physical card belongs to another deck",
    );
  });

  it("uses a polite status channel for routine confirmation", () => {
    render(
      <LiveMessage
        message="Session code copied."
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
