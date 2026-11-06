import { test, expect } from "@playwright/test";
test("rejects a forged turn and origin, transfers host, and times out a disconnected player", async ({ browser, request }) => {
  const forbidden = await request.post("http://127.0.0.1:8787/rooms", {
    headers: { Origin: "https://untrusted.example" }, data: { mode: "holdem", stack: 10000, ante: 100 },
  });
  expect(forbidden.status()).toBe(403);
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    await b.addInitScript(() => {
      const Original = window.WebSocket;
      const trace = window as unknown as { testSocket: WebSocket; roomRevision: number };
      window.WebSocket = class extends Original {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          trace.testSocket = this;
          this.addEventListener("message", event => {
            if (event.data === "pong") return;
            const data = JSON.parse(event.data);
            if (data.type === "state") trace.roomRevision = data.revision;
          });
        }
      };
    });
    const host = await a.newPage(), friend = await b.newPage();
    await host.goto("/");
    await host.getByRole("button", { name: "友達とオンライン対戦（最大6人）" }).click();
    await host.getByLabel("表示名").fill("Host");
    await host.getByRole("button", { name: "招待部屋を作成" }).click();
    await expect(host.getByRole("heading", { name: "待合室 · 1/6人" })).toBeVisible();
    await friend.goto(await host.getByLabel("友達への招待URL").inputValue());
    await friend.getByLabel("表示名").fill("Friend");
    await friend.getByRole("button", { name: "入室する", exact: true }).click();
    await expect(host.getByRole("heading", { name: "待合室 · 2/6人" })).toBeVisible();
    await host.getByRole("button", { name: "全員で対戦開始" }).click();
    await expect(friend.locator(".online-actions h2")).toHaveText("Host の番");
    await friend.evaluate(() => {
      const trace = window as unknown as { testSocket: WebSocket; roomRevision: number };
      trace.testSocket.send(JSON.stringify({ type: "action", revision: trace.roomRevision, action: { type: "raise", to: 5000 } }));
    });
    await expect(friend.getByRole("alert")).toContainText("あなたの手番ではありません");
    await expect(friend.getByLabel("Hostの席")).toContainText("9,950");
    await host.close();
    await expect(friend.locator(".online-members")).toContainText("Friend（あなた） · ホスト");
    // This uses the real Durable Object alarm, not the browser's fake clock.
    await expect(friend.getByRole("heading", { name: "ハンド結果", exact: true })).toBeVisible({ timeout: 55000 });
    await expect(friend.getByLabel("Hostの席")).toContainText("FOLD");
    await friend.getByRole("button", { name: "次のハンドへ" }).click();
    await expect(friend.locator(".online-connection")).toContainText("HAND #2");
  } finally { await a.close(); await b.close(); }
});
