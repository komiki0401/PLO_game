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
        count: 3,
        stack: 100,
        ante: 100,
        difficulty: "EASY",
        speed: 4,
        sound: false,
        voice: false,
      }),
    );
    let seed = 42;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
});
async function seed(page: Page, value: number) {
  await page.evaluate((value) => {
    let n = value;
    Math.random = () => {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return n / 4294967296;
    };
  }, value);
}
test("starts at home, waits for play, returns after a bust and preserves the score", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".home-screen")).toBeVisible();
  await expect(page.locator(".arena")).toHaveCount(0);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.clock.runFor(5000);
  expect(
    await page.evaluate(() => localStorage.getItem("plo-scores-v1")),
  ).toBeNull();
  await seed(page, 5);
  await page
    .getByRole("button", { name: "ゲームを始める", exact: true })
    .click();
  await expect(page.locator(".arena")).toBeVisible();
  await expect(page.locator(".showdown-verdict")).toHaveAttribute(
    "data-board",
    "0",
  );
  await page.clock.runFor(1600); // Ante all-in cut-in precedes the board results.
  for (let i = 0; i < 3; i++) await page.clock.runFor(1600);
  await expect(page.getByRole("heading", { name: /GAME OVER/ })).toBeVisible();
  await expect(page.locator(".home-screen")).toHaveCount(0);
  await page.clock.runFor(2999);
  await expect(page.locator(".arena")).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.locator(".home-screen")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "スタックが0になりました" }),
  ).toBeVisible();
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("plo-scores-v1")!),
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    finalStack: 0,
    peakStack: 100,
    net: -100,
    hands: 1,
    status: "bust",
  });
  await expect(page.locator(".score-history tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".home-screen")).toBeVisible();
  await expect(page.locator(".score-history tbody tr")).toHaveCount(1);
  await expect(page.locator(".home-result strong")).toHaveText("0");
  await page.getByLabel("初期スタック").fill("10000");
  await page.getByLabel("ボムポットアンティ").fill("100");
  await page
    .getByRole("button", { name: "ゲームを始める", exact: true })
    .click();
  await expect(page.locator(".seat")).toHaveCount(3);
});
test("a positive all-in payout stays playable, records once and survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await seed(page, 6);
  await page
    .getByRole("button", { name: "ゲームを始める", exact: true })
    .click();
  await page.clock.runFor(1600); // Ante all-in cut-in.
  await page.clock.runFor(1600);
  await page.clock.runFor(1600);
  await expect(
    page.getByRole("button", { name: "次のハンド →" }),
  ).toBeVisible();
  await page.clock.runFor(5000);
  await expect(page.locator(".arena")).toBeVisible();
  let records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("plo-scores-v1")!),
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    finalStack: 150,
    peakStack: 150,
    net: 50,
    hands: 1,
    status: "playing",
  });
  await page.getByRole("button", { name: "トップへ", exact: true }).click();
  await expect(page.locator(".home-screen")).toBeVisible();
  records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("plo-scores-v1")!),
  );
  expect(records).toHaveLength(1);
  expect(records[0].status).toBe("interrupted");
  await page.reload();
  await expect(page.locator(".home-result strong")).toHaveText("150");
  await expect(page.locator(".score-history tbody tr")).toHaveCount(1);
});
test("being all-in with zero chips does not exit an unfinished hand", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("ボムポットアンティ").fill("25");
  await seed(page, 1);
  await page
    .getByRole("button", { name: "ゲームを始める", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.getByRole("button", { name: "All-in", exact: true }).click();
  await page.locator("button.raise").click();
  await expect(page.locator(".human .chip-rack")).toHaveAttribute(
    "data-amount",
    "0",
  );
  await expect(page.locator(".arena")).toBeVisible();
  await expect(page.locator(".street")).toHaveText("FLOP");
  await page.clock.runFor(100);
  await expect(page.locator(".home-screen")).toHaveCount(0);
  await page.getByRole("button", { name: "トップへ", exact: true }).click();
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("plo-scores-v1")!),
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    finalStack: 100,
    net: 0,
    hands: 0,
    status: "interrupted",
  });
});
test("homepage layout and score history fit a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "plo-scores-v1",
      JSON.stringify([
        {
          id: "large-score",
          startedAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
          initialStack: 10000000,
          finalStack: 60000000,
          peakStack: 60000000,
          net: 50000000,
          hands: 12,
          scoops: 4,
          players: 6,
          ante: 100,
          difficulty: "HARD",
          status: "winner",
        },
      ]),
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ポーカー", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page).toHaveTitle("ポーカー");
  await expect(page.getByRole("group", { name: "手札2枚", exact: true })).toContainText("ホールデム・ノンリミット");
  const omaha = page.getByRole("group", { name: "オマハ", exact: true });
  await expect(omaha.getByRole("button")).toHaveCount(2);
  await expect(omaha.getByRole("button").first()).toContainText("PLO4・プリフロップ");
  await expect(omaha.getByRole("button").last()).toContainText("PLO5・Wボードボムポット");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "今すぐプレイ", exact: true }),
  ).toBeInViewport();
  await expect(page.locator(".score-history tbody tr")).toHaveCount(1);
  await expect(page.locator(".home-stats>div:last-child strong")).toHaveText(
    "12",
  );
  await page.screenshot({
    path: `/tmp/plo-home-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "今すぐプレイ", exact: true }).click();
  await expect(page.locator(".arena")).toBeVisible();
});
