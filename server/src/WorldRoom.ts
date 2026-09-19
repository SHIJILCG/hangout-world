import { Room, type Client } from 'colyseus';
import { WorldState, PlayerState } from './schema';
import { sanitizeName, clampColorIndex, validateMove } from './validation';
import { SPAWN, MAX_CLIENTS, RECONNECT_GRACE_SECONDS, MAX_SPEED, MOVE_BUDGET_CAP } from './constants';

interface JoinOptions { name?: unknown; colorIndex?: unknown }

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_CLIENTS;
  state = new WorldState();

  // Distance token bucket per player: tolerates legit catch-up bursts while
  // hard-capping sustained speed at MAX_SPEED regardless of message rate.
  private moveBudget = new Map<string, { budget: number; lastAt: number }>();

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
      const next = validateMove(current, message, entry.budget);
      entry.budget -= Math.hypot(next.x - current.x, next.z - current.z);
      this.moveBudget.set(client.sessionId, entry);

      p.x = next.x;
      p.y = next.y;
      p.z = next.z;
      p.heading = next.heading;
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
  }
}
