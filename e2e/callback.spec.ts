// Risk: PKCE callback swallows an exchangeCodeForSession error or misroutes the redirect
// (test-plan.md Risk #8)
// Seed: e2e/seed.spec.ts
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("callback PKCE bez kodu przekierowuje do forgot-password z komunikatem błędu [Ryzyko #8]", async ({ page }) => {
  await page.goto("/api/auth/callback");

  await page.waitForURL(/\/auth\/forgot-password/);

  await expect(page.getByRole("heading", { name: "Resetuj hasło" })).toBeVisible();
  await expect(page.getByText("Link jest nieprawidłowy lub wygasł", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyślij link resetowania" })).toBeVisible();
});
