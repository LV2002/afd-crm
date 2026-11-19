import { loadJsonConfig, type ConfigError, type Result } from '@mb/platform';
import { CopyRulesSchema, type CopyRules } from '../domain/rules.ts';

export const loadCopyRules = (path: string): Result<CopyRules, ConfigError> => loadJsonConfig(path, CopyRulesSchema);
