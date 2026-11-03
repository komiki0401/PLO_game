import { expect, test } from "@playwright/test";

for (const mode of ["PLO4 · プリフロップ", "ホールデム · ノンリミット"]) {
  test(`${mode}: dealer button is above the board, follows the hand and matches replay`, async ({ page }, info) => {
    test.setTimeout(90000);
    page.on("pageerror", e => { throw e; });
    await page.addInitScript(() => localStorage.setItem("plo-settings", JSON.stringify({ count: 2, stack: 10000000, ante: 100, speed: 4, difficulty: "EASY", sound: false, voice: false })));
    await page.goto("/");
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 10));
    let atTable = false;
    for (const count of [2, 6]) for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 720 }]) {
      if (atTable) await page.getByRole("button", { name: "トップへ", exact: true }).click();
      await page.setViewportSize(size);
      await page.getByRole("button", { name: mode }).click();
      await page.getByLabel("プレイヤー人数").selectOption(String(count));
      await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
      atTable = true;
      const marker = page.locator(".dealer-position");
      await expect(marker).toHaveAttribute("data-dealer", "0");
      await expect(marker).toHaveAttribute("aria-label", "ディーラーボタン：YOU");
      await expect(marker.locator(".dealer-disc")).toHaveText("D");
      await expect(page.locator('.seat[data-player-id="0"] .dealer')).toHaveText("D");
      const rect = await marker.boundingBox(), board = await page.locator(".board-row").first().boundingBox();
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(board!.y + 1);
      const overlaps = await marker.evaluate(el => {
        const a = el.getBoundingClientRect();
        return [...document.querySelectorAll(".board-cards .card,.hole-cards .card,.seat-top,.pot > strong")].filter(other => {
          const b = other.getBoundingClientRect();
          return Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
        }).length;
      });
      expect(overlaps).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (size.width === 320 && count === 6) await page.screenshot({ path: `test-results/dealer-${mode.startsWith("PLO") ? "plo4" : "holdem"}-${info.project.name}.png` });
    }
    await page.getByRole("button", { name: "トップへ", exact: true }).click();
    await page.getByLabel("プレイヤー人数").selectOption("2");
    await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
    await page.clock.resume();
    let finished = false;
    for (let n = 0; n < 400; n++) {
      const next = page.getByRole("button", { name: "次のハンド →" });
      if (await next.isVisible()) { await expect(next).toBeEnabled(); finished = true; await next.click(); break; }
      const call = page.getByRole("button", { name: /^(Check|Call)/ });
      if (await call.isVisible() && await call.isEnabled()) await call.click();
      else await page.waitForTimeout(100);
    }
    expect(finished).toBe(true);
    await expect(page.locator(".dealer-position")).toHaveAttribute("data-dealer", "1");
    await expect(page.locator(".dealer-owner")).toHaveText("AKIRA");
    await expect(page.locator('.seat[data-player-id="1"] .dealer')).toHaveText("D");
    await page.locator(".history-item").first().click();
    await expect(page.locator(".dealer-owner")).toHaveText("YOU");
    await page.getByRole("button", { name: "ライブテーブルに戻る →" }).click();
    await expect(page.locator(".dealer-owner")).toHaveText("AKIRA");
  });
}
