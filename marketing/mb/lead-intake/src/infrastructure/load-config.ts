import { BrandThemeSchema, DEFAULT_BRAND, type BrandTheme } from '../domain/brand.ts';
import { loadJsonConfig, type ConfigError, type Result } from '@mb/platform';
import { LeadFormsConfigSchema, type LeadFormsConfig } from '../domain/config.ts';

export const loadBrand = (path: string): BrandTheme => { const r = loadJsonConfig(path, BrandThemeSchema); return r.ok ? r.value : DEFAULT_BRAND; };
export const loadLeadFormsConfig = (path: string): Result<LeadFormsConfig, ConfigError> => loadJsonConfig(path, LeadFormsConfigSchema);
