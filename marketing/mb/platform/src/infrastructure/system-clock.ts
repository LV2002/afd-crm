import type { Clock } from '../domain/clock.ts';

export const systemClock: Clock = { now: () => new Date() };
