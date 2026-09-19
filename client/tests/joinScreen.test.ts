// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showJoinScreen } from '../src/ui/joinScreen';

function el<T extends HTMLElement>(sel: string): T {
  const found = document.querySelector<T>(sel);
  if (!found) throw new Error(`missing ${sel}`);
  return found;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('showJoinScreen', () => {
  it('renders name input, 6 swatches, and a join button', () => {
    showJoinScreen(async () => {});
    expect(el('#join-screen')).toBeTruthy();
    expect(el('#join-name')).toBeTruthy();
    expect(document.querySelectorAll('.join-swatch').length).toBe(6);
    expect(el('#join-btn')).toBeTruthy();
  });

  it('selecting a swatch marks it selected', () => {
    showJoinScreen(async () => {});
    const swatches = document.querySelectorAll<HTMLButtonElement>('.join-swatch');
    swatches[4].click();
    expect(swatches[4].classList.contains('selected')).toBe(true);
    expect(swatches[0].classList.contains('selected')).toBe(false);
  });

  it('calls onJoin with trimmed name and selected color, then removes the overlay', async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    showJoinScreen(onJoin);
    el<HTMLInputElement>('#join-name').value = '  Alice ';
    document.querySelectorAll<HTMLButtonElement>('.join-swatch')[2].click();
    el<HTMLButtonElement>('#join-btn').click();
    await vi.waitFor(() => expect(onJoin).toHaveBeenCalledWith('Alice', 2));
    await vi.waitFor(() => expect(document.querySelector('#join-screen')).toBeNull());
  });

  it('does not call onJoin for an empty or too-short name', () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    showJoinScreen(onJoin);
    el<HTMLInputElement>('#join-name').value = ' a ';
    el<HTMLButtonElement>('#join-btn').click();
    expect(onJoin).not.toHaveBeenCalled();
    expect(el('#join-error').textContent).not.toBe('');
  });

  it('shows an error and keeps the overlay when onJoin rejects', async () => {
    const onJoin = vi.fn().mockRejectedValue(new Error('server down'));
    showJoinScreen(onJoin);
    el<HTMLInputElement>('#join-name').value = 'Alice';
    el<HTMLButtonElement>('#join-btn').click();
    await vi.waitFor(() => expect(el('#join-error').textContent).toContain('server down'));
    expect(document.querySelector('#join-screen')).toBeTruthy();
    expect(el<HTMLButtonElement>('#join-btn').disabled).toBe(false); // can retry
  });

  it('prevents double-submit via re-entrancy guard on Enter key during pending join', async () => {
    let resolve: () => void;
    const onJoin = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    showJoinScreen(onJoin);
    el<HTMLInputElement>('#join-name').value = 'Alice';
    el<HTMLButtonElement>('#join-btn').click();
    // Wait for onJoin to be called once
    await vi.waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
    // Dispatch two Enter keydown events while the promise is pending
    const nameInput = el<HTMLInputElement>('#join-name');
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    // onJoin should still have been called exactly once (not twice)
    expect(onJoin).toHaveBeenCalledTimes(1);
    // Resolve the promise and verify overlay is removed
    resolve!();
    await vi.waitFor(() => expect(document.querySelector('#join-screen')).toBeNull());
  });
});
