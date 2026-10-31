import { test, expect } from "@playwright/test";
test.setTimeout(60000);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "plo-settings",
      JSON.stringify({ sound: false, voice: false }),
    );
    let seed = 42;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
});
test("human vs five CPUs: play through two hands, history, replay, settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Two boards/ })).toBeVisible();
  await page.getByRole("button", { name: /設定/ }).click();
  await page.getByLabel("アニメーション速度").selectOption("4");
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  await expect(page.locator(".seat")).toHaveCount(6);
  for (let hand = 0; hand < 2; hand++) {
    for (let step = 0; step < 100; step++) {
      if (await page.getByRole("button", { name: "次のハンド →" }).isVisible())
        break;
      const check = page.getByRole("button", { name: "Check", exact: true }),
        call = page.getByRole("button", { name: /^Call / });
      if (await check.isVisible()) await check.click();
      else if (await call.isVisible()) await call.click();
      await page.waitForTimeout(150);
    }
    await expect(
      page.getByRole("button", { name: "次のハンド →" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".history-item")).toHaveCount(hand + 1);
    if (hand === 0)
      await page.getByRole("button", { name: "次のハンド →" }).click();
  }
  await page.locator(".history-item").last().click();
  await expect(page.getByText("REPLAY · HAND #1")).toBeVisible();
  await page.getByRole("slider", { name: "リプレイのアクション" }).fill("0");
  await expect(page.locator(".street")).toHaveText("FLOP");
  await page.getByRole("button", { name: "ライブテーブルに戻る →" }).click();
  await page.screenshot({
    path: `/tmp/plo-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("bet controls, rules, and heads-up settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /ルール/ }).click();
  await expect(
    page.getByRole("heading", { name: "必ず、2枚 ＋ 3枚。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "テーブルに戻る" }).click();
  await page.getByRole("button", { name: /設定/ }).click();
  await page.getByLabel("プレイヤー人数").selectOption("2");
  await page.getByLabel("CPU難易度").selectOption("EASY");
  await page.getByLabel("初期スタック").fill("10000");
  await page.getByLabel("アニメーション速度").selectOption("4");
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  await expect(page.locator(".seat")).toHaveCount(2);
  await expect(page.locator(".seat-3")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Pot", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Pot", exact: true }).click();
  const input = page.getByRole("spinbutton", { name: "合計ベット額" });
  expect(Number(await input.inputValue())).toBeGreaterThanOrEqual(100);
  await page.locator("button.raise").click();
  await expect(page.locator(".error")).toHaveCount(0);
});

test("showdown reveals exactly five winning cards on A, pauses, then reveals B", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("プレイヤー人数").selectOption("2");
  await page.getByLabel("初期スタック").fill("100");
  await page.getByLabel("ボムポットアンティ").fill("100");
  await page.getByLabel("アニメーション速度").selectOption("4");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  const verdict = page.locator(".showdown-verdict");
  await expect(verdict).toHaveAttribute("data-board", "0");
  await expect(page.locator(".seat-top strong")).toHaveText([
    "0 CHIPS",
    "0 CHIPS",
  ]);
  await expect(verdict.locator("strong span")).not.toBeEmpty();
  await expect(page.locator(".card.lit")).toHaveCount(5);
  await expect(page.locator(".hole-cards .card.lit")).toHaveCount(2);
  await expect(
    page.locator(".board-row").nth(0).locator(".card.lit"),
  ).toHaveCount(3);
  await expect(
    page.locator(".board-row").nth(1).locator(".card.lit"),
  ).toHaveCount(0);
  await expect(page.locator('.results [data-board="1"]')).toHaveCount(0);
  await expect(page.locator(".action-panel .primary")).toHaveCount(0);
  await page.clock.runFor(1599);
  await expect(verdict).toHaveAttribute("data-board", "0");
  await page.clock.runFor(1);
  await expect(verdict).toHaveAttribute("data-board", "1");
  await expect(verdict.locator("strong span")).not.toBeEmpty();
  await expect(page.locator(".card.lit")).toHaveCount(5);
  await expect(page.locator(".hole-cards .card.lit")).toHaveCount(2);
  await expect(
    page.locator(".board-row").nth(0).locator(".card.lit"),
  ).toHaveCount(0);
  await expect(
    page.locator(".board-row").nth(1).locator(".card.lit"),
  ).toHaveCount(3);
  await expect(page.locator(".action-panel .primary")).toHaveCount(0);
  await page.clock.runFor(1600);
  await expect(page.locator(".action-panel .primary")).toBeVisible();
  await page.locator(".board-label").nth(0).click();
  await expect(verdict).toHaveAttribute("data-board", "0");
  await expect(page.locator(".card.lit")).toHaveCount(5);
});

test("bundled female voice plays A then B, waits for speech, and mutes immediately", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const original = Original.prototype.createOscillator;
    (window as unknown as { seCount: number }).seCount = 0;
    Original.prototype.createOscillator = function () {
      (window as unknown as { seCount: number }).seCount++;
      return original.call(this);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "音声を有効にする" }).click();
  await expect(page.getByRole("button", { name: "ミュート" })).toBeVisible();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("プレイヤー人数").selectOption("2");
  await page.getByLabel("初期スタック").fill("100");
  await page.getByLabel("ボムポットアンティ").fill("100");
  await page.getByLabel("アニメーション速度").selectOption("4");
  await expect(page.getByLabel("女性ボイス（役の読み上げ）")).toHaveValue(
    "true",
  );
  await page.evaluate(() => {
    const player = document.querySelector<HTMLAudioElement>(".voice-player")!;
    const trace = window as unknown as { spoken: string[] };
    trace.spoken = [];
    player.addEventListener("ended", () =>
      trace.spoken.push(player.currentSrc),
    );
  });
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  const voice = page.locator(".voice-player"),
    verdict = page.locator(".showdown-verdict");
  await expect(verdict).toHaveAttribute("data-board", "0");
  await expect(voice).toHaveJSProperty("paused", false);
  await expect
    .poll(() => voice.evaluate((el: HTMLAudioElement) => el.currentSrc))
    .toMatch(/\/a-\d.mp3$/);
  await expect
    .poll(() => voice.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0.1);
  // Advancing the minimum visual hold must not interrupt a longer voice clip.
  await expect(verdict).toHaveAttribute("data-board", "1", { timeout: 12000 });
  expect(
    await page.evaluate(() =>
      (window as unknown as { spoken: string[] }).spoken.some((src) =>
        /\/a-\d.mp3$/.test(src),
      ),
    ),
  ).toBe(true);
  await expect
    .poll(() => voice.evaluate((el: HTMLAudioElement) => el.currentSrc))
    .toMatch(/\/b-\d.mp3$/);
  expect(
    await page.evaluate(
      () => (window as unknown as { seCount: number }).seCount,
    ),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "ミュート" }).click();
  await expect(voice).toHaveJSProperty("paused", true);
  const prefs = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("plo-settings")!),
  );
  expect(prefs.sound).toBe(false);
  expect(prefs.voice).toBe(false);
  await expect(page.locator(".action-panel .primary")).toBeVisible({
    timeout: 10000,
  });
  expect(errors).toEqual([]);
});
