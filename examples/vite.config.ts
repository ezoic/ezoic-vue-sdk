import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The demo consumes the SDK exactly as a publisher would (`@ezoic/vue-sdk`),
// but resolves it to the built output at the repo root rather than a published
// package. Build `dist/` first: `npm ci && npm run build` in the repo root.
//
// `viteSingleFile` inlines all JS and CSS into a single `dist/index.html` with
// no external assets — the artifact used as the standalone live demo page.
export default defineConfig({
  base: './',
  plugins: [vue(), viteSingleFile()],
  resolve: {
    alias: {
      '@ezoic/vue-sdk': fileURLToPath(
        new URL('../dist/index.js', import.meta.url),
      ),
    },
  },
});
