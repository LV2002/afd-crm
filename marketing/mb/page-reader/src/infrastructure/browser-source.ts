import { existsSync } from 'node:fs';
import { err, ok, type Result } from '@mb/platform';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import type { FetchedPage, PageSource } from '../application/gentle-reader.ts';

const CHROME_PATHS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];

export function findChrome(env: Record<string, string | undefined> = process.env): string | undefined {
  const explicit = env['CHROME_PATH'];
  return [explicit, ...CHROME_PATHS].find((p): p is string => p !== undefined && existsSync(p));
}

// The owner's own Google Chrome, headless, with its normal identity plus our name on the end, so the site can see who we are.
// Plain scripted requests are refused by the site's protection; a real browser is let in. If a challenge appears we stop.
export class BrowserPageSource implements PageSource {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private readonly chromePath: string;
  private readonly agentToken: string;

  constructor(chromePath: string, agentToken: string) {
    this.chromePath = chromePath;
    this.agentToken = agentToken;
  }

  private async open(): Promise<BrowserContext> {
    if (this.context !== undefined) return this.context;
    this.browser = await chromium.launch({ executablePath: this.chromePath, headless: true });
    const probe = await this.browser.newPage();
    const normal = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
    await probe.close();
    this.context = await this.browser.newContext({ userAgent: `${normal} ${this.agentToken}` });
    return this.context;
  }

  async getPage(url: string): Promise<Result<FetchedPage, string>> {
    try {
      const page = await (await this.open()).newPage();
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
        return ok({ url, status: res?.status() ?? 0, html: await page.content() });
      } finally {
        await page.close();
      }
    } catch (cause) {
      return err(cause instanceof Error ? cause.message.split('\n')[0] ?? 'browser error' : 'browser error');
    }
  }

  async getText(url: string): Promise<Result<{ status: number; text: string }, string>> {
    try {
      const res = await (await this.open()).request.get(url, { timeout: 30_000 });
      return ok({ status: res.status(), text: await res.text() });
    } catch (cause) {
      return err(cause instanceof Error ? cause.message.split('\n')[0] ?? 'request error' : 'request error');
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
