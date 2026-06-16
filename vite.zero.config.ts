
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: 'tests/minimal-speed.test.ts',
      formats: ['es'],
    },
    minify: false,
  },
});
