import { loadJsonConfig, type ConfigError, type Result } from '@mb/platform';
import { z } from 'zod';
import { FactSchema, type Fact } from '../domain/fact.ts';

export const loadFactSeed = (path: string): Result<Fact[], ConfigError> => loadJsonConfig(path, z.array(FactSchema));
