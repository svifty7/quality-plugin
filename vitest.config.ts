import { defineConfig } from 'vitest/config';

import { quality } from './src/index.ts';

export default defineConfig({
  plugins: [quality()],
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
    },
  },
});
