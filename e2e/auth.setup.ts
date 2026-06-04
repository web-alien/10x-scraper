import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/auth/signin");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL ?? "");
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await page.waitForURL("/");

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
