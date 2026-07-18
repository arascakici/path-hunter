import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The panel dev server proxies `/api/*` to the local dev API (scripts/dev-api.ts)
 * so the browser uses the same relative `/api/scan` path it will use on Vercel.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
