# Hangout World — Phase 3: Text Chat + Movement-Budget Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players chat via a toggleable panel (Enter to type) with messages appearing as speech bubbles above avatars; plus the parked movement fix so avatars no longer rubber-band in others' views after a client lag spike.

**Architecture:** Chat rides the existing Colyseus room: client sends `chat {text}`, the server sanitizes, rate-limits per player (token bucket), and broadcasts `chat {id, text}`; clients resolve the display name from room state by sessionId (payload names are never trusted). The chat panel is a DOM module tested under happy-dom; bubbles are canvas-texture sprites like name tags. The movement fix replaces the per-message wall-clock step cap with a distance token bucket, which tolerates legitimate catch-up bursts while hard-capping sustained speed at MAX_SPEED.

**Tech Stack:** unchanged (Colyseus 0.16 server, TypeScript + Vite + Three.js client, Vitest).

**Spec:** `docs/superpowers/specs/2026-09-19-hangout-world-design.md` (build phase 3: "Text chat: panel + chat bubbles, rate limiting"; error-handling and safety sections)

## Global Constraints

- All code is TypeScript with `"strict": true` (both packages).
- Wire contract: client → server `room.send('chat', { text })`; server → all clients `broadcast('chat', { id: <senderSessionId>, text })`. Clients look up the sender's name from `room.state.players` by id.
- Chat rules (server-enforced): max 200 chars (trimmed, then sliced), empty/garbage dropped silently, per-player token bucket of 3 messages refilling 1 per second — excess messages are silently dropped.
- Movement budget (server): per-player distance budget in metres, starts at and caps at `MOVE_BUDGET_CAP = 3`; accrues `MAX_SPEED (10) × elapsed seconds` per incoming move; the allowed step for a message is `min(budget, MOVE_BUDGET_CAP)`; the horizontal distance actually applied is spent from the budget. Vertical |Δy| per message is capped by the same allowed step. This replaces the Phase 2 `lastMoveAt`/`MAX_SPEED/30`-floor logic entirely (delete it) and closes both parked findings (catch-up clipping and flood-scales-with-message-count).
- Client chat UX: **Enter** opens the input (when closed) and sends+closes (when open); **Esc** closes without sending; while the input is open, the avatar must not move (game loop uses neutral input AND the input swallows key events so `KeyboardInput` never sees them).
- Chat panel: bottom-left, log keeps the newest 50 messages, oldest removed from the DOM.
- Bubbles: latest message only per player, shown ~5 s above the name tag, text truncated to 80 chars for display; bubble sprite resources (texture/material) are disposed on removal.
- Existing interfaces must not break: `PlayerState` schema unchanged; `validateMove(current, target, maxStep?)` keeps its signature.
- Commits: plain messages, NO Co-Authored-By trailers (owner's explicit preference).

## File Structure

```
server/src/
  constants.ts        — MODIFIED: + MOVE_BUDGET_CAP, CHAT_MAX_LENGTH, CHAT_BURST, CHAT_REFILL_MS
  validation.ts       — MODIFIED: + sanitizeChat(raw): string | null
  WorldRoom.ts        — MODIFIED: token-bucket movement; chat handler with rate bucket
server/tests/
  validation.test.ts  — MODIFIED: + sanitizeChat cases
  worldRoom.test.ts   — MODIFIED: budget tests replace rate tests; + chat relay/rate tests
client/src/
  ui/chatPanel.ts     — NEW: DOM chat panel (log + input + focus contract)
  player/chatBubble.ts— NEW: canvas-sprite speech bubble with timed disposal
  net/remotePlayers.ts— MODIFIED: + getRoot(sessionId)
  main.ts             — MODIFIED: chat wiring + input gating
client/tests/
  chatPanel.test.ts   — NEW (happy-dom)
```

---

### Task 1: Server movement token bucket (replaces the Phase 2 rate cap)

**Files:**
- Modify: `server/src/constants.ts`
- Modify: `server/src/WorldRoom.ts`
- Modify: `server/tests/worldRoom.test.ts`

**Interfaces:**
- Consumes: `validateMove(current, target, maxStep)` (unchanged signature).
- Produces: per-player movement governed by a distance budget. Behavior later tasks and clients rely on: a fresh player can immediately move up to 3 m in one message; a legit 15 Hz runner (0.533 m/msg) is never clamped, including catch-up bursts of several messages arriving in the same wall-clock instant; sustained flood speed is hard-capped at MAX_SPEED regardless of message rate.

- [ ] **Step 1: Add the constant**

In `server/src/constants.ts`, under the server-only tuning section, add:

```ts
export const MOVE_BUDGET_CAP = 3;  // metres of instantly-spendable movement (covers catch-up bursts)
```

- [ ] **Step 2: Update the room tests (RED)**

In `server/tests/worldRoom.test.ts`:

(a) REPLACE the test previously named around "rate-limited first-message step" (which expects a ≈0.667 m first-message cap) with:

```ts
  it('clamps a huge teleport to the budget cap', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: SPAWN.x + 30, y: 0, z: SPAWN.z, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(SPAWN.x + 3, 4);   // MOVE_BUDGET_CAP
  });
```

(b) ADD a burst-tolerance test (this is the parked-bug regression test — it MUST fail against the old wall-clock logic, where messages 2–4 would be clamped to ~0.33 m):

```ts
  it('applies a legit catch-up burst in full (no clamping)', async () => {
    // After a client frame hitch, several 15 Hz move messages arrive in the
    // same wall-clock instant, each a legit ≤0.533 m run step. Total 2.132 m
    // fits the 3 m budget, so every step must apply exactly.
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    const step = 0.533;
    for (let i = 1; i <= 4; i++) {
      client.send('move', { x: SPAWN.x + step * i, y: 0, z: SPAWN.z, heading: 0 });
    }
    for (let i = 0; i < 4; i++) await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(SPAWN.x + step * 4, 3);
  });
```

(c) ADD a sustained-flood cap test:

```ts
  it('caps a sustained flood at roughly the budget, not message count', async () => {
    // 40 instant messages each demanding +1.5 m (60 m total). Budget: 3 m
    // initial + ~zero accrual during a sub-second flood ⇒ total applied ≈ 3 m.
    // Bound is generous (< 5) to absorb a few ms of real accrual.
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    let target = SPAWN.x;
    for (let i = 0; i < 40; i++) {
      target += 1.5;
      client.send('move', { x: target, y: 0, z: SPAWN.z, heading: 0 });
    }
    for (let i = 0; i < 40; i++) await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x - SPAWN.x).toBeLessThan(5);
  });
```

(d) Check the existing "applies a valid move message" and "tracks two players independently" tests — their small displacements (≤0.5 m) fit the new budget; they should need no changes. If any other test encoded the old ≈0.667 first-message cap, recalibrate it to the new semantics and say so in your report.

Run: `npx vitest run tests/worldRoom.test.ts`
Expected: the two NEW tests fail against current logic (burst test clamps, teleport test clamps to ≈0.667 not 3); note which assertions fail as RED evidence.

- [ ] **Step 3: Implement the token bucket**

In `server/src/WorldRoom.ts`, replace the `lastMoveAt` mechanism entirely:

```ts
import { SPAWN, MAX_CLIENTS, RECONNECT_GRACE_SECONDS, MAX_SPEED, MOVE_BUDGET_CAP } from './constants';
```

Replace the per-player tracking and the 'move' handler body:

```ts
  // Distance token bucket per player: tolerates legit catch-up bursts while
  // hard-capping sustained speed at MAX_SPEED regardless of message rate.
  private moveBudget = new Map<string, { budget: number; lastAt: number }>();
```

In `onCreate()`'s `'move'` handler:

```ts
    this.onMessage('move', (client, message: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      const now = Date.now();
      const entry = this.moveBudget.get(client.sessionId) ?? { budget: MOVE_BUDGET_CAP, lastAt: now };
      entry.budget = Math.min(
        MOVE_BUDGET_CAP,
        entry.budget + (MAX_SPEED * (now - entry.lastAt)) / 1000
      );
      entry.lastAt = now;

      const current = { x: p.x, y: p.y, z: p.z, heading: p.heading };
      const next = validateMove(current, message, entry.budget);
      entry.budget -= Math.hypot(next.x - current.x, next.z - current.z);
      this.moveBudget.set(client.sessionId, entry);

      p.x = next.x;
      p.y = next.y;
      p.z = next.z;
      p.heading = next.heading;
    });
```

In `onJoin`, seed a fresh entry: `this.moveBudget.set(client.sessionId, { budget: MOVE_BUDGET_CAP, lastAt: Date.now() });`
In `onLeave`'s removal path (where the player is deleted from state), also `this.moveBudget.delete(client.sessionId);`
Delete the old `lastMoveAt` map and its `MAX_SPEED/30`-floor computation.

- [ ] **Step 4: Run the room tests to green, then both gates**

Run: `npx vitest run tests/worldRoom.test.ts` — all pass, including the two new tests.
Then: `npm test && npm run build` (from `server/`).

- [ ] **Step 5: Commit**

```bash
git add server/src server/tests
git commit -m "fix: replace move rate cap with distance token bucket (no more legit-burst clamping)"
```

### Task 2: Server chat relay with rate limiting

**Files:**
- Modify: `server/src/constants.ts`
- Modify: `server/src/validation.ts`
- Modify: `server/src/WorldRoom.ts`
- Modify: `server/tests/validation.test.ts`
- Modify: `server/tests/worldRoom.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (clients rely on this verbatim):
  - incoming: `'chat'` message `{ text: string }`
  - outgoing broadcast: `'chat'` with `{ id: string /* sender sessionId */, text: string }`
  - `sanitizeChat(raw: unknown): string | null` — trimmed, sliced to CHAT_MAX_LENGTH, `null` for empty/non-string.
  - Rate: token bucket per player, CHAT_BURST = 3 tokens, +1 token per CHAT_REFILL_MS = 1000; no token → message silently dropped.

- [ ] **Step 1: Add constants**

In `server/src/constants.ts`:

```ts
export const CHAT_MAX_LENGTH = 200;  // chars per message after trim
export const CHAT_BURST = 3;         // instant messages before throttling
export const CHAT_REFILL_MS = 1000;  // one token back per second
```

- [ ] **Step 2: Write the failing validation tests**

Append to `server/tests/validation.test.ts` (import `sanitizeChat` and `CHAT_MAX_LENGTH`):

```ts
describe('sanitizeChat', () => {
  it('passes a normal message through trimmed', () => {
    expect(sanitizeChat('  hello there  ')).toBe('hello there');
  });
  it('slices to CHAT_MAX_LENGTH', () => {
    const long = 'x'.repeat(CHAT_MAX_LENGTH + 50);
    expect(sanitizeChat(long)).toHaveLength(CHAT_MAX_LENGTH);
  });
  it('rejects empty and non-string input', () => {
    expect(sanitizeChat('')).toBeNull();
    expect(sanitizeChat('   ')).toBeNull();
    expect(sanitizeChat(undefined)).toBeNull();
    expect(sanitizeChat(7)).toBeNull();
    expect(sanitizeChat({ text: 'hi' })).toBeNull();
  });
});
```

Run: `npx vitest run tests/validation.test.ts` — new cases FAIL (sanitizeChat missing).

- [ ] **Step 3: Implement sanitizeChat**

In `server/src/validation.ts` (import CHAT_MAX_LENGTH):

```ts
export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().slice(0, CHAT_MAX_LENGTH);
  return text.length > 0 ? text : null;
}
```

Run the validation suite to green.

- [ ] **Step 4: Write the failing room chat tests**

Append to `server/tests/worldRoom.test.ts` (a client receives its own broadcast too — use `client.onMessage` collection):

```ts
  it('relays chat to all clients with the sender id', async () => {
    const room = await colyseus.createRoom('world', {});
    const a = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    const b = await colyseus.connectTo(room, { name: 'Bob', colorIndex: 1 });
    const got: Array<{ id: string; text: string }> = [];
    b.onMessage('chat', (m: { id: string; text: string }) => got.push(m));
    a.send('chat', { text: '  hi Bob  ' });
    await room.waitForMessage('chat');
    await new Promise((r) => setTimeout(r, 50));   // let the broadcast reach b
    expect(got).toEqual([{ id: a.sessionId, text: 'hi Bob' }]);
  });

  it('drops empty and malformed chat silently', async () => {
    const room = await colyseus.createRoom('world', {});
    const a = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    const got: unknown[] = [];
    a.onMessage('chat', (m: unknown) => got.push(m));
    a.send('chat', { text: '   ' });
    await room.waitForMessage('chat');
    a.send('chat', { nope: true });
    await room.waitForMessage('chat');
    await new Promise((r) => setTimeout(r, 50));
    expect(got).toEqual([]);
  });

  it('rate-limits a chat flood to the burst size', async () => {
    const room = await colyseus.createRoom('world', {});
    const a = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    const got: unknown[] = [];
    a.onMessage('chat', (m: unknown) => got.push(m));
    for (let i = 0; i < 8; i++) a.send('chat', { text: `msg ${i}` });
    for (let i = 0; i < 8; i++) await room.waitForMessage('chat');
    await new Promise((r) => setTimeout(r, 50));
    expect(got.length).toBe(3);   // CHAT_BURST
  });
