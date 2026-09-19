// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createChatPanel, CHAT_LOG_LIMIT } from '../src/ui/chatPanel';

function input(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('#chat-input')!;
}
function key(el: EventTarget, keyName: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true }));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('createChatPanel', () => {
  it('starts closed and opens on open()', () => {
    const panel = createChatPanel(() => {});
    expect(panel.isOpen).toBe(false);
    panel.open();
    expect(panel.isOpen).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('Enter sends the trimmed text, clears, and closes', () => {
    const onSend = vi.fn();
    const panel = createChatPanel(onSend);
    panel.open();
    input().value = '  hello world  ';
    key(input(), 'Enter');
    expect(onSend).toHaveBeenCalledWith('hello world');
    expect(input().value).toBe('');
    expect(panel.isOpen).toBe(false);
  });

  it('Enter on empty input closes without sending', () => {
    const onSend = vi.fn();
    const panel = createChatPanel(onSend);
    panel.open();
    input().value = '   ';
    key(input(), 'Enter');
    expect(onSend).not.toHaveBeenCalled();
    expect(panel.isOpen).toBe(false);
  });

  it('Escape closes without sending and clears the draft', () => {
    const onSend = vi.fn();
    const panel = createChatPanel(onSend);
    panel.open();
    input().value = 'draft';
    key(input(), 'Escape');
    expect(onSend).not.toHaveBeenCalled();
    expect(panel.isOpen).toBe(false);
    expect(input().value).toBe('');
  });

  it('movement keys typed in the input never reach window listeners', () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    const panel = createChatPanel(() => {});
    panel.open();
    key(input(), 'w');
    key(input(), ' ');
    window.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });

  it('renders messages and marks own lines', () => {
    const panel = createChatPanel(() => {});
    panel.addMessage('Alice', 'hi', false);
    panel.addMessage('Me', 'yo', true);
    const lines = document.querySelectorAll('.chat-line');
    expect(lines.length).toBe(2);
    expect(lines[0].textContent).toContain('Alice');
    expect(lines[0].textContent).toContain('hi');
    expect(lines[1].classList.contains('self')).toBe(true);
  });

  it('caps the log at CHAT_LOG_LIMIT lines, dropping the oldest', () => {
    const panel = createChatPanel(() => {});
    for (let i = 0; i < CHAT_LOG_LIMIT + 5; i++) panel.addMessage('N', `m${i}`);
    const lines = document.querySelectorAll('.chat-line');
    expect(lines.length).toBe(CHAT_LOG_LIMIT);
    expect(lines[0].textContent).toContain('m5');   // 0..4 dropped
  });

  it('renders message text as text, not HTML', () => {
    const panel = createChatPanel(() => {});
    panel.addMessage('Eve', '<img src=x onerror=alert(1)>');
    expect(document.querySelector('#chat-log img')).toBeNull();
    expect(document.querySelector('.chat-line')!.textContent).toContain('<img');
  });
});
