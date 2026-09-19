import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import appConfig from '../src/app.config';
import { WORLD_HALF, MAX_STEP, SPAWN } from '../src/constants';

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
    client.send('move', { x: 1, y: 0, z: 7.5, heading: 0.5 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(1, 4);
    expect(p.z).toBeCloseTo(7.5, 4);
    expect(p.heading).toBeCloseTo(0.5, 4);
  });

  it('clamps a teleport move to MAX_STEP', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: SPAWN.x + 30, y: 0, z: SPAWN.z, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(SPAWN.x + MAX_STEP, 4);
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
    a.send('move', { x: 1, y: 0, z: 8, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get(a.sessionId)!.x).toBeCloseTo(1, 4);
    expect(room.state.players.get(b.sessionId)!.x).toBe(SPAWN.x);
  });
});
