import { expect, test } from "@playwright/test";

test("number input, slider and pot presets choose hundreds while keeping the SB call exact", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("plo-settings", JSON.stringify({ mode: "plo4", count: 2, stack: 10000, ante: 100, sound: false, voice: false })));
  await page.goto("/");
  await page.getByRole("button", { name: "PLO4・プリフロップ" }).click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.getByRole("button", { name: "ゲームを始める", exact: true }).click();
  await expect(page.getByRole("button", { name: "Call 50", exact: true })).toBeVisible();
  const input = page.getByLabel("合計ベット額", { exact: true });
  const slider = page.getByLabel("ベット額スライダー");
  await expect(input).toHaveAttribute("step", "100");
  await expect(slider).toHaveAttribute("step", "100");
  await slider.fill("300");
  await expect(input).toHaveValue("300");
  await page.getByRole("button", { name: "¾ Pot", exact: true }).click();
  await expect(input).toHaveValue("200");
  await page.getByRole("button", { name: "Pot", exact: true }).click();
  await expect(input).toHaveValue("300");
  await input.fill("259");
  await expect(input).toHaveValue("200");
  await page.locator("button.raise").click();
  await expect(page.locator(".seat.human .bet-chip")).toHaveText("◉ 200");
  await expect(page.locator(".error")).toHaveCount(0);
});
