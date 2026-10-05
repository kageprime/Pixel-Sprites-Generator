import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Veilspire: multi-page during migration (Phase 1 lift-and-shift keeps the
// current pages). Phase 4 collapses to a single app entry.
export default defineConfig({
  plugins: [react()],
  // Sprites stay real files (hashed, cached) instead of base64-in-HTML.
  assetsInclude: ['**/*.png'],
  test: {
    globalSetup: './src/test/global-setup.ts',
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: 'index.html',
        // Phase 1 lift-and-shift pages (dev/preview only until cutover)
        combat: 'src/pages/combat.html',
        hollow: 'src/pages/hollow.html',
      },
    },
  },
});
