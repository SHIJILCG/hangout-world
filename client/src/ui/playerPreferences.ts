export interface PlayerPreference { blocked: boolean; muted: boolean }
export const PREFERENCE_KEY = 'hangout-player-preferences-v1';

export class PlayerPreferences {
  private entries = new Map<string, PlayerPreference>();

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private onError: (message: string) => void) {
    try {
      const raw = storage.getItem(PREFERENCE_KEY);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Invalid saved preferences');
      for (const entry of parsed.slice(-200)) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string'
          || typeof entry[1] !== 'object' || entry[1] === null
          || typeof entry[1].blocked !== 'boolean' || (entry[1].muted !== undefined && typeof entry[1].muted !== 'boolean')) {
          throw new Error('Invalid saved preference');
        }
        if (entry[1].blocked || entry[1].muted) this.entries.set(entry[0], { blocked: entry[1].blocked, muted: entry[1].muted ?? false });
      }
    } catch {
      this.entries.clear();
      onError('Saved player preferences could not be read. Blocking will work for this visit.');
    }
  }

  get(key: string): PlayerPreference {
    return { ...(this.entries.get(key) ?? { blocked: false, muted: false }) };
  }

  set(key: string, patch: Partial<PlayerPreference>): void {
    const next = { ...this.get(key), ...patch };
    this.entries.delete(key);
    if (next.blocked || next.muted) this.entries.set(key, next);
    while (this.entries.size > 200) this.entries.delete(this.entries.keys().next().value!);
    try { this.storage.setItem(PREFERENCE_KEY, JSON.stringify([...this.entries])); }
    catch { this.onError('Could not save blocking preferences. They still apply for this visit.'); }
  }
}
