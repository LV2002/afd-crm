import { mkdirSync } from "node:fs";

import { expect, test as setup } from "@playwright/test";

import { ROLES, SEED_PASSWORD, storageStateFor } from "./roles";

/**
 * Signs in once as each seeded user and saves the cookies to disk.
 *
 * Every other test starts already signed in, which is worth doing for more
 * than speed: a login step at the top of forty tests means forty chances
 * for an unrelated auth hiccup to fail a test about something else, and a
 * red suite that has nothing to do with the change you just made is a suite
 * people stop running.
 */
setup.describe.configure({ mode: "serial" });

mkdirSync("e2e/.auth", { recursive: true });

for (const role of ROLES) {
  setup(`sign in as ${role.describes}`, async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill(role.email);
    await page.getByLabel(/password/i).fill(SEED_PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Landing on the dashboard is the only proof that the whole chain
    // worked: Supabase accepted the password, the middleware saw the
    // cookie, and `getCurrentUser()` found a profile with a role. A
    // redirect back to /login means one of those three, and the message on
    // screen says which.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    await page.context().storageState({ path: storageStateFor(role.key) });
  });
}
