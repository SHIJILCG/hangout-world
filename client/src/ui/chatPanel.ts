export const CHAT_LOG_LIMIT = 50;

export interface ChatPanel {
  readonly isOpen: boolean;
  open(): void;
  addMessage(name: string, text: string, isSelf?: boolean, senderId?: string): void;
  hideSender(senderId: string): void;
  dispose(): void;
}

const CSS = `
#chat-root { position: fixed; left: 16px; bottom: 16px; width: 340px; z-index: 7;
  font-family: system-ui, sans-serif; font-size: 14px; pointer-events: none; }
#chat-log { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column;
  gap: 2px; margin-bottom: 6px; }
.chat-line { background: rgba(32, 61, 53, 0.9); color: #fff5da; border-radius: 8px;
  padding: 6px 10px; width: fit-content; max-width: 100%; word-break: break-word; }
.chat-line.self { background: rgba(77, 108, 59, 0.9); }
.chat-line b { margin-right: 4px; }
#chat-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
  border: 1px solid #91ab88; background: rgba(32, 61, 53, 0.95);
  color: #fff5da; pointer-events: auto; }
#chat-toggle { pointer-events: auto; padding: 8px 14px; border: 1px solid #91ab88;
  border-radius: 9px; background: rgba(32, 61, 53, 0.96); color: #fff5da;
  font-weight: 650; cursor: pointer; box-shadow: 0 4px 14px #16332855; }
#chat-hint { display: inline-block; margin-left: 8px; padding: 6px 9px; border-radius: 8px;
  background: rgba(32, 61, 53, 0.82); color: #fff5da; font-size: 12px; }
#chat-input.hidden { display: none; }
`;

export function createChatPanel(onSend: (text: string) => void): ChatPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'chat-root';
  root.innerHTML = `<div id="chat-log" role="log" aria-live="polite"></div><button id="chat-toggle" type="button" aria-label="Open nearby chat">Chat</button><span id="chat-hint">Nearby chat within 18 m. Press Enter to open.</span><input id="chat-input" class="hidden" maxlength="200" aria-label="Chat message" placeholder="Message nearby players; press Enter to send" />`;
  document.body.appendChild(root);

  const log = root.querySelector<HTMLDivElement>('#chat-log')!;
  const toggle = root.querySelector<HTMLButtonElement>('#chat-toggle')!;
  const inputEl = root.querySelector<HTMLInputElement>('#chat-input')!;
  let openState = false;

  const close = () => {
    if (!openState) return;   // re-entrancy guard: blur() below re-fires the blur listener
    openState = false;
    inputEl.value = '';
    inputEl.classList.add('hidden');
    toggle.textContent = 'Chat';
    inputEl.blur();
  };
  const open = () => {
    inputEl.classList.remove('hidden');
    toggle.textContent = 'Chat open · Esc to close';
    openState = true;
    inputEl.focus();
  };

  inputEl.addEventListener('keydown', (e) => {
    e.stopPropagation();   // never let WASD/Space reach the game's window listeners
    if (e.key === 'Enter') {
      const text = inputEl.value.trim();
      if (text.length > 0) onSend(text);
      close();
    } else if (e.key === 'Escape') {
      close();
    }
  });
  inputEl.addEventListener('keyup', (e) => e.stopPropagation());
  toggle.addEventListener('click', () => { if (!openState) open(); });
  // Clicking the canvas (or anywhere else) blurs the input without going
  // through Enter/Esc — make sure that also closes the panel, so movement
  // input resumes and Enter/Esc can reopen it.
  inputEl.addEventListener('blur', () => { if (openState) close(); });

  return {
    get isOpen() { return openState; },
    open,
    addMessage(name: string, text: string, isSelf = false, senderId?: string) {
      const line = document.createElement('div');
      line.className = 'chat-line' + (isSelf ? ' self' : '');
      if (senderId) line.dataset.sender = senderId;
      const nameEl = document.createElement('b');
      nameEl.textContent = `${name}:`;       // textContent — never innerHTML for user data
      line.appendChild(nameEl);
      line.appendChild(document.createTextNode(text));
      log.appendChild(line);
      while (log.children.length > CHAT_LOG_LIMIT) log.removeChild(log.firstChild!);
      log.scrollTop = log.scrollHeight;
    },
    hideSender(senderId: string) {
      for (const line of Array.from(log.children)) {
        if (line instanceof HTMLElement && line.dataset.sender === senderId) line.remove();
      }
    },
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
