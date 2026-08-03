import { render, screen } from "@testing-library/react";

import { RoutePositionStamp } from "@/components/layout/RoutePositionStamp";

describe("RoutePositionStamp", () => {
  it("renders the exact 44-space route and the real pawn position", () => {
    const { container } = render(
      <RoutePositionStamp
        player={{ name: "Aanya", position: 12, tokenColor: "#c8f04a" }}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Aanya's pawn is at S12 on the 44-space physical route",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".route-position-stamp__space")).toHaveLength(44);
    expect(screen.getByText("S12")).toBeInTheDocument();
  });

  it("clamps an invalid position to the physical route", () => {
    render(
      <RoutePositionStamp
        player={{ name: "Mira", position: 99, tokenColor: "#ffffff" }}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Mira's pawn is at S43 on the 44-space physical route",
      }),
    ).toBeInTheDocument();
  });
});
