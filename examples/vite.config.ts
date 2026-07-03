import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The demo consumes the SDK exactly as a publisher would (`@ezoic/vue-sdk`),
// but resolves it to the built output at the repo root rather than a published
// package. Build `dist/` first: `npm ci && npm run build` in the repo root.
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@ezoic/vue-sdk': fileURLToPath(
        new URL('../dist/index.js', import.meta.url),
      ),
    },
  },
});
