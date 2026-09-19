import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import appConfig from '../src/app.config';
import { MAX_STEP, SPAWN } from '../src/constants';

describe('WorldRoom', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); });

  it('spawns a joining player at SPAWN with sanitized name and color', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: '  Alice  ', colorIndex: 3 });
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.name).toBe('Alice');
    expect(p.colorIndex).toBe(3);
    expect(p.x).toBe(SPAWN.x);
    expect(p.z).toBe(SPAWN.z);
  });

  it('replaces a bad nickname with Guest', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'shithead', colorIndex: 0 });
    await room.waitForNextPatch();
    expect(room.state.players.get(client.sessionId)!.name).toBe('Guest');
  });

  it('applies a valid move message', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: 0.3, y: 0, z: 7.9, heading: 0.5 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(0.3, 4);
    expect(p.z).toBeCloseTo(7.9, 4);
    expect(p.heading).toBeCloseTo(0.5, 4);
  });

  it('clamps a huge teleport to the budget cap', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: SPAWN.x + 30, y: 0, z: SPAWN.z, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(SPAWN.x + 3, 4);   // MOVE_BUDGET_CAP
  });

  it('applies a legit catch-up burst in full (no clamping)', async () => {
    // After a client frame hitch, several 15 Hz move messages arrive in the
    // same wall-clock instant, each a legit ≤0.533 m run step. Total 2.132 m
    // fits the 3 m budget, so every step must apply exactly.
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    const step = 0.533;
    // Sent+awaited one at a time (rather than fired as a batch) to work
    // around a @colyseus/testing v0.16.x quirk where waitForMessage() can
    // only latch onto one message per batch when several arrive back to
    // back; the sub-millisecond round trip here still lands well within the
    // "same wall-clock instant" the token bucket's dt-based accrual sees.
    for (let i = 1; i <= 4; i++) {
      client.send('move', { x: SPAWN.x + step * i, y: 0, z: SPAWN.z, heading: 0 });
      await room.waitForMessage('move');
    }
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(SPAWN.x + step * 4, 3);
  });

  it('caps a sustained flood at roughly the budget, not message count', async () => {
    // 40 instant messages each demanding +1.5 m (60 m total). Budget: 3 m
    // initial + ~zero accrual during a sub-second flood ⇒ total applied ≈ 3 m.
    // Bound is generous (< 5) to absorb a few ms of real accrual.
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    // Sent+awaited one at a time — see the comment in the burst test above
    // for why (a @colyseus/testing v0.16.x waitForMessage() batching quirk).
    let target = SPAWN.x;
    for (let i = 0; i < 40; i++) {
      target += 1.5;
      client.send('move', { x: target, y: 0, z: SPAWN.z, heading: 0 });
      await room.waitForMessage('move');
    }
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x - SPAWN.x).toBeLessThan(5);
  });

  it('ignores malformed move payloads', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: NaN, y: 0, z: 0, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBe(SPAWN.x);
    expect(p.z).toBe(SPAWN.z);
  });

  it('caps sustained speed under a flood of move messages (rate limit, not just per-message step)', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    // 20 messages, each requesting +1.5m (== MAX_STEP) further in x than the last.
    // Naively capping only per-message step allows 20 * 1.5 = 30m. With the
    // distance token bucket, total applied distance is bounded by the
    // MOVE_BUDGET_CAP (3m) plus whatever trickles in via MAX_SPEED * dt while
    // these messages are processed, so it stays far below the naive 30m; we
    // assert a bound with margin (10m) to absorb any real scheduling delay
    // between messages in this test environment.
    let x = SPAWN.x;
    for (let i = 0; i < 20; i++) {
      x += MAX_STEP;
      client.send('move', { x, y: 0, z: SPAWN.z, heading: 0 });
      await room.waitForMessage('move');
    }
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeLessThan(10);
    expect(p.x).toBeLessThan(20 * MAX_STEP); // sanity: strictly better than the naive cap
  });

  it('never regresses x after the budget goes negative (retrograde teleport exploit)', async () => {
    // Drain the budget with two +1.5m moves (3m budget exhausted, landing at
    // ~0 once validateMove's own clamping is accounted for). Then keep
    // sending moves further away (diagonal, so the hypot/scale arithmetic
    // isn't perfectly clean and genuinely underflows the budget below zero
    // via float rounding, exactly as the bug describes). A broken clamp lets
    // that negative budget make validateMove step AWAY from the target, and
    // each subsequent message *doubles* the negative budget — a runaway
    // teleport backward. x must never regress. Intermediate reads happen
    // right after waitForMessage (whose handler runs synchronously) rather
    // than waitForNextPatch, so we don't inject extra real wall-clock time
    // that would mask the bug with legitimate budget accrual.
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });

    let x = SPAWN.x;
    let z = SPAWN.z;
    for (let i = 0; i < 2; i++) {
      x += 1.5;
      client.send('move', { x, y: 0, z, heading: 0 });
      await room.waitForMessage('move');
    }
    const xAfterDrain = room.state.players.get(client.sessionId)!.x;

    let lastX = xAfterDrain;
    for (let i = 0; i < 60; i++) {
      x += 1.5;
      z += 1.5;
      client.send('move', { x, y: 0, z, heading: 0 });
      await room.waitForMessage('move');
      const currentX = room.state.players.get(client.sessionId)!.x;
      expect(currentX).toBeGreaterThanOrEqual(lastX);   // never regress
      lastX = currentX;
    }

    expect(lastX).toBeGreaterThanOrEqual(xAfterDrain);
    expect(lastX).toBeLessThan(SPAWN.x + 5);
  });

  it('removes the player on consented leave', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    await room.waitForNextPatch();
    const id = client.sessionId;
    await client.leave(true);
    await room.waitForNextPatch();
    expect(room.state.players.get(id)).toBeUndefined();
  });

  it('tracks two players independently', async () => {
    const room = await colyseus.createRoom('world', {});
    const a = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 1 });
    const b = await colyseus.connectTo(room, { name: 'Bob', colorIndex: 2 });
    a.send('move', { x: 0.5, y: 0, z: 8, heading: 0 }); // well within the 3m move budget
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get(a.sessionId)!.x).toBeCloseTo(0.5, 4);
    expect(room.state.players.get(b.sessionId)!.x).toBe(SPAWN.x);
  });

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
    // Sent+awaited one at a time — see the comment on the move burst tests
    // above for why (a @colyseus/testing v0.16.x waitForMessage() batching
    // quirk where only the first of a synchronous burst of same-type
    // messages resolves the wait).
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
    // Sent+awaited one at a time — see the move burst tests above for why.
    // The interleaving is harmless to this test's intent: 8 sequential sends
    // still land well within the CHAT_REFILL_MS=1000ms window, so only the
    // CHAT_BURST=3 tokens available at the start pass through.
    for (let i = 0; i < 8; i++) {
      a.send('chat', { text: `msg ${i}` });
      await room.waitForMessage('chat');
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(got.length).toBe(3);   // CHAT_BURST
  });
});
