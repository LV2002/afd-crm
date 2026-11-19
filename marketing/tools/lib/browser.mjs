// Headless Chromium for rendering slides and PDFs. On your own computer run `npx playwright install chromium` once.
// Environment override: CHROMIUM_PATH. The cloud sandbox keeps a ready browser in /opt/pw-browsers/chromium.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

export async function launchBrowser() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  try { return await chromium.launch(); } catch (first) {
    const fallback = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium/chrome'].find((p) => existsSync(p));
    if (!fallback) throw new Error(`Could not start Chromium (${String(first.message).split('\n')[0]}). Run: npx playwright install chromium`);
    return chromium.launch({ executablePath: fallback, args: ['--no-sandbox'] });
  }
}
