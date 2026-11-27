import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'tests',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
});
