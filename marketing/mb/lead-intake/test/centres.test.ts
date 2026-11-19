import { describe, expect, it } from 'vitest';
import { CentresConfigSchema, LeadFormsConfigSchema, renderCentresBlock } from '../src/index.ts';

const forms = LeadFormsConfigSchema.parse({ endpoint: 'https://script.google.com/macros/s/ABC/exec', centres: [{ id: 'kochi', name: 'Kochi', phone: '9895484652', whatsapp: '919895484652' }, { id: 'kannur', name: 'Kannur', phone: '9895484651', whatsapp: '919895484651' }], primaryCentreId: 'kochi', exams: ['NIFT'] });
const EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1!2d76.3!3d10.0';
const blank = { streetAddress: '', locality: '', postalCode: '', mapsUrl: '', mapEmbedUrl: '', reviewsUrl: '', openingHours: '' };
const profiles = (over: object = {}) => CentresConfigSchema.parse({ centres: [{ id: 'kochi', ...blank, streetAddress: 'MI Arcade, Edappally', locality: 'Kochi', postalCode: '682024', mapsUrl: 'https://maps.app.goo.gl/abc', mapEmbedUrl: EMBED, reviewsUrl: 'https://g.page/r/xyz/review', openingHours: 'Tue to Sun 10 am to 7 pm', ...over }, { id: 'kannur', ...blank }] });

describe('centre place details', () => {
  it('accepts Google links, Google\'s embed address and empty fields', () => {
    expect(CentresConfigSchema.safeParse({ centres: [{ id: 'kochi', ...blank }] }).success).toBe(true);
    expect(profiles().centres[0]?.mapEmbedUrl).toBe(EMBED);
  });

  it('refuses a map embed that is not Google\'s, a Maps link that is somewhere else, and a bad postal code', () => {
    expect(CentresConfigSchema.safeParse({ centres: [{ id: 'kochi', ...blank, mapEmbedUrl: 'https://evil.example/frame' }] }).success).toBe(false);
    expect(CentresConfigSchema.safeParse({ centres: [{ id: 'kochi', ...blank, mapEmbedUrl: 'https://www.google.com.evil.example/maps/embed?x' }] }).success).toBe(false);
    expect(CentresConfigSchema.safeParse({ centres: [{ id: 'kochi', ...blank, mapsUrl: 'https://example.com/maps' }] }).success).toBe(false);
    expect(CentresConfigSchema.safeParse({ centres: [{ id: 'kochi', ...blank, postalCode: '68' }] }).success).toBe(false);
  });
});

describe('renderCentresBlock', () => {
  it('shows a centre\'s address, hours, call, WhatsApp, Maps, reviews and a lazy map frame', () => {
    const html = renderCentresBlock(profiles(), forms);
    expect(html).toContain('MI Arcade, Edappally, Kochi, 682024');
    expect(html).toContain('Tue to Sun 10 am to 7 pm');
    expect(html).toContain('href="tel:9895484652"');
    expect(html).toContain('href="https://wa.me/919895484652"');
    expect(html).toContain('href="https://maps.app.goo.gl/abc" rel="noopener">Open in Google Maps');
    expect(html).toContain('Read reviews');
    expect(html).toMatch(/<iframe class="ap-map" src="https:\/\/www\.google\.com\/maps\/embed\?pb=!1m18[^"]*" title="AFD India Kochi on Google Maps" loading="lazy"/);
  });

  it('leaves out a centre with no place details, and everything when none has any', () => {
    expect(renderCentresBlock(profiles(), forms)).not.toContain('Kannur');
    expect(renderCentresBlock(CentresConfigSchema.parse({ centres: [{ id: 'kochi', ...blank }, { id: 'kannur', ...blank }] }), forms)).toBe('');
  });

  it('puts the nearest centre first when asked, and leaves out any field that is empty', () => {
    const both = CentresConfigSchema.parse({ centres: [{ id: 'kochi', ...blank, mapsUrl: 'https://maps.app.goo.gl/a' }, { id: 'kannur', ...blank, mapsUrl: 'https://maps.app.goo.gl/b' }] });
    const html = renderCentresBlock(both, forms, ['Kannur', 'Kochi']);
    expect(html.indexOf('Kannur')).toBeLessThan(html.indexOf('Kochi'));
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('Read reviews');
  });

  it('escapes text from the settings file', () => {
    expect(renderCentresBlock(profiles({ streetAddress: '<img src=x onerror=alert(1)>' }), forms)).not.toContain('<img src=x');
  });
});
