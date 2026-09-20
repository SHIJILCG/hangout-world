import { Room, ServerError, type Client } from 'colyseus';
import { WorldState, PlayerState } from './schema';
import { sanitizeName, clampColorIndex, validateMove, sanitizeChat } from './validation';
import { SPAWN, MAX_CLIENTS, RECONNECT_GRACE_SECONDS, MAX_SPEED, MOVE_BUDGET_CAP, CHAT_BURST, CHAT_REFILL_MS, PROXIMITY } from './constants';
import { nearbyPlayerIds } from './proximity';
import { iceServersFromEnv } from './voiceConfig';

interface JoinOptions { name?: unknown; colorIndex?: unknown }

export class WorldRoom extends Room<WorldState> {
  private static active: WorldRoom | undefined;
  maxClients = MAX_CLIENTS;
  state = new WorldState();

  // Distance token bucket per player: tolerates legit catch-up bursts while
  // hard-capping sustained speed at MAX_SPEED regardless of message rate.
  private moveBudget = new Map<string, { budget: number; lastAt: number }>();

  // Chat token bucket per player: CHAT_BURST instant messages, +1/sec.
  private chatBudget = new Map<string, { tokens: number; lastAt: number }>();
  private voiceReady = new Set<string>();
  private voiceLinks = new Set<string>();
  private proximityCapable = new Set<string>();

  onCreate(): void {
    if (WorldRoom.active) throw new ServerError(4210, 'The world is full. Please retry shortly.');
    // "world" is a single persistent shared room, not an ephemeral match —
    // it must not tear itself (and its patch loop) down just because it is
    // briefly empty between players.
    this.autoDispose = false;
    WorldRoom.active = this;

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
      this.syncVoiceRelationships(client.sessionId);
    });

    const handleChat = (client: Client, message: unknown) => {
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

      // The server owns both pose and recipient selection. Include the sender
      // so their local chat panel/bubble follows the same event path.
      for (const id of nearbyPlayerIds(this.state.players.entries(), client.sessionId, PROXIMITY.chatRadius)) {
        this.sendChat(id, client.sessionId, text);
      }
      this.sendChat(client.sessionId, client.sessionId, text);
    };
    // Keep accepting the former wire message during rolling deploys.
    this.onMessage('chat', handleChat);
    this.onMessage('proximity-chat', handleChat);

    this.onMessage('voice-ready', (client, message: unknown) => {
      if (typeof (message as { enabled?: unknown } | null)?.enabled !== 'boolean') return;
      if ((message as { enabled: boolean }).enabled) this.voiceReady.add(client.sessionId);
      else this.voiceReady.delete(client.sessionId);
      this.syncVoiceRelationships(client.sessionId);
    });

    this.onMessage('voice-signal', (client, message: unknown) => {
      if (!isVoiceSignal(message)) return;
      const target = this.clientById(message.to);
      if (!target || !this.isVoiceLinked(client.sessionId, message.to)) return;
      target.send('voice-signal', { from: client.sessionId, signal: message.signal });
    });
    this.onMessage('voice-config', (client) => {
      client.send('voice-config', { iceServers: iceServersFromEnv(process.env, client.sessionId) });
    });
    this.onMessage('proximity-capable', (client) => { this.proximityCapable.add(client.sessionId); });
  }

  onDispose(): void {
    if (WorldRoom.active === this) WorldRoom.active = undefined;
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
    // Audio must stop immediately when a tab/socket disappears; a successful
    // reconnect re-advertises voice readiness from the client.
    this.removeVoiceRelationships(client.sessionId);
    this.voiceReady.delete(client.sessionId);
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
    this.proximityCapable.delete(client.sessionId);
  }

  /** Reusable server-owned proximity relationship used by voice/signaling. */
  private getNearbyPlayers(playerId: string): string[] {
    return nearbyPlayerIds(this.state.players.entries(), playerId, PROXIMITY.voiceRadius);
  }

  private syncVoiceRelationships(playerId: string): void {
    for (const otherId of this.state.players.keys()) {
      if (otherId === playerId) continue;
      const shouldLink = this.voiceReady.has(playerId)
        && this.voiceReady.has(otherId)
        && this.getNearbyPlayers(playerId).includes(otherId);
      this.setVoiceLink(playerId, otherId, shouldLink);
    }
  }

  private setVoiceLink(a: string, b: string, linked: boolean): void {
    const key = pairKey(a, b);
    const hadLink = this.voiceLinks.has(key);
    if (linked === hadLink) return;
    if (linked) this.voiceLinks.add(key); else this.voiceLinks.delete(key);
    this.clientById(a)?.send('voice-nearby', { id: b, nearby: linked });
    this.clientById(b)?.send('voice-nearby', { id: a, nearby: linked });
  }

  private removeVoiceRelationships(playerId: string): void {
    for (const otherId of this.state.players.keys()) {
      if (otherId !== playerId) this.setVoiceLink(playerId, otherId, false);
    }
  }

  private isVoiceLinked(a: string, b: string): boolean { return this.voiceLinks.has(pairKey(a, b)); }
  private clientById(id: string): Client | undefined { return this.clients.find((client) => client.sessionId === id); }
  private sendChat(recipientId: string, senderId: string, text: string): void {
    const recipient = this.clientById(recipientId);
    if (!recipient) return;
    const payload = { id: senderId, text };
    // Old tabs understand only `chat`; new clients advertise support after
    // binding their listener. Either way, recipient selection stays server-side.
    recipient.send(this.proximityCapable.has(recipientId) ? 'proximity-chat' : 'chat', payload);
  }
}

function pairKey(a: string, b: string): string { return a < b ? `${a}:${b}` : `${b}:${a}`; }

interface VoiceSignalMessage { to: string; signal: unknown }
function isVoiceSignal(value: unknown): value is VoiceSignalMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  if (typeof message.to !== 'string' || message.to.length > 128 || typeof message.signal !== 'object' || message.signal === null) return false;
  // SDP and ICE are forwarded only after pair authorization; cap their size to
  // avoid turning the signaling channel into an unbounded payload relay.
  try { return JSON.stringify(message.signal).length <= 20_000; } catch { return false; }
}
