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
    expect(restored.get('room:alice')).toEqual({ blocked: true });
    expect(restored.get('room:bob')).toEqual({ blocked: true });
    expect(restored.get('other:alice')).toEqual({ blocked: false });
  });

  it('preserves legacy blocks and discards obsolete voice-mute preferences', () => {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify([
      ['room:alice', { muted: true, blocked: false }],
      ['room:bob', { muted: true, blocked: true }],
    ]));
    const error = vi.fn();
    const preferences = new PlayerPreferences(localStorage, error);
    expect(preferences.get('room:alice')).toEqual({ blocked: false });
    expect(preferences.get('room:bob')).toEqual({ blocked: true });
    expect(error).not.toHaveBeenCalled();
    preferences.set('room:carol', { blocked: true });
    expect(JSON.parse(localStorage.getItem(PREFERENCE_KEY)!)).toEqual([
      ['room:bob', { blocked: true }],
      ['room:carol', { blocked: true }],
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

  it('renders player names safely with only a block/unblock control', () => {
    const changed = vi.fn();
    const roster = createRoster('room', 'self', changed);
    roster.add('self', 'Alice');
    roster.add('bob', '<img src=x onerror=alert(1)>');
    expect(document.querySelector('#roster img')).toBeNull();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#roster button'));
    expect(buttons).toHaveLength(1);
    buttons.find((button) => button.textContent === 'Block')!.click();
    expect(roster.isBlocked('bob')).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    document.querySelector<HTMLButtonElement>('#roster button')!.click();
    expect(roster.isBlocked('bob')).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    roster.dispose();
  });
});
