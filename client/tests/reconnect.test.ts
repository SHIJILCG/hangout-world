import { describe, it, expect, vi, afterEach } from 'vitest';
import { retryReconnect } from '../src/net/reconnect';

afterEach(() => vi.useRealTimers());

describe('reconnection', () => {
  it('retries failures and returns the restored room', async () => {
    vi.useFakeTimers();
    const connect = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('restored');
    const result = retryReconnect(connect, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBe('restored');
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('bounds retries and surfaces the last error', async () => {
    vi.useFakeTimers();
    const connect = vi.fn().mockRejectedValue(new Error('expired'));
    const result = retryReconnect(connect, new AbortController().signal, 2, 100);
    const assertion = expect(result).rejects.toThrow('expired');
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('cancels backoff when the user leaves', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const result = retryReconnect(vi.fn().mockRejectedValue(new Error('offline')), abort.signal);
    const assertion = expect(result).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(1);
    abort.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out stalled handshakes and releases a late connection', async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const release = vi.fn();
    const result = retryReconnect(() => new Promise<string>((r) => { resolve = r; }), new AbortController().signal, 1, 0, release);
    const assertion = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    resolve('late-room');
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledWith('late-room');
  });
});
