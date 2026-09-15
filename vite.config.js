import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run build     → jediný soběstačný soubor dist/index.html (funguje offline i dvojklikem)
// npm run build:web → běžný vícesouborový build pro web (Netlify: cachovatelné assety)
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    base: './',
    plugins: web ? [] : [viteSingleFile()],
    worker: { format: 'iife' },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 6000,
      assetsInlineLimit: web ? 4096 : 100_000_000,
    },
    server: { host: '127.0.0.1' },
  };
});
