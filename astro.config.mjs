import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alexstygler.github.io',
  base: '/AI-academy',
  output: 'static',
  outDir: process.env.ACADEMY_BUILD_DIR || 'dist',
  trailingSlash: 'always',
  server: { host: true },
});
