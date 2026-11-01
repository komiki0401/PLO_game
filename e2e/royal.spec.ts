import { expect, test } from "@playwright/test";

test("labels the heart royal from the reported cards in showdown, results and replay", async ({ page }, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 568 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("plo-settings", JSON.stringify({ count: 2, stack: 100, ante: 100, speed: 4, sound: false, voice: false }));
    // Deterministic legal shuffle: reproduce Ah/Th + Jh/Kh/Qh, without a test hook in the game.
    const draws = "Ah As Th Ks Qc Kd 6s 2d Ts 3d 8h Jh 4c 9h 8s 7c Kh Kc Qh 2c"
      .split(" ").map(c => "23456789TJQKA".indexOf(c[0]) + 13 * "shcd".indexOf(c[1]));
    const target = [...Array.from({ length: 52 }, (_, i) => i).filter(c => !draws.includes(c)), ...draws.reverse()];
    const deck = Array.from({ length: 52 }, (_, i) => i), rolls: number[] = [];
    for (let i = 51; i > 0; i--) {
      const j = deck.indexOf(target[i]);
      rolls.push((j + 0.5) / (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    let n = 0;
    Math.random = () => rolls[n++ % rolls.length];
    (window as unknown as { resetRoyalShuffle: () => void }).resetRoyalShuffle = () => { n = 0; };
  });
  await page.goto("/");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.evaluate(() => (window as unknown as { resetRoyalShuffle: () => void }).resetRoyalShuffle());
  await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
  await page.clock.runFor(1600);
  const verdict = page.locator(".showdown-verdict");
  await expect(verdict).toContainText("ロイヤルストレートフラッシュ");
  await expect(page.locator(".end-actions h2")).toContainText("ロイヤルストレートフラッシュ");
  await expect(page.locator(".card.lit")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/royal-${info.project.name}.png` });
  await page.clock.runFor(3200);
  await expect(page.locator('.results [data-board="0"]')).toContainText("ロイヤルストレートフラッシュ");
  await page.locator(".history-item").first().click();
  await page.locator(".board-label").first().click();
  await expect(verdict).toContainText("ロイヤルストレートフラッシュ");
  expect(errors).toEqual([]);
});
