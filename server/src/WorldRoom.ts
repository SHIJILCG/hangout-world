import { Room, type Client } from 'colyseus';
import { WorldState, PlayerState } from './schema';
import { sanitizeName, clampColorIndex, validateMove, sanitizeChat } from './validation';
import { SPAWN, MAX_CLIENTS, RECONNECT_GRACE_SECONDS, MAX_SPEED, MOVE_BUDGET_CAP, CHAT_BURST, CHAT_REFILL_MS } from './constants';

interface JoinOptions { name?: unknown; colorIndex?: unknown }

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_CLIENTS;
  state = new WorldState();

  // Distance token bucket per player: tolerates legit catch-up bursts while
  // hard-capping sustained speed at MAX_SPEED regardless of message rate.
  private moveBudget = new Map<string, { budget: number; lastAt: number }>();

  // Chat token bucket per player: CHAT_BURST instant messages, +1/sec.
  private chatBudget = new Map<string, { tokens: number; lastAt: number }>();

  onCreate(): void {
    // "world" is a single persistent shared room, not an ephemeral match —
    // it must not tear itself (and its patch loop) down just because it is
    // briefly empty between players.
    this.autoDispose = false;

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
      const next = validateMove(current, message, Math.max(0, entry.budget));
      entry.budget = Math.max(0, entry.budget - Math.hypot(next.x - current.x, next.z - current.z));
      this.moveBudget.set(client.sessionId, entry);

      p.x = next.x;
      p.y = next.y;
      p.z = next.z;
      p.heading = next.heading;
    });

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
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const p = new PlayerState();
    p.name = sanitizeName(options?.name);
    p.colorIndex = clampColorIndex(options?.colorIndex);
    p.x = SPAWN.x;
    p.y = SPAWN.y;
    p.z = SPAWN.z;
    this.state.players.set(client.sessionId, p);
    this.moveBudget.set(client.sessionId, { budget: MOVE_BUDGET_CAP, lastAt: Date.now() });
    this.chatBudget.set(client.sessionId, { tokens: CHAT_BURST, lastAt: Date.now() });
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    if (!consented) {
      try {
        // Keep the player in the world during brief disconnects.
        await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
        return;
      } catch {
        // grace expired — fall through to removal
      }
    }
    this.state.players.delete(client.sessionId);
    this.moveBudget.delete(client.sessionId);
    this.chatBudget.delete(client.sessionId);
  }
}
