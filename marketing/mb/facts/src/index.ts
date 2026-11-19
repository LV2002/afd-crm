export { FactSchema, FactStatus, isUsable, type Fact } from './domain/fact.ts';
export { factIdsIn, resolveFacts, resolveFactsLive, type FactProblem } from './domain/resolve.ts';
export { FactStore, factMigrations, protectFacts } from './infrastructure/fact-store.ts';
export { loadFactSeed } from './infrastructure/load-seed.ts';
