import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  FakeClock, createLogger, formatIst, parseConfig, parseUtc, redact, renderLaunchdPlist,
} from '../src/index.ts';

describe('time', () => {
  it('shows India time for a UTC instant', () => {
    expect(formatIst(new Date('2026-10-14T00:00:00Z'))).toMatch(/14 Oct 2026.*5:30/);
  });

  it('refuses a timestamp without a zone', () => {
    expect(parseUtc('2026-10-14T10:00:00').ok).toBe(false);
    expect(parseUtc('2026-10-14T10:00:00Z').ok).toBe(true);
    expect(parseUtc('2026-13-99T10:00:00Z').ok).toBe(false);
  });
});

describe('parseConfig', () => {
  const schema = z.object({ phone: z.string().min(10) });

  it('returns the typed value', () => {
    expect(parseConfig(schema, { phone: '9895484652' }, 'kochi.json')).toEqual({ ok: true, value: { phone: '9895484652' } });
  });

  it('returns readable issues instead of throwing', () => {
    const result = parseConfig(schema, { phone: '1' }, 'kochi.json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues[0]).toContain('phone');
  });
});

describe('redact and logger', () => {
  it('removes known secrets and token shapes', () => {
    const text = 'key=abcdef123456 header Bearer abc.def.ghi and EAAB1234567890123456789';
    const out = redact(text, ['abcdef123456']);
    expect(out).not.toContain('abcdef123456');
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('EAAB1234567890123456789');
  });

  it('never writes a secret, timestamped by the injected clock', () => {
    const lines: string[] = [];
    const log = createLogger({ clock: new FakeClock('2026-10-14T00:00:00Z'), write: (l) => lines.push(l), secrets: ['hunter2hunter2'] });
    log.error('login failed for hunter2hunter2', { token: 'hunter2hunter2' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('hunter2hunter2');
    expect(lines[0]).toContain('2026-10-14T00:00:00.000Z');
  });
});

describe('launchd plist', () => {
  it('escapes arguments and sets the interval', () => {
    const plist = renderLaunchdPlist({ label: 'in.afd.jobs', programArguments: ['node', 'a&b.ts'], intervalSeconds: 60, logPath: '/tmp/x.log' });
    expect(plist).toContain('<string>a&amp;b.ts</string>');
    expect(plist).toContain('<integer>60</integer>');
  });
});
