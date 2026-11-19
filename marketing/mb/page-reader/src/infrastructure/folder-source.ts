import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, type Result } from '@mb/platform';
import type { FetchedPage, PageSource } from '../application/gentle-reader.ts';

// Reads saved copies of pages (one .html file per address path) so the owner can work offline or feed in a page
// saved by hand, and so tests never touch the network. "/page/nid-coaching" is read from "page__nid-coaching.html".
export class FolderPageSource implements PageSource {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  getPage(url: string): Promise<Result<FetchedPage, string>> {
    const file = join(this.dir, `${new URL(url).pathname.replace(/^\/|\/$/g, '').replaceAll('/', '__') || 'home'}.html`);
    return Promise.resolve(ok({ url, status: existsSync(file) ? 200 : 404, html: existsSync(file) ? readFileSync(file, 'utf8') : '' }));
  }

  getText(): Promise<Result<{ status: number; text: string }, string>> {
    return Promise.resolve(ok({ status: 404, text: '' }));
  }
}
