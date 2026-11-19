import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['mb/*/test/**/*.test.ts'] } });
