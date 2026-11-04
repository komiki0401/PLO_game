import { test, expect, type Page } from "@playwright/test";
const pageErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});
test.setTimeout(60000);
async function openTable(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "ゲームを始める", exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
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
  await openTable(page);
  await expect(page.locator(".arena")).toBeVisible();
  await page.getByRole("button", { name: /設定/ }).click();
  await page.getByLabel("CPU難易度").selectOption("EASY");
  await page.getByLabel("初期スタック").fill("10000000");
  await page.getByLabel("ボムポットアンティ").fill("1");
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
  await openTable(page);
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
  await openTable(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("プレイヤー人数").selectOption("2");
  await page.getByLabel("初期スタック").fill("100");
  await page.getByLabel("ボムポットアンティ").fill("100");
  await page.getByLabel("アニメーション速度").selectOption("4");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  await expect(page.locator(".all-in-cutin")).toBeVisible();
  await page.clock.runFor(1600);
  await expect(page.locator(".all-in-cutin")).toHaveCount(0);
  const verdict = page.locator(".showdown-verdict");
  await expect(verdict).toHaveAttribute("data-board", "0");
  await expect(page.locator(".seat-top strong")).toHaveText([
    "0 CHIPS",
    "0 CHIPS",
  ]);
  await expect(page.locator('.chip-rack[data-amount="0"]')).toHaveCount(2);
  await expect(verdict.locator("strong span")).not.toBeEmpty();
  await expect(page.locator(".card.lit")).toHaveCount(5);
  await expect(
    page.locator(".showdown .card:not(.lit):not(.empty)"),
  ).toHaveCount(15);
  await expect(
    page.locator(".showdown .card:not(.lit):not(.empty)").first(),
  ).toHaveCSS("filter", "brightness(0.28) saturate(0.45)");
  await expect(page.locator(".card.lit").first()).toHaveCSS("filter", "none");
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
  await expect(
    page.locator(".showdown .card:not(.lit):not(.empty)"),
  ).toHaveCount(15);
  await expect(
    page.locator(".showdown .card:not(.lit):not(.empty)").first(),
  ).toHaveCSS("filter", "brightness(0.28) saturate(0.45)");
  await expect(page.locator(".card.lit").first()).toHaveCSS("filter", "none");
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
  await expect(
    page.locator(".showdown .card:not(.lit):not(.empty)"),
  ).toHaveCount(15);
  await expect(
    page.locator(".showdown .card:not(.lit):not(.empty)").first(),
  ).toHaveCSS("filter", "brightness(0.28) saturate(0.45)");
  await expect(page.locator(".card.lit").first()).toHaveCSS("filter", "none");
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
  await openTable(page);
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

test("changing seat count during a CPU turn safely starts a new session", async ({
  page,
}) => {
  await openTable(page);
  await expect(page.locator(".seat-3.active")).toBeVisible({ timeout: 10000 });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("プレイヤー人数").selectOption("2");
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  await expect(page.locator(".seat")).toHaveCount(2);
  await expect(page.locator(".error")).toHaveCount(0);
  await expect(page.locator("main")).not.toHaveClass("showdown");
  await expect(page.locator(".card").first()).toHaveCSS("filter", "none");
});

test("human call and raise use the female action voice", async ({ page }) => {
  await openTable(page);
  await page.getByRole("button", { name: "音声を有効にする" }).click();
  await expect(page.getByRole("button", { name: "ミュート" })).toBeVisible();
  for (const action of ["call", "raise"]) {
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.getByLabel("プレイヤー人数").selectOption("2");
    await page.getByLabel("初期スタック").fill("10000");
    await page.getByLabel("ボムポットアンティ").fill("100");
    await page.getByLabel("CPU難易度").selectOption("EASY");
    await page.getByLabel("アニメーション速度").selectOption("4");
    await page.evaluate(() => {
      let seed = 2;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    });
    await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
    await expect(page.getByRole("button", { name: /^Call / })).toBeVisible({
      timeout: 10000,
    });
    if (action === "call")
      await page.getByRole("button", { name: /^Call / }).click();
    else {
      await page.getByRole("button", { name: "Pot", exact: true }).click();
      await page.locator("button.raise").click();
    }
    const voice = page.locator(".voice-player");
    await expect
      .poll(() => voice.evaluate((el: HTMLAudioElement) => el.currentSrc), {
        timeout: 10000,
      })
      .toMatch(new RegExp(`/${action}\\.mp3$`));
    await expect
      .poll(() => voice.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(0.1);
  }
});

test("showdown voice occurs once per board even on ties, reselection and replay", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    const trace = window as unknown as { roleStarts: string[] };
    trace.roleStarts = [];
    HTMLMediaElement.prototype.play = function () {
      if (/\/[ab]-\d\.mp3$/.test(this.src)) trace.roleStarts.push(this.src);
      return original.call(this);
    };
  });
  await openTable(page);
  await page.getByRole("button", { name: "音声を有効にする" }).click();
  await expect(page.getByRole("button", { name: "ミュート" })).toBeVisible();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("プレイヤー人数").selectOption("3");
  await page.getByLabel("初期スタック").fill("100");
  await page.getByLabel("ボムポットアンティ").fill("100");
  await page.getByLabel("アニメーション速度").selectOption("4");
  // Seed and start in the same browser task: an old table's pending CPU timer
  // must not consume random numbers between seeding and dealing this fixture.
  await page.getByRole("button", { name: "設定を適用して開始 →" }).evaluate((button: HTMLButtonElement) => {
    // Keep chips after the tied board so replay remains available.
    let seed = 8;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    button.click();
  });
  await expect(page.locator(".action-panel .primary")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('.results [data-board="0"]')).toHaveCount(2);
  const roles = () =>
    page.evaluate(
      () => (window as unknown as { roleStarts: string[] }).roleStarts,
    );
  expect((await roles()).filter((src) => /\/a-/.test(src))).toHaveLength(1);
  expect((await roles()).filter((src) => /\/b-/.test(src))).toHaveLength(1);
  for (const button of await page.locator(".board-label,.results button").all())
    await button.click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await page.locator(".history-item").first().click();
  await page.clock.runFor(6000);
  await page.getByRole("button", { name: "ライブテーブルに戻る →" }).click();
  await page.clock.runFor(6000);
  expect(await roles()).toHaveLength(2);
});

