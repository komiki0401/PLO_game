import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", e => { throw e; });
  await page.addInitScript(() => {
    if (!localStorage.getItem("plo-settings")) localStorage.setItem("plo-settings", JSON.stringify({ count: 2, stack: 10000000, ante: 100, speed: 4, difficulty: "EASY", sound: false, voice: false }));
    let seed = 42;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
});
test("offers standard two-card single-board no-limit play and keeps both PLO games", async ({ page }, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.getByRole("button", { name: "ホールデム · ノンリミット" }).click();
  await page.getByLabel("初期スタック").fill("10000");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
  await expect(page.locator(".street")).toHaveText("PREFLOP");
  await expect(page.locator(".seat.human .hole-cards .card")).toHaveCount(2);
  await expect(page.locator(".board-row")).toHaveCount(1);
  await expect(page.locator(".board-cards .card.empty")).toHaveCount(5);
  await expect(page.getByLabel("合計ベット額", { exact: true })).toHaveAttribute("max", "10000");
  await expect(page.getByRole("button", { name: "All-in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const selector of [".action-panel", ".board-row", ".human .hole-cards"]) {
    const rect = await page.locator(selector).boundingBox();
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }
  await page.screenshot({ path: `test-results/holdem-preflop-${info.project.name}.png` });
  await page.getByLabel("合計ベット額", { exact: true }).fill("1000");
  await page.locator("button.raise").click();
  await expect(page.locator(".seat.human .bet-chip")).toHaveText("◉ 1,000");
  await page.getByRole("button", { name: "ルール", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("手札は0枚・1枚・2枚");
  await page.getByRole("button", { name: "テーブルに戻る", exact: true }).click();
  for (const [mode, holes, boards] of [["PLO4 · プリフロップ", 4, 2], ["PLO5 · ボムポット", 5, 2]] as const) {
    await page.getByRole("button", { name: "トップへ", exact: true }).click();
    await page.getByRole("button", { name: mode }).click();
    await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
    await expect(page.locator(".seat.human .hole-cards .card")).toHaveCount(holes);
    await expect(page.locator(".board-row")).toHaveCount(boards);
  }
});
test("plays two complete hold’em hands, shows five winning cards and saves the mode", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.getByRole("button", { name: "ホールデム · ノンリミット" }).click();
  await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
  for (let hand = 0; hand < 2; hand++) {
    let finished = false;
    for (let action = 0; action < 400; action++) {
      const next = page.getByRole("button", { name: "次のハンド →" });
      if (await next.isVisible()) {
        await expect(next).toBeEnabled();
        await expect(page.locator(".card.lit")).toHaveCount(5);
        await expect(page.locator(".board-row")).toHaveCount(1);
        await expect(page.locator(".scoop-celebration")).toHaveCount(0);
        if (hand === 0) await next.click();
        finished = true;
        break;
      }
      const call = page.getByRole("button", { name: /^(Check|Call)/ });
      if (await call.isVisible() && await call.isEnabled()) await call.click();
      else await page.waitForTimeout(100);
    }
    expect(finished).toBe(true);
  }
  await page.locator(".history-item").first().click();
  await expect(page.locator(".card.lit")).toHaveCount(5);
  await page.getByRole("button", { name: "ライブテーブルに戻る →" }).click();
  await page.getByRole("button", { name: "トップへ", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("plo-scores-v1") ?? "[]"));
  expect(saved[0]).toMatchObject({ mode: "holdem", hands: 2, scoops: 0 });
  await page.reload();
  await expect(page.locator(".score-history tbody")).toContainText("NLH");
  await expect(page.getByRole("button", { name: "ホールデム · ノンリミット" })).toHaveAttribute("aria-pressed", "true");
});
