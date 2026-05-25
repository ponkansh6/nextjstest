import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(baseConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.{ui.test.tsx,ui.test.ts}'],
    setupFiles: ['./tests/setup.ts'],
  },
}));
