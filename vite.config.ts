import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/thanksgiving-seating-tracker/',
  plugins: [
    react(),
    {
      // Strict CSP in production (no inline styles are used); dev server needs inline styles for HMR.
      name: 'csp-style-src',
      transformIndexHtml(html, ctx) {
        return html.replace('__STYLE_SRC__', ctx.bundle ? "'self'" : "'self' 'unsafe-inline'");
      },
    },
  ],
  build: { sourcemap: false, target: 'es2022' },
  test: { include: ['tests/**/*.test.{ts,tsx}'], testTimeout: 60000 },
});