test("chip piles match balances and large stacks fit a narrow table", async ({
  page,
}) => {
  await openTable(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await expect(page.locator(".chip-rack")).toHaveCount(6);
  const checkStacks = async () => {
    const stacks = await page.locator(".seat").evaluateAll((seats) =>
      seats.map((seat) => {
        const rack = seat.querySelector<HTMLElement>(".chip-rack")!,
          header = seat.querySelector<HTMLElement>(".seat-top strong")!,
          holes = seat.querySelector<HTMLElement>(".hole-cards")!;
        return {
          amount: Number(rack.dataset.amount),
          display: Number(header.textContent!.replace(/[^0-9]/g, "")),
          total: Array.from(
            rack.querySelectorAll<HTMLElement>(".chip-column"),
          ).reduce(
            (sum, p) => sum + Number(p.dataset.value) * Number(p.dataset.count),
            0,
          ),
          maxPile: Math.max(
            0,
            ...Array.from(rack.querySelectorAll(".chip-pile")).map(
              (p) => p.children.length,
            ),
          ),
          noOverlap:
            rack.getBoundingClientRect().bottom <=
            holes.getBoundingClientRect().top + 0.5,
          numberFits: header.scrollWidth <= header.clientWidth + 1,
        };
      }),
    );
    for (const s of stacks) {
      expect(s.total).toBe(s.amount);
      expect(s.display).toBe(s.amount);
      expect(s.maxPile).toBeLessThanOrEqual(8);
      expect(s.noOverlap).toBe(true);
      expect(s.numberFits).toBe(true);
    }
  };
  await checkStacks();
  expect(
    await page
      .locator(".seat:not(.human) .seat-top strong")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(14);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("初期スタック").fill("10000000");
  await page.getByLabel("ボムポットアンティ").fill("1");
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  await expect(page.locator('.chip-rack[data-amount="9999999"]')).toHaveCount(
    6,
  );
  await checkStacks();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const overlap = await page.locator(".seat").evaluateAll((seats) => {
    const rects = seats.map((s) => s.getBoundingClientRect());
    return rects.some((a, i) =>
      rects.some(
        (b, j) =>
          i < j &&
          Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
          Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1,
      ),
    );
  });
  expect(overlap).toBe(false);
  await page.screenshot({
    path: `/tmp/plo-chips-large-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("new logo and poker backdrop load and human turns dim all opponent cards", async ({
  page,
}) => {
  await openTable(page);
  const logo = page.getByRole("img", {
    name: "DOUBLE BOARD PLO5",
    exact: true,
  });
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain("poker-background.webp");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("プレイヤー人数").selectOption("6");
  await page.getByLabel("初期スタック").fill("10000000");
  await page.getByLabel("ボムポットアンティ").fill("100");
  await page.getByLabel("CPU難易度").selectOption("EASY");
  await page.getByLabel("アニメーション速度").selectOption("4");
  await page.evaluate(() => {
    let seed = 2;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  await page.getByRole("button", { name: "設定を適用して開始 →" }).click();
  await expect(page.locator("main")).toHaveClass(/human-turn/, {
    timeout: 15000,
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 10));
  await expect(page.locator(".your-turn-flag")).toBeVisible();
  await expect(page.locator(".seat:not(.human) .card")).toHaveCount(25);
  const filters = await page
    .locator(".seat:not(.human) .card")
    .evaluateAll((cards) => cards.map((el) => getComputedStyle(el).filter));
  expect(filters.every((f) => f === "brightness(0.22) saturate(0.3)")).toBe(
    true,
  );
  await expect(page.locator(".human .card")).toHaveCount(5);
  for (const card of await page.locator(".human .card").all())
    await expect(card).toHaveCSS("filter", "none");
  await page.screenshot({
    path: `/tmp/plo-brand-turn-${test.info().project.name}.png`,
    fullPage: true,
  });
  if (
    await page.getByRole("button", { name: "Check", exact: true }).isVisible()
  )
    await page.getByRole("button", { name: "Check", exact: true }).click();
  else await page.getByRole("button", { name: /^Call / }).click();
  await expect(page.locator("main")).not.toHaveClass(/human-turn/);
  await expect(page.locator(".your-turn-flag")).toHaveCount(0);
  await expect(
    page.locator(".seat:not(.human):not(.folded) .card").first(),
  ).toHaveCSS("filter", "none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