```

Run: FAIL (no chat handler yet) — RED evidence.

- [ ] **Step 5: Implement the chat handler**

In `server/src/WorldRoom.ts` (import `sanitizeChat`, `CHAT_BURST`, `CHAT_REFILL_MS`):

```ts
  // Chat token bucket per player: CHAT_BURST instant messages, +1/sec.
  private chatBudget = new Map<string, { tokens: number; lastAt: number }>();
```

In `onCreate()`:

```ts
    this.onMessage('chat', (client, message: unknown) => {
      const text = sanitizeChat((message as { text?: unknown } | null)?.text);
      if (text === null) return;
      if (!this.state.players.has(client.sessionId)) return;

      const now = Date.now();
      const entry = this.chatBudget.get(client.sessionId) ?? { tokens: CHAT_BURST, lastAt: now };
      entry.tokens = Math.min(CHAT_BURST, entry.tokens + (now - entry.lastAt) / CHAT_REFILL_MS);
      entry.lastAt = now;
      if (entry.tokens < 1) {
        this.chatBudget.set(client.sessionId, entry);
        return;   // silently dropped
      }
      entry.tokens -= 1;
      this.chatBudget.set(client.sessionId, entry);

      this.broadcast('chat', { id: client.sessionId, text });
    });
```

Seed in `onJoin` (`{ tokens: CHAT_BURST, lastAt: Date.now() }`) and delete in the `onLeave` removal path, alongside the move budget bookkeeping.

- [ ] **Step 6: Green + gates**

Run: `npx vitest run tests/worldRoom.test.ts`, then `npm test && npm run build` (from `server/`).

- [ ] **Step 7: Commit**

```bash
git add server/src server/tests
git commit -m "feat: server chat relay with per-player rate limiting"
```

### Task 3: Chat panel UI (DOM)

**Files:**
- Create: `client/src/ui/chatPanel.ts`
- Test: `client/tests/chatPanel.test.ts`

**Interfaces:**
- Consumes: nothing (pure DOM; no three, no colyseus imports).
- Produces (Task 5 relies on this exactly):
  ```ts
  export interface ChatPanel {
    readonly isOpen: boolean;          // input focused/visible — game must ignore movement keys
    open(): void;                      // show + focus the input
    addMessage(name: string, text: string, isSelf?: boolean): void;
    dispose(): void;
  }
  export const CHAT_LOG_LIMIT = 50;
  export function createChatPanel(onSend: (text: string) => void): ChatPanel;
  ```
  DOM contract: root `#chat-root` (bottom-left overlay), log `#chat-log` (one `.chat-line` per message: `<b>Name:</b> text`, sender's own lines get class `self`), input `#chat-input` (hidden until open). Key behavior INSIDE the input: Enter → trim; if non-empty call `onSend(text)`; clear and close either way. Esc → clear and close without sending. All keydown/keyup events inside the input call `stopPropagation()` so the window-level `KeyboardInput` never sees them. Log keeps the newest `CHAT_LOG_LIMIT` lines (oldest DOM nodes removed) and stays scrolled to the bottom.

