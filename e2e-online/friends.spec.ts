import { test, expect, type BrowserContext, type Page } from "@playwright/test";
for (const mode of ["holdem", "plo4", "plo5"]) {
  test(`six friends play ${mode}, reconnect and keep private hands`, async ({ browser }) => {
    const contexts: BrowserContext[] = [], pages: Page[] = [];
    const packets: unknown[][] = [];
    try {
      for (let i = 0; i < 6; i++) {
        const context = await browser.newContext({ viewport: { width: i === 5 ? 390 : 1280, height: 844 } });
        contexts.push(context);
        const page = await context.newPage(); pages.push(page); packets[i] = [];
        page.on("websocket", ws => ws.on("framereceived", e => {
          try { packets[i].push(JSON.parse(e.payload.toString())); } catch {}
        }));
      }
      const host = pages[0];
      await host.goto("/");
      await host.getByRole("button", { name: "友達とオンライン対戦（最大6人）" }).click();
      await host.getByLabel("表示名").fill("P0");
      await host.getByRole("combobox", { name: "ゲーム", exact: true }).selectOption(mode);
      await host.getByRole("button", { name: "招待部屋を作成" }).click();
      await expect(host.getByRole("heading", { name: "待合室 · 1/6人" })).toBeVisible();
      const invite = await host.getByLabel("友達への招待URL").inputValue();
      for (let i = 1; i < 6; i++) {
        await pages[i].goto(invite);
        await pages[i].getByLabel("表示名").fill(`P${i}`);
        await pages[i].getByRole("button", { name: "入室する", exact: true }).click();
        await expect(pages[i].getByRole("heading", { name: `待合室 · ${i + 1}/6人` })).toBeVisible();
      }
      await expect(host.getByRole("heading", { name: "待合室 · 6/6人" })).toBeVisible();
      const seventh = await browser.newContext(); contexts.push(seventh);
      const extra = await seventh.newPage(); await extra.goto(invite);
      await extra.getByLabel("表示名").fill("7人目");
      await extra.getByRole("button", { name: "入室する", exact: true }).click();
      await expect(extra.getByRole("alert")).toContainText("満員");
      await host.getByRole("button", { name: "全員で対戦開始" }).click();
      for (let i = 0; i < 6; i++) {
        await expect(pages[i].getByLabel("オンライン対戦テーブル")).toBeVisible();
        const packet = packets[i].filter((p: any) => p.type === "state" && p.game).at(-1) as any;
        expect(packet.game.players[i].hole.every((c: unknown) => typeof c === "number")).toBe(true);
        expect(packet.game.players.filter((p: any) => p.id !== i).every((p: any) => p.hole.every((c: unknown) => c === null))).toBe(true);
        expect(JSON.stringify(packet)).not.toMatch(/"deck"|"tokenHash"|"burns"/);
      }
      // Reload the same tab: the session credential must restore seat 5.
      await pages[5].reload();
      await expect(pages[5].getByLabel("P5の席")).toContainText("あなた");
      expect(await pages[5].evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (let hand = 0; hand < 2; hand++) {
        for (let step = 0; step < 100; step++) {
          if (await host.getByRole("heading", { name: "ハンド結果", exact: true }).isVisible()) break;
          const heading = await host.locator(".online-actions h2").innerText();
          const actor = heading === "あなたの番" ? 0 : Number(heading.match(/^P(\d+) の番$/)?.[1]);
          expect(Number.isInteger(actor)).toBe(true);
          const previous = packets[0].filter((p: any) => p.type === "state").at(-1) as any;
          await pages[actor].getByRole("button", { name: /^(Check|Call [\d,]+)$/ }).click();
          await expect.poll(() => {
            const packet = packets[0].filter((p: any) => p.type === "state").at(-1) as any;
            return packet.revision;
          }).toBeGreaterThan(previous.revision);
        }
        await expect(host.getByRole("heading", { name: "ハンド結果", exact: true })).toBeVisible();
        const last = packets[0].filter((p: any) => p.type === "state").at(-1) as any;
        expect(last.game.players.reduce((sum: number, p: any) => sum + p.stack, 0)).toBe(60000);
        if (!hand) {
          await host.getByRole("button", { name: "次のハンドへ" }).click();
          await expect(host.locator(".online-connection")).toContainText("HAND #2");
        }
      }
      expect(await host.evaluate(() => localStorage.getItem("plo-scores-v1"))).toBeNull();
      await host.screenshot({ path: `/tmp/poker-online-${mode}.png`, fullPage: true });
    } finally { await Promise.all(contexts.map(c => c.close())); }
  });
}
