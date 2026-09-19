import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import appConfig from '../src/app.config';
import { WORLD_HALF, MAX_STEP, MAX_SPEED, SPAWN } from '../src/constants';

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

  // The very first "move" message after join has no lastMoveAt yet, so the
  // room assumes a normal 15 Hz cadence (dt = 1/15) rather than granting the
  // full MAX_STEP. Allowed step = MAX_SPEED * (1/15) ≈ 0.667m (this beats the
  // 10/30 floor and is under the MAX_STEP=1.5 ceiling), so single-message
  // test moves below must stay within that budget.
  const FIRST_MOVE_CAP = MAX_SPEED / 15;

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

  it('clamps a teleport move to the rate-limited first-message step', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: SPAWN.x + 30, y: 0, z: SPAWN.z, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(SPAWN.x + FIRST_MOVE_CAP, 4);
    expect(p.x).toBeLessThan(SPAWN.x + MAX_STEP); // strictly tighter than the raw ceiling
    expect(Math.abs(p.x)).toBeLessThanOrEqual(WORLD_HALF);
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
    // rate limit, each message is instead bounded by
    // min(MAX_STEP, max(MAX_SPEED/30, MAX_SPEED*dt)) — at most ~0.667m for the
    // first message (dt = 1/15) and, in the worst case where every subsequent
    // message is processed faster than the ~33ms floor threshold, the 10/30
    // floor (~0.333m) for the rest: 0.667 + 19*0.333 ≈ 7.0m. That's already far
    // below the naive 30m; we assert a bound with margin (10m) to also absorb
    // any real scheduling delay between messages in this test environment.
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
    a.send('move', { x: 0.5, y: 0, z: 8, heading: 0 }); // within the first-move cap (see above)
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get(a.sessionId)!.x).toBeCloseTo(0.5, 4);
    expect(room.state.players.get(b.sessionId)!.x).toBe(SPAWN.x);
  });
});