- [ ] **Step 1: Write the failing test**

Create `client/tests/chatPanel.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npx vitest run tests/chatPanel.test.ts`
Expected: FAIL — cannot resolve `../src/ui/chatPanel`.

- [ ] **Step 3: Write the implementation**

Create `client/src/ui/chatPanel.ts`:

```ts
export const CHAT_LOG_LIMIT = 50;

export interface ChatPanel {
  readonly isOpen: boolean;
  open(): void;
  addMessage(name: string, text: string, isSelf?: boolean): void;
  dispose(): void;
}

const CSS = `
#chat-root { position: fixed; left: 16px; bottom: 16px; width: 340px; z-index: 5;
  font-family: system-ui, sans-serif; font-size: 14px; pointer-events: none; }
#chat-log { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column;
  gap: 2px; margin-bottom: 6px; }
.chat-line { background: rgba(15, 23, 42, 0.55); color: #fff; border-radius: 6px;
  padding: 3px 8px; width: fit-content; max-width: 100%; word-break: break-word; }
.chat-line.self { background: rgba(37, 99, 235, 0.55); }
.chat-line b { margin-right: 4px; }
#chat-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.4); background: rgba(15, 23, 42, 0.75);
  color: #fff; outline: none; pointer-events: auto; }
#chat-input.hidden { display: none; }
`;

export function createChatPanel(onSend: (text: string) => void): ChatPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'chat-root';
  root.innerHTML = `<div id="chat-log"></div><input id="chat-input" class="hidden" maxlength="200" placeholder="Press Enter to chat" />`;
  document.body.appendChild(root);

  const log = root.querySelector<HTMLDivElement>('#chat-log')!;
  const inputEl = root.querySelector<HTMLInputElement>('#chat-input')!;
  let openState = false;

  const close = () => {
    inputEl.value = '';
    inputEl.classList.add('hidden');
    inputEl.blur();
    openState = false;
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

  return {
    get isOpen() { return openState; },
    open() {
      inputEl.classList.remove('hidden');
      openState = true;
      inputEl.focus();
    },
    addMessage(name: string, text: string, isSelf = false) {
      const line = document.createElement('div');
      line.className = 'chat-line' + (isSelf ? ' self' : '');
      const nameEl = document.createElement('b');
      nameEl.textContent = `${name}:`;       // textContent — never innerHTML for user data
      line.appendChild(nameEl);
      line.appendChild(document.createTextNode(text));
      log.appendChild(line);
      while (log.children.length > CHAT_LOG_LIMIT) log.removeChild(log.firstChild!);
      log.scrollTop = log.scrollHeight;
    },
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chatPanel.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Full suite + commit**

Run: `npm test` (from `client/`), then:

```bash
git add client/src/ui/chatPanel.ts client/tests/chatPanel.test.ts
git commit -m "feat: chat panel with focus-safe input and capped message log"
```

### Task 4: Chat bubbles + roster access

**Files:**
- Create: `client/src/player/chatBubble.ts`
- Modify: `client/src/net/remotePlayers.ts`

**Interfaces:**
- Consumes: `PLAYER_HEIGHT` (controller). Three.js allowed (rendering module).
- Produces (Task 5 relies on this exactly):
  ```ts
  // chatBubble.ts
  export const BUBBLE_SECONDS = 5;
  export const BUBBLE_MAX_CHARS = 80;
  export function showBubble(parent: THREE.Group, text: string): void;

  // remotePlayers.ts — new method on RemotePlayers
  getRoot(sessionId: string): THREE.Group | undefined;
  ```
  `showBubble` semantics: truncates text to BUBBLE_MAX_CHARS (appending "…" if cut), replaces any existing bubble on the same parent (find by `child.name === 'chat-bubble'`), positions it ABOVE the name tag (`y = PLAYER_HEIGHT + 0.95`), and removes it after BUBBLE_SECONDS — disposing the sprite's material AND texture on removal (both on timeout and on early replacement). No unit tests (Three.js composition, same convention as nametag.ts); verified in Task 5's manual checklist.

- [ ] **Step 1: Create `client/src/player/chatBubble.ts`**

```ts
import * as THREE from 'three';
import { PLAYER_HEIGHT } from './controller';

