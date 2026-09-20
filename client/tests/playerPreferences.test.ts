// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerPreferences, PREFERENCE_KEY } from '../src/ui/playerPreferences';
import { createRoster } from '../src/ui/roster';

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('player text blocking', () => {
  it('persists preferences by room and player identity, not nickname', () => {
    const preferences = new PlayerPreferences(localStorage, vi.fn());
    preferences.set('room:alice', { blocked: true });
    preferences.set('room:bob', { blocked: true });
    const restored = new PlayerPreferences(localStorage, vi.fn());
    expect(restored.get('room:alice')).toEqual({ blocked: true, muted: false });
    expect(restored.get('room:bob')).toEqual({ blocked: true, muted: false });
    expect(restored.get('other:alice')).toEqual({ blocked: false, muted: false });
  });

  it('preserves existing block and mute preferences', () => {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify([
      ['room:alice', { muted: true, blocked: false }],
      ['room:bob', { muted: true, blocked: true }],
    ]));
    const error = vi.fn();
    const preferences = new PlayerPreferences(localStorage, error);
    expect(preferences.get('room:alice')).toEqual({ blocked: false, muted: true });
    expect(preferences.get('room:bob')).toEqual({ blocked: true, muted: true });
    expect(error).not.toHaveBeenCalled();
    preferences.set('room:carol', { blocked: true });
    expect(JSON.parse(localStorage.getItem(PREFERENCE_KEY)!)).toEqual([
      ['room:alice', { blocked: false, muted: true }],
      ['room:bob', { blocked: true, muted: true }],
      ['room:carol', { blocked: true, muted: false }],
    ]);
  });

  it('reports failed storage but retains this visit’s choice', () => {
    const error = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const preferences = new PlayerPreferences(storage, error);
    preferences.set('room:alice', { blocked: true });
    expect(preferences.get('room:alice').blocked).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('still apply'));
  });

  it('reports corrupt saved data and bounds old entries', () => {
    localStorage.setItem(PREFERENCE_KEY, '{broken');
    const error = vi.fn();
    const preferences = new PlayerPreferences(localStorage, error);
    expect(error).toHaveBeenCalled();
    for (let i = 0; i < 210; i++) preferences.set(`r:${i}`, { blocked: true });
    expect(JSON.parse(localStorage.getItem(PREFERENCE_KEY)!).length).toBe(200);
  });

  it('renders player names safely with block and voice-mute controls', () => {
    const changed = vi.fn();
    const roster = createRoster('room', 'self', changed);
    roster.add('self', 'Alice');
    roster.add('bob', '<img src=x onerror=alert(1)>');
    expect(document.querySelector('#roster img')).toBeNull();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#roster button'));
    expect(buttons).toHaveLength(2);
    buttons.find((button) => button.textContent === 'Block')!.click();
    expect(roster.isBlocked('bob')).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    buttons.find((button) => button.textContent === 'Mute voice')!.click();
    expect(roster.isMuted('bob')).toBe(true);
    Array.from(document.querySelectorAll<HTMLButtonElement>('#roster button'))
      .find((button) => button.textContent === 'Unblock')!.click();
    expect(roster.isBlocked('bob')).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    roster.dispose();
  });
});
