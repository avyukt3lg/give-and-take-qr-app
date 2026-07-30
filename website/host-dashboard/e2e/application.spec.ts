import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Page,
  type Route,
} from "@playwright/test";

const DASHBOARD_PATH =
  "/give-and-take-qr-app/website/host-dashboard/";
const SESSION_ID = "00000000-0000-4000-8000-000000000001";

interface RemoteRecord {
  id: string;
  code: string;
  session: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface MockTable {
  record: RemoteRecord | null;
  calls: string[];
}

function rpcName(route: Route): string {
  return new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
}

async function installSupabaseMock(page: Page, table: MockTable) {
  await page.route(
    /https:\/\/[^/]+\.supabase\.co\/rest\/v1\/rpc\/.*/,
    async (route) => {
      const name = rpcName(route);
      const payload = (route.request().postDataJSON() ?? {}) as Record<
        string,
        unknown
      >;
      table.calls.push(name);

      if (
        name === "create_game_session_public" ||
        name === "update_game_session_public"
      ) {
        const session = payload.p_session as Record<string, unknown>;
        const nextRevision =
          name === "create_game_session_public"
            ? 1
            : Math.max(
                Number(payload.p_revision ?? 0) + 1,
                (table.record?.revision ?? 0) + 1,
              );
        table.record = {
          id: SESSION_ID,
          code: String(payload.p_code ?? table.record?.code ?? session.code),
          session,
          revision: nextRevision,
          created_at:
            table.record?.created_at ?? "2026-07-28T09:30:00.000Z",
          updated_at: "2026-07-28T09:31:00.000Z",
        };
      }

      if (
        (name === "join_game_session_public" ||
          name === "get_game_session_public") &&
        !table.record
      ) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST116",
            message: "The requested table does not exist.",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(table.record ? [table.record] : []),
      });
    },
  );
}

async function openAsHost(page: Page, table: MockTable) {
  await installSupabaseMock(page, table);
  await page.goto(DASHBOARD_PATH);
  await page.getByLabel("Host name").fill("Fixture Host");
  await page.getByRole("button", { name: "Host table" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Setup" }),
  ).toBeVisible();
}

async function startPhysicalGame(page: Page) {
  const readinessChecks = page.locator(".setup-physical-check input");
  await expect(readinessChecks).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await readinessChecks.nth(index).check();
  }
  await page
    .getByRole("button", { name: "Start physical game" })
    .click();
  await expect(
    page.getByRole("heading", { name: /owns the table/i }),
  ).toBeVisible();
}

function seriousAxeViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
}