export const BUBBLE_SECONDS = 5;
export const BUBBLE_MAX_CHARS = 80;

const BUBBLE_NAME = 'chat-bubble';

function disposeBubble(bubble: THREE.Object3D): void {
  const sprite = bubble as THREE.Sprite;
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
  clearTimeout((sprite.userData.timer as ReturnType<typeof setTimeout>));
}

export function showBubble(parent: THREE.Group, text: string): void {
  const existing = parent.getObjectByName(BUBBLE_NAME);
  if (existing) {
    disposeBubble(existing);
    parent.remove(existing);
  }

  const shown = text.length > BUBBLE_MAX_CHARS ? text.slice(0, BUBBLE_MAX_CHARS - 1) + '…' : text;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 96, 20);
  ctx.fill();
  ctx.font = '28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(shown, 256, 50, 492);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true }));
  sprite.name = BUBBLE_NAME;
  sprite.scale.set(2.2, 0.42, 1);
  sprite.position.set(0, PLAYER_HEIGHT + 0.95, 0);
  sprite.userData.timer = setTimeout(() => {
    disposeBubble(sprite);
    parent.remove(sprite);
  }, BUBBLE_SECONDS * 1000);

  parent.add(sprite);
}
```

- [ ] **Step 2: Add `getRoot` to `client/src/net/remotePlayers.ts`**

Inside the `RemotePlayers` class, after `remove(...)`:

```ts
  getRoot(sessionId: string): THREE.Group | undefined {
    return this.entries.get(sessionId)?.root;
  }
