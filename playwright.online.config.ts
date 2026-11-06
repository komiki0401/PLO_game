import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-online", timeout: 120000, workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", headless: true },
  webServer: [
    { command: "npm run preview -- --port 4173", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
    { command: "npm run dev:online", url: "http://127.0.0.1:8787/health", reuseExistingServer: !process.env.CI, env: { WRANGLER_SEND_METRICS: "false" }, timeout: 120000 },
  ],
});
