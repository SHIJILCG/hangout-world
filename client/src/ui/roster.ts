import { PlayerPreferences } from './playerPreferences';

export function createRoster(roomId: string, selfId: string, onChange: () => void, onMuteChange: (id: string, muted: boolean) => void = () => {}) {
  const root = document.createElement('details');
  root.id = 'roster';
  root.innerHTML = '<summary>Players nearby</summary><p role="status"></p><div id="roster-list"></div>';
  const status = root.querySelector('p')!;
  const list = root.querySelector('div')!;
  // Access to localStorage itself can throw in privacy-restricted browsers.
  const storage = {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  };
  const preferences = new PlayerPreferences(storage, (message) => { status.textContent = message; });
  const players = new Map<string, string>();
  const key = (id: string) => `${roomId}:${id}`;
  const render = () => {
    root.querySelector('summary')!.textContent = `Players (${players.size})`;
    list.replaceChildren();
    for (const [id, name] of players) {
      const row = document.createElement('div');
      row.className = 'player-row';
      const label = document.createElement('span');
      label.textContent = name + (id === selfId ? ' (you)' : '');
      row.append(label);
      if (id !== selfId) {
        const value = preferences.get(key(id));
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = value.blocked ? 'Unblock' : 'Block';
        button.setAttribute('aria-label', `${button.textContent} ${name}`);
        button.setAttribute('aria-pressed', String(value.blocked));
        button.title = 'Hide this player’s messages and chat bubbles';
        button.addEventListener('click', () => {
          preferences.set(key(id), { blocked: !value.blocked });
          render();
          onChange();
        });
        row.append(button);
        const mute = document.createElement('button');
        mute.type = 'button';
        mute.textContent = value.muted ? 'Unmute voice' : 'Mute voice';
        mute.setAttribute('aria-pressed', String(value.muted));
        mute.addEventListener('click', () => {
          const muted = !value.muted;
          preferences.set(key(id), { muted });
          onMuteChange(id, muted);
          render();
        });
        row.append(mute);
      }
      list.append(row);
    }
  };
  root.addEventListener('keydown', (event) => event.stopPropagation());
  root.addEventListener('keyup', (event) => event.stopPropagation());
  document.body.append(root);
  render();
  return {
    add(id: string, name: string) { players.set(id, name); render(); },
    remove(id: string) { players.delete(id); render(); },
    clear() { players.clear(); render(); },
    isBlocked(id: string) { return preferences.get(key(id)).blocked; },
    isMuted(id: string) { return preferences.get(key(id)).muted; },
    dispose() { root.remove(); },
  };
}