```

- [ ] **Step 3: Gates**

Run (from `client/`): `npm test && npm run build` — all green (no new tests; nothing broken).

- [ ] **Step 4: Commit**

```bash
git add client/src/player/chatBubble.ts client/src/net/remotePlayers.ts
git commit -m "feat: timed chat bubbles with resource disposal; expose remote roster roots"
```

### Task 5: Wire chat into main.ts

**Files:**
- Modify: `client/src/main.ts`

**Interfaces:**
- Consumes: `createChatPanel` (Task 3), `showBubble` (Task 4), `RemotePlayers.getRoot` (Task 4), server chat wire contract (Task 2).
- Produces: the playable chat feature.

- [ ] **Step 1: Wire the panel, messages, bubbles, and input gating**

In `client/src/main.ts`, inside `start(room, name, colorIndex)`:

(a) Imports (top of file):

```ts
import { createChatPanel } from './ui/chatPanel';
import { showBubble } from './player/chatBubble';
```

(b) After the remote-players setup, create the panel and message wiring:

```ts
  // --- Chat ---
  const chat = createChatPanel((text) => {
    room.send('chat', { text });
  });

  room.onMessage('chat', ({ id, text }: { id: string; text: string }) => {
    const sender = room.state.players.get(id);
    const senderName = sender ? (sender.name as string) : '???';
    const isSelf = id === room.sessionId;
    chat.addMessage(senderName, text, isSelf);
    const target = isSelf ? avatar : remotes.getRoot(id);
    if (target) showBubble(target, text);
  });

  // Enter opens chat when the game has focus (never while already typing).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !chat.isOpen) {
      e.preventDefault();
      chat.open();
    }
  });