test.describe("production artifact", () => {
  test("loads the exact nested URL with a clean entry experience", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(DASHBOARD_PATH);
    await expect(
      page.getByRole("heading", {
        name: "Keep the board physical. Run the table here.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Host table" })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    // Text that fades in is below its contrast ratio while it is fading, so
    // auditing mid-entrance measures a state no user reads. Wait for the page
    // to report its steady state, then audit that.
    await expect(page.locator(".entry-page")).toHaveAttribute(
      "data-entry-state",
      "settled",
    );

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(seriousAxeViolations(accessibility.violations)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("authors Table, Classroom and Contrast as distinct themes", async ({
    page,
  }) => {
    await page.goto(DASHBOARD_PATH);
    await page
      .getByRole("button", {
        name: "Open display and companion settings",
      })
      .click();

    const themes = [
      ["Classroom", /^Classroom Bone paper/],
      ["Contrast", /^Contrast Black, white/],
      ["Table", /^Table Warm black/],
    ] as const;
    for (const [theme, name] of themes) {
      await page.getByRole("button", { name }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        theme.toLowerCase(),
      );
    }
  });

  test("preserves query and hash through the repository-root redirect", async ({
    page,
  }) => {
    await page.goto("/give-and-take-qr-app/?audit=pages#entry");
    await expect(page).toHaveURL(
      /\/give-and-take-qr-app\/website\/host-dashboard\/\?audit=pages#entry$/,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("keeps table entry usable when every hero image decode fails", async ({
    page,
  }) => {
    await page.route(/product-box-.*\.(?:avif|jpg)$/, (route) => route.abort());
    await page.goto(DASHBOARD_PATH);

    await expect(
      page.getByRole("heading", {
        name: "Keep the board physical. Run the table here.",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Host name")).toBeEditable();
    await expect(page.getByRole("button", { name: "Host table" })).toBeEnabled();
  });
});

test.describe("host and joined-player workflows", () => {
  test("requires confirmation before replacing or leaving a host table", async ({
    page,
  }, testInfo) => {
    const table: MockTable = { record: null, calls: [] };
    await openAsHost(page, table);
    const originalCode = await page.locator(".table-code-block strong").innerText();
    const exposeSessionActions = async () => {
      if (
        testInfo.project.name === "mobile-chromium" &&
        !(await page.getByRole("button", { name: "New session" }).isVisible())
      ) {
        await page
          .getByRole("button", { name: "Open more game sections" })
          .click();
      }
    };

    await exposeSessionActions();
    await page.getByRole("button", { name: "New session" }).click();
    await expect(
      page.getByRole("heading", { name: "Start a new table?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Keep current table" }).click();
    await expect(page.locator(".table-code-block strong")).toHaveText(originalCode);

    await exposeSessionActions();
    await page.getByRole("button", { name: "New session" }).click();
    await page.getByRole("button", { name: "Create new session" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Setup" }),
    ).toBeVisible();
    await expect
      .poll(() => table.calls.filter((call) => call === "create_game_session_public").length)
      .toBeGreaterThanOrEqual(2);

    await exposeSessionActions();
    await page.getByRole("button", { name: "Leave table" }).click();
    await expect(
      page.getByRole("heading", { name: "Leave this table?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Stay at table" }).click();
    await expect(page.getByRole("button", { name: "New session" })).toBeVisible();

    await exposeSessionActions();
    await page.getByRole("button", { name: "Leave table" }).click();
    await page.getByRole("button", { name: "Leave this table" }).click();
    await expect(page.getByRole("button", { name: "Host table" })).toBeVisible();
  });

  test("runs a physical turn from setup through handoff", async ({ page }) => {
    const table: MockTable = { record: null, calls: [] };
    await openAsHost(page, table);
    await startPhysicalGame(page);

    await page.getByRole("button", { name: "Die result 3" }).click();
    await page
      .getByRole("button", {
        name: "Record die and show destination",
      })
      .click();
    await expect(
      page.getByText("Undo roll and restore the previous table state"),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Undo roll and restore the previous table state",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Roll the physical D6." }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Die result 1" }).click();
    await page
      .getByRole("button", {
        name: "Record die and show destination",
      })
      .click();
    await page
      .getByRole("button", { name: /confirm physical move/i })
      .click();
    await expect(page.getByText("Space resolved")).toBeVisible();

    await page.getByLabel("Decision or finance note").fill(
      "The player linked the income change to their cash-flow plan.",
    );
    const physicalChecks = page.locator(".physical-checklist input");
    for (let index = 0; index < (await physicalChecks.count()); index += 1) {
      if (!(await physicalChecks.nth(index).isChecked())) {
        await physicalChecks.nth(index).check();
      }
    }
    await page.getByRole("button", { name: "End turn" }).click();
    await expect(
      page.getByRole("heading", { name: /owns the table/i }),
    ).toContainText("Player 2");

    await expect
      .poll(() =>
        table.calls.some(
          (call) =>
            call === "create_game_session_public" ||
            call === "update_game_session_public",
        ),
      )
      .toBe(true);
  });

  test("keeps a joined player in their own assist view and lets them leave", async ({
    browser,
  }) => {
    const table: MockTable = { record: null, calls: [] };
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    await openAsHost(host, table);
    await startPhysicalGame(host);
    await expect
      .poll(() => table.record?.session.started)
      .toBe(true);

    const playerContext = await browser.newContext();
    const player = await playerContext.newPage();
    await installSupabaseMock(player, table);
    await player.goto(DASHBOARD_PATH);
    await player.getByRole("tab", { name: /join/i }).click();
    await player.getByLabel("Player name").fill("Player 1");
    await player.getByLabel("Session code").fill(table.record?.code ?? "");
    await player.getByRole("button", { name: /join session/i }).click();

    await expect(player.getByRole("region", { name: "Player 1 summary" }))
      .toBeVisible();
    await expect(
      player.getByRole("button", { name: /leave this table/i }),
    ).toBeVisible();
    await expect(player.getByText("Player 2", { exact: true })).toHaveCount(0);

    await player.getByRole("button", { name: /leave this table/i }).click();
    await expect(
      player.getByRole("button", { name: /join session/i }),
    ).toBeVisible();
    await player.getByRole("tab", { name: /^01 Host/i }).click();
    await expect(
      player.getByRole("button", { name: "Host table" }),
    ).toBeVisible();

    await playerContext.close();
    await hostContext.close();
  });
});

test.describe("surface and viewport matrix", () => {
  test("audits all host surfaces in Table and Classroom plus core Contrast views", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const table: MockTable = { record: null, calls: [] };
    await openAsHost(page, table);
    await startPhysicalGame(page);

    const matrix = [
      {
        theme: "Table",
        buttonName: /^Table Warm black/,
        destinations: ["Setup", "Play", "Market", "Ledger", "Scores", "Export", "Help"],
      },
      {
        theme: "Classroom",
        buttonName: /^Classroom Bone paper/,
        destinations: ["Setup", "Play", "Market", "Ledger", "Scores", "Export", "Help"],
      },
      {
        theme: "Contrast",
        buttonName: /^Contrast Black, white/,
        destinations: ["Play", "Market", "Scores"],
      },
    ] as const;

    for (const entry of matrix) {
      await page
        .getByRole("button", {
          name: "Open display and companion settings",
        })
        .click();
      await page.getByRole("button", { name: entry.buttonName }).click();
      await page.keyboard.press("Escape");
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        entry.theme.toLowerCase(),
      );

      for (const destination of entry.destinations) {
        await page
          .locator(".desktop-navigation button")
          .filter({
            has: page.getByText(destination, { exact: true }),
          })
          .click();
        await expect(
          page.locator(".workspace-header").getByRole("heading", {
            name: destination,
            exact: true,
          }),
        ).toBeVisible();
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        const accessibility = await new AxeBuilder({ page }).analyze();
        expect(seriousAxeViolations(accessibility.violations)).toEqual([]);
      }
    }
  });

  test("recomposes without horizontal overflow at the acceptance widths", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const table: MockTable = { record: null, calls: [] };
    await openAsHost(page, table);

    const viewports = [
      { width: 1440, height: 900 },
      { width: 1180, height: 760 },
      { width: 900, height: 700 },
      { width: 768, height: 640 },
      { width: 430, height: 740 },
      { width: 390, height: 640 },
      { width: 320, height: 568 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      await expect(page.getByRole("main")).toBeVisible();
    }
  });

  test("remains usable with reduced motion and forced colors", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.emulateMedia({
      reducedMotion: "reduce",
      forcedColors: "active",
    });
    await page.goto(DASHBOARD_PATH);
    await expect(page.getByLabel("Host name")).toBeEditable();
    await expect(page.getByRole("button", { name: "Host table" })).toBeEnabled();
    const accessibility = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    expect(seriousAxeViolations(accessibility.violations)).toEqual([]);
  });
});

test.describe("mobile composition", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("has no overflow and exposes five stable destinations plus More", async ({
    page,
  }) => {
    const table: MockTable = { record: null, calls: [] };
    await openAsHost(page, table);
    await startPhysicalGame(page);

    const navigation = page.getByRole("navigation", {
      name: "Game sections",
    });
    await expect(navigation).toBeVisible();
    for (const destination of ["Setup", "Play", "Market", "Ledger", "Scores"]) {
      await expect(
        navigation.getByRole("button", { name: destination }),
      ).toBeVisible();
    }
    await expect(
      navigation.getByRole("button", { name: /more/i }),
    ).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});
