import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Colyseus's `listen()` calls `process.send('ready')` when `process.send`
    // is a function (a signal meant for process managers like pm2). Vitest's
    // default "forks" pool runs tests in a child process with a live IPC
    // channel, so `process.send` exists there too — and Vitest's own worker
    // protocol chokes trying to interpret that unrelated "ready" message.
    // The "threads" pool has no `process.send`, avoiding the collision.
    pool: 'threads',
  },
});
