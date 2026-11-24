import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build ke folder "public" supaya server.js dan Vercel bisa langsung menyajikannya.
// Folder "static" dipakai sebagai publicDir agar tidak bentrok dengan outDir.
export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
  build: { outDir: 'public', emptyOutDir: true },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/browser': { target: 'ws://localhost:3000', ws: true },
      '/esp': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
