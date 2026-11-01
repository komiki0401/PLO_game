import { expect, test } from "@playwright/test";

test("choose PLO4, play two hands, keep scores and return to the original PLO5", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("plo-settings")) localStorage.setItem("plo-settings", JSON.stringify({ count: 2, stack: 10000, ante: 100, speed: 4, sound: false, voice: false, difficulty: "EASY" }));
    let seed = 42;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "PLO4 · プリフロップ" }).click();
  await expect(page.getByLabel("ビッグブラインド")).toHaveValue("100");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/plo4-home-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
  await expect(page.locator(".street")).toHaveText("PREFLOP");
  await expect(page.locator(".seat.human .hole-cards .card")).toHaveCount(4);
  await expect(page.locator(".board-cards .card.empty")).toHaveCount(10);
  await expect(page.getByLabel("合計ベット額", { exact: true })).toHaveAttribute("max", "300");
  await page.screenshot({ path: `test-results/plo4-preflop-${test.info().project.name}.png`, fullPage: true });
  for (let hand = 0; hand < 2; hand++) {
    let finished = false;
    for (let action = 0; action < 400; action++) {
      const next = page.getByRole("button", { name: "次のハンド →" });
      if (await next.isVisible()) {
        await expect(next).toBeEnabled();
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
  await page.getByRole("button", { name: "トップへ", exact: true }).click();
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("plo-scores-v1") ?? "[]"));
  expect(records[0]).toMatchObject({ mode: "plo4", hands: 2 });
  await page.reload();
  await expect(page.locator(".score-history tbody")).toContainText("PLO4");
  await expect(page.getByRole("button", { name: "PLO4 · プリフロップ" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "PLO5 · ボムポット" }).click();
  await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
  await expect(page.locator(".seat.human .hole-cards .card")).toHaveCount(5);
  await expect(page.locator(".board-cards .card:not(.empty)")).toHaveCount(6);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("plo-scores-v1") ?? "[]")[0].mode)).toBe("plo4");
  expect(errors).toEqual([]);
});
