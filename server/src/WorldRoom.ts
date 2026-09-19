import { Room, type Client } from 'colyseus';
import { WorldState, PlayerState } from './schema';
import { sanitizeName, clampColorIndex, validateMove } from './validation';
import { SPAWN, MAX_CLIENTS, RECONNECT_GRACE_SECONDS } from './constants';

interface JoinOptions { name?: unknown; colorIndex?: unknown }

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_CLIENTS;
  state = new WorldState();

  onCreate(): void {
    // "world" is a single persistent shared room, not an ephemeral match —
    // it must not tear itself (and its patch loop) down just because it is
    // briefly empty between players.
    this.autoDispose = false;

    this.onMessage('move', (client, message: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const next = validateMove({ x: p.x, y: p.y, z: p.z, heading: p.heading }, message);
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
  }
}
