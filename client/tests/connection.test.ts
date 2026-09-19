// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { serverUrl } from '../src/net/connection';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('serverUrl', () => {
  it('uses VITE_SERVER_URL verbatim when configured (deployed builds)', () => {
    vi.stubEnv('VITE_SERVER_URL', 'wss://hangout-world-server.onrender.com');
    expect(serverUrl()).toBe('wss://hangout-world-server.onrender.com');
  });

  it('falls back to ws://<hostname>:2567 for local/LAN dev', () => {
    expect(serverUrl()).toMatch(/^ws:\/\/[^/]+:2567$/);
  });
});
