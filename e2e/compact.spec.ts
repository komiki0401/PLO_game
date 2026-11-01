import { test, expect, type Page } from "@playwright/test";
test.setTimeout(60000);
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "plo-settings",
      JSON.stringify({
        count: 6,
        stack: 10000000,
        ante: 100,
        difficulty: "EASY",
        speed: 4,
        sound: false,
        voice: false,
      }),
    );
    let seed = 2;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
});
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "今すぐプレイ", exact: true }).click();
  await expect(page.locator("main")).toHaveClass(/human-turn/, {
    timeout: 15000,
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
}
for (const size of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 320, height: 568 },
  { width: 1280, height: 720 },
])
  test(`table, hole cards and betting controls fit ${size.width}x${size.height} without scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await start(page);
    await page.screenshot({
      path: `/tmp/plo-compact-${test.info().project.name}-${size.width}-${size.height}.png`,
      fullPage: false,
    });
    expect(await page.evaluate(() => scrollY)).toBe(0);
    for (const selector of [
      ".action-panel",
      "button.raise",
      ".basic-actions",
      ".board-row",
      ".human .hole-cards",
    ]) {
      for (const rect of await page.locator(selector).evaluateAll((elements) =>
        elements.map((e) => {
          const r = e.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        }),
      )) {
        expect(rect.top).toBeGreaterThanOrEqual(-1);
        expect(rect.bottom).toBeLessThanOrEqual(size.height + 1);
        expect(rect.left).toBeGreaterThanOrEqual(-1);
        expect(rect.right).toBeLessThanOrEqual(size.width + 1);
      }
    }
    const overlaps = await page.evaluate(() => {
      const boards = [...document.querySelectorAll(".board-cards .card")].map(
        (e) => e.getBoundingClientRect(),
      );
      const other = [...document.querySelectorAll(".seat .card,.seat-top")].map(
        (e) => e.getBoundingClientRect(),
      );
      return boards.flatMap((a, i) =>
        other.flatMap((b, j) =>
          Math.min(a.right, b.right) > Math.max(a.left, b.left) + 2 &&
          Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 2
            ? [
                {
                  board: i,
                  other: j,
                  boardRect: a.toJSON(),
                  otherRect: b.toJSON(),
                },
              ]
            : [],
        ),
      );
    });
    expect(overlaps).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("all-in cut-in names the player, reads all-in and precedes showdown", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("プレイヤー人数").selectOption("3");
  await page.getByLabel("初期スタック").fill("100");
  await page.getByLabel("ボムポットアンティ").fill("100");
  await page.locator(".home-advanced summary").click();
  await page.getByRole("combobox", { name: "女性ボイス", exact: true }).selectOption("true");
  await page
    .getByRole("button", { name: "ゲームを始める", exact: true })
    .click();
  await expect(page.locator(".all-in-cutin")).toBeVisible();
  await expect(page.locator(".all-in-cutin")).toContainText("全員");
  await expect(page.locator(".all-in-cutin")).toContainText("オールイン");
  await expect
    .poll(() =>
      page
        .locator(".voice-player")
        .evaluate((el: HTMLAudioElement) => el.currentSrc),
    )
    .toMatch(/\/allin\.mp3$/);
  await expect
    .poll(() =>
      page
        .locator(".voice-player")
        .evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0.1);
  await expect(page.locator(".all-in-cutin")).toHaveCount(0, {
    timeout: 12000,
  });
  await expect
    .poll(() =>
      page
        .locator(".voice-player")
        .evaluate((el: HTMLAudioElement) => el.currentSrc),
    )
    .toMatch(/\/a-\d\.mp3$/);
});
test("a human all-in shows a cut-in and remains visibly marked at the seat", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("プレイヤー人数").selectOption("3");
  await page.getByLabel("初期スタック").fill("100");
  await page.getByLabel("ボムポットアンティ").fill("25");
  await page.evaluate(() => {
    let seed = 1;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  await page
    .getByRole("button", { name: "ゲームを始める", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.getByRole("button", { name: "All-in", exact: true }).click();
  await page.locator("button.raise").click();
  await expect(page.locator(".all-in-cutin")).toContainText("YOU");
  await expect(page.locator(".all-in-cutin")).toContainText("75 CHIPS");
  await expect(page.locator(".human.is-all-in .all-in-label")).toHaveText(
    "ALL-IN",
  );
  await page.clock.runFor(1599);
  await expect(page.locator(".all-in-content small")).toHaveText("YOU");
  await page.getByRole("button", { name: "トップへ", exact: true }).click();
  await expect(page.locator(".home-screen")).toBeVisible();
  await expect(page.locator(".all-in-cutin")).toHaveCount(0);
});