```

(c) Gate movement while typing — in the fixed-step loop, replace the input read:

```ts
      const k = chat.isOpen
        ? { moveX: 0, moveZ: 0, run: false, jump: false }
        : input.state;
```

(The chat input also stops key propagation — this gate is the second belt, and it also covers the frame where focus moves.)

- [ ] **Step 2: Gates**

Run (from `client/`): `npm test && npm run build` — all green.

- [ ] **Step 3: Manual two-window checklist (integration: if you are an agent without a browser, start both servers, run a headless two-client chat smoke — client A sends 'chat', client B receives `{id, text}` — capture output, kill the servers you started, and mark the browser items pending human verification)**

Start server (`cd server && npm run dev`) and client (`cd client && npm run dev -- --host`); open two browser windows:

- [ ] Enter opens the chat input; typing "wasd hello" does NOT move the avatar.
- [ ] Enter sends: the message appears in BOTH windows' panels as `Name: text`, own lines highlighted.
- [ ] A speech bubble appears above the sender's head in BOTH windows and fades after ~5 s.
- [ ] A second message replaces the sender's existing bubble immediately.
- [ ] Esc closes the input without sending; movement works again right after closing (both paths).
- [ ] Spamming Enter+message quickly: only ~3 land instantly, further ones are dropped (panel shows no flood).
- [ ] A >200-char paste is truncated server-side (both windows show the cut text).
- [ ] Log caps at 50 lines; panel scrolls to newest.
- [ ] HTML in a message (e.g. `<b>hi</b>`) renders as literal text.
- [ ] No console errors in either window.

- [ ] **Step 4: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: wire chat panel, bubbles, and typing-safe input gating"
```

---

## Phase 3 exit criteria

- Server suite green (validation + room including budget, chat relay, chat rate tests) and `npm run build` clean.
- Client suite green (existing 50 + 8 chat panel = 58) and `npm run build` clean.
- Manual two-window checklist verified.
- Deployed: merge to main + push (Render and Cloudflare Pages auto-deploy).

## What comes next (separate plans)

- **Phase 4:** LiveKit proximity voice. **Phase 5:** character models/animations, mute/block, full-room UX, reconnect flow, remaining hardening (connection-level message-rate limiter, better profanity matcher).

