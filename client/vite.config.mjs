import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // OneDrive can lock large binary assets during sync; they are static and
      // do not need hot-reload watchers.
      ignored: ['**/public/characters/**/*.glb'],
    },
  },
});
