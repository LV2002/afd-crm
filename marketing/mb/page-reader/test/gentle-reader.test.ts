import { err, ok, type Result } from '@mb/platform';
import { describe, expect, it } from 'vitest';
import { GentleReader, isAllowed, looksLikeChallenge, type FetchedPage, type PageSource } from '../src/index.ts';

class ScriptedSource implements PageSource {
  readonly pageCalls: string[] = [];
  readonly textCalls: string[] = [];
  robots: { status: number; text: string } | 'unreachable' = { status: 200, text: 'User-agent: *\nDisallow: /private' };
  pages: Record<string, { status: number; html: string }> = {};

  getPage(url: string): Promise<Result<FetchedPage, string>> {
    this.pageCalls.push(url);
    const p = this.pages[url] ?? { status: 200, html: `<html>${'x'.repeat(100)}</html>` };
    return Promise.resolve(ok({ url, ...p }));
  }

  getText(url: string): Promise<Result<{ status: number; text: string }, string>> {
    this.textCalls.push(url);
    return Promise.resolve(this.robots === 'unreachable' ? err('offline') : ok(this.robots));
  }
}

const make = (source: ScriptedSource) => {
  const sleeps: number[] = [];
  const reader = new GentleReader(source, { origin: 'https://afdindia.com', agentName: 'AFDIndiaEngine', delayMs: 1500, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
  return { reader, sleeps };
};

describe('GentleReader', () => {
  it('reads robots.txt once, waits between requests, and returns the page', async () => {
    const source = new ScriptedSource();
    const { reader, sleeps } = make(source);
    expect((await reader.read('https://afdindia.com/a')).ok).toBe(true);
    expect((await reader.read('https://afdindia.com/b')).ok).toBe(true);
    expect(source.textCalls).toEqual(['https://afdindia.com/robots.txt']);
    expect(sleeps.length).toBe(2); // robots, then page a, then page b: a pause before each request after the first
    expect(sleeps.every((ms) => ms === 1500)).toBe(true);
  });

  it('stops for good at the first 403 and sends nothing more', async () => {
    const source = new ScriptedSource();
    source.pages['https://afdindia.com/b'] = { status: 403, html: '' };
    const { reader } = make(source);
    await reader.read('https://afdindia.com/a');
    expect(await reader.read('https://afdindia.com/b')).toEqual({ ok: false, error: { kind: 'blocked', url: 'https://afdindia.com/b', status: 403 } });
    const calls = source.pageCalls.length;
    expect(await reader.read('https://afdindia.com/c')).toEqual({ ok: false, error: { kind: 'stopped' } });
    expect(source.pageCalls.length).toBe(calls);
    expect(reader.stopped?.kind).toBe('blocked');
  });

  it('treats 429 and a challenge page, even with status 200, as a block', async () => {
    for (const bad of [{ status: 429, html: '' }, { status: 200, html: '<title>Just a moment...</title>' }]) {
      const source = new ScriptedSource();
      source.pages['https://afdindia.com/x'] = bad;
      expect((await make(source).reader.read('https://afdindia.com/x')).ok).toBe(false);
    }
  });

  it('does not fetch a path robots.txt disallows', async () => {
    const source = new ScriptedSource();
    expect(await make(source).reader.read('https://afdindia.com/private/page')).toEqual({ ok: false, error: { kind: 'robots', url: 'https://afdindia.com/private/page' } });
    expect(source.pageCalls).toEqual([]);
  });

  it('stops if robots.txt itself is refused, and carries on if it is unreachable', async () => {
    const refused = new ScriptedSource();
    refused.robots = { status: 403, text: '' };
    expect((await make(refused).reader.read('https://afdindia.com/a')).ok).toBe(false);
    expect(refused.pageCalls).toEqual([]);
    const offline = new ScriptedSource();
    offline.robots = 'unreachable';
    expect((await make(offline).reader.read('https://afdindia.com/a')).ok).toBe(true);
  });
});

describe('isAllowed', () => {
  const txt = 'User-agent: *\nDisallow: /admin\nAllow: /admin/public\n\nUser-agent: BadBot\nDisallow: /';
  it('uses the longest matching rule and the right group', () => {
    expect(isAllowed(txt, 'AFDIndiaEngine', '/page/x')).toBe(true);
    expect(isAllowed(txt, 'AFDIndiaEngine', '/admin/secret')).toBe(false);
    expect(isAllowed(txt, 'AFDIndiaEngine', '/admin/public/a')).toBe(true);
    expect(isAllowed(txt, 'BadBot', '/page/x')).toBe(false);
    expect(isAllowed('User-agent: *\nDisallow:', 'AFDIndiaEngine', '/anything')).toBe(true);
    expect(isAllowed('', 'AFDIndiaEngine', '/anything')).toBe(true);
  });
});

describe('looksLikeChallenge', () => {
  it('spots bot checks but not ordinary pages', () => {
    expect(looksLikeChallenge(200, '<html>Just a moment...</html>')).toBe(true);
    expect(looksLikeChallenge(200, `<html>${'ok '.repeat(50)}</html>`)).toBe(false);
  });
});
