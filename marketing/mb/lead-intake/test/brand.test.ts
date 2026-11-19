import { describe, expect, it } from 'vitest';
import { BrandThemeSchema, DEFAULT_BRAND, FORM_CSS, formScriptTag } from '../src/index.ts';

describe('brand theme', () => {
  it('defaults to bold red, black, white and a dull green', () => {
    expect(DEFAULT_BRAND).toEqual({ primary: '#C8102E', ink: '#111111', surface: '#FFFFFF', accent: '#6F7B52' });
  });

  it('rejects colours that are not six digit hex', () => {
    expect(BrandThemeSchema.safeParse({ primary: 'red' }).success).toBe(false);
  });

  it('puts the theme on the footer script tag as variables', () => {
    const tag = formScriptTag('https://x.test/e', { ...DEFAULT_BRAND, primary: '#AA0000' });
    expect(tag).toContain('data-afd-theme="--b-primary:#AA0000;');
  });

  it('leaves the theme attribute off when none is given', () => {
    expect(formScriptTag('https://x.test/e').split('>')[0]).not.toContain('data-afd-theme');
  });

  it('styles the button big and bold from the theme variables', () => {
    expect(FORM_CSS).toContain('var(--b-primary)');
    expect(FORM_CSS).toContain('text-transform:uppercase');
  });
});
