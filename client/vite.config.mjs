import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    watch: {
      // OneDrive can lock generated binaries during sync. Refresh after regenerating assets.
      ignored: ['**/public/characters/**/*.glb', '**/public/models/chunks/**/*.glb'],
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        environment: fileURLToPath(new URL('./environment-preview.html', import.meta.url)),
      },
    },
  },
});
