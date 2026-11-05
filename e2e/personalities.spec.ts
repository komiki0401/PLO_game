import { expect, test } from "@playwright/test";

test("shows the five fixed CPU styles on the home screen, seats and rules in both games", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("plo-settings", JSON.stringify({ count: 6, sound: false, voice: false, speed: 4 })));
  await page.goto("/");
  await page.getByText("CPUの個性を見る", { exact: true }).click();
  const names = ["AKIRA · 攻撃型", "LUNA · 堅実型", "REN · 積極加圧型", "MIKA · フロップ参加型", "SORA · ブラフ混合型"];
  for (const name of names) await expect(page.locator(".cpu-roster")).toContainText(name);
  for (const mode of ["PLO5・Wボードボムポット", "PLO4・プリフロップ"]) {
    await page.getByRole("button", { name: mode }).click();
    await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
    await expect(page.locator(".npc-style")).toHaveCount(5);
    for (const badge of await page.locator(".npc-style").all()) await expect(badge).toBeVisible();
    await page.screenshot({ path: `test-results/cpu-styles-${mode.startsWith("PLO4") ? "plo4" : "plo5"}-${test.info().project.name}.png` });
    await page.getByRole("button", { name: "ルール", exact: true }).click();
    await page.getByText("CPUの個性を見る", { exact: true }).click();
    await expect(page.locator(".cpu-roster")).toContainText("MIKA · フロップ参加型");
    await page.getByRole("button", { name: "テーブルに戻る", exact: true }).click();
    await page.getByRole("button", { name: "トップへ", exact: true }).click();
  }
  expect(errors).toEqual([]);
});
