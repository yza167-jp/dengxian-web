import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/{client,game,server}/**/*.test.ts'],
  },
});
