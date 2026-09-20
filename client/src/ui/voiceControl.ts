export interface VoiceControl {
  setEnabled(enabled: boolean): void;
  setMuted(muted: boolean): void;
  setIncoming(enabled: boolean): void;
  setStatus(status: string): void;
  dispose(): void;
}

export function createVoiceControl(actions: {
  enable: () => void; disable: () => void; toggleMute: () => void; toggleIncoming: () => void;
}): VoiceControl {
  const root = document.createElement('aside');
  root.id = 'voice-control';
  root.innerHTML = '<strong>Voice off</strong><small>Microphone is off</small><div><button type="button">Enable voice</button><button type="button" disabled>Mute</button><button type="button">Incoming: on</button></div>';
  const title = root.querySelector('strong')!;
  const status = root.querySelector('small')!;
  const [enable, mute, incoming] = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  let enabled = false;
  enable.addEventListener('click', () => enabled ? actions.disable() : actions.enable());
  mute.addEventListener('click', actions.toggleMute);
  incoming.addEventListener('click', actions.toggleIncoming);
  document.body.append(root);
  return {
    setEnabled(next) { enabled = next; enable.textContent = next ? 'Disable voice' : 'Enable voice'; mute.disabled = !next; title.textContent = next ? 'Voice on' : 'Voice off'; },
    setMuted(muted) { mute.textContent = muted ? 'Unmute' : 'Mute'; },
    setIncoming(next) { incoming.textContent = `Incoming: ${next ? 'on' : 'off'}`; },
    setStatus(message) { status.textContent = message; },
    dispose() { root.remove(); },
  };
}
