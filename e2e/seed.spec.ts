import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated access to /auth/reset-password is redirected with error message [Risk #7]", async ({ page }) => {
  await page.goto("/auth/reset-password");

  await page.waitForURL(/\/auth\/forgot-password/);

  await expect(page.getByRole("heading", { name: "Resetuj hasło" })).toBeVisible();
  await expect(page.getByText("Link jest nieprawidłowy lub wygasł", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyślij link resetowania" })).toBeVisible();
});
