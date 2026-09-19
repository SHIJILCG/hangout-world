import { Room, type Client } from 'colyseus';
import { WorldState, PlayerState } from './schema';
import { sanitizeName, clampColorIndex, validateMove } from './validation';
import { SPAWN, MAX_CLIENTS, RECONNECT_GRACE_SECONDS, MAX_STEP, MAX_SPEED } from './constants';

interface JoinOptions { name?: unknown; colorIndex?: unknown }

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_CLIENTS;
  state = new WorldState();

  // Per-player timestamp (ms, Date.now()) of the last processed "move"
  // message — used to scale the allowed step by real elapsed time, so a
  // flood of messages can't be used to move faster than MAX_SPEED.
  private lastMoveAt = new Map<string, number>();

  onCreate(): void {
    // "world" is a single persistent shared room, not an ephemeral match —
    // it must not tear itself (and its patch loop) down just because it is
    // briefly empty between players.
    this.autoDispose = false;

    this.onMessage('move', (client, message: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      const now = Date.now();
      const last = this.lastMoveAt.get(client.sessionId);
      // First message after join: assume a normal 15 Hz send interval
      // rather than an unbounded/huge dt.
      const dt = last === undefined ? 1 / 15 : (now - last) / 1000;
      this.lastMoveAt.set(client.sessionId, now);

      // Floor tolerates timer jitter at 15 Hz; MAX_SPEED * dt caps sustained
      // speed under a flood of messages; MAX_STEP is the absolute ceiling
      // for a single message after a long gap.
      const maxStep = Math.min(MAX_STEP, Math.max(MAX_SPEED / 30, MAX_SPEED * dt));

      const next = validateMove({ x: p.x, y: p.y, z: p.z, heading: p.heading }, message, maxStep);
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
    this.lastMoveAt.delete(client.sessionId);
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
    this.lastMoveAt.delete(client.sessionId);
  }
}
