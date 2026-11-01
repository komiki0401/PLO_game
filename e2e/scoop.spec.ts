import { test, expect } from "@playwright/test";
import { create, defaults } from "../src/game/engine";
const random = (value: number) => () => {
  value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
  return value / 4294967296;
};
const settings = { ...defaults, count: 3, stack: 100, ante: 100, speed: 4, sound: false, voice: false };
for (const hero of [true, false]) {
  test(`scoop celebrates ${hero ? "human" : "CPU"} only after both boards and expires`, async ({ page }) => {
    let seed = 0;
    for (let n = 1; n < 200; n++) {
      const s = create(settings, random(n));
      const winner = s.awards[0]?.winners[0];
      if ((winner === 0) === hero && s.awards.length && s.awards.every(a => a.winners.length === 1 && a.winners[0] === winner)) { seed = n; break; }
    }
    expect(seed).toBeGreaterThan(0);
    await page.addInitScript(({ settings }) => localStorage.setItem("plo-settings", JSON.stringify(settings)), { settings });
    await page.goto("/");
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 10));
    await page.evaluate(value => {
      Math.random = () => { value = (Math.imul(value,1664525)+1013904223)>>>0; return value/4294967296; };
    }, seed);
    await page.getByRole("button", { name: "今すぐプレイ", exact: true }).click();
    await expect(page.locator(".scoop-celebration")).toHaveCount(0);
    await page.clock.runFor(1600); // All-in cut-in.
    await page.clock.runFor(1600); // Board A.
    await expect(page.locator(".showdown-verdict")).toHaveAttribute("data-board", "1");
    await expect(page.locator(".scoop-celebration")).toHaveCount(0);
    await page.clock.runFor(1600); // Board B finishes.
    await expect(page.locator(".scoop-message > strong")).toHaveText("SCOOP!");
    await expect(page.locator(".scoop-message > em")).toContainText("+300");
    await expect(page.locator(".scoop-celebration")).toHaveClass(hero ? /hero-scoop/ : /^scoop-celebration$/);
    await page.clock.runFor(400);
    await page.locator(".scoop-celebration").evaluate(el => {
      for (const node of [el, ...el.querySelectorAll("*")])
        for (const animation of node.getAnimations()) animation.currentTime = 400;
    });
    await page.screenshot({path:`/tmp/plo-scoop-${test.info().project.name}-${hero}.png`});
    const bounds = await page.locator(".scoop-message").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.clock.runFor(2400);
    await expect(page.locator(".scoop-celebration")).toHaveCount(0);
    await page.locator(".results button").first().click();
    await expect(page.locator(".scoop-celebration")).toHaveCount(0);
  });
}
