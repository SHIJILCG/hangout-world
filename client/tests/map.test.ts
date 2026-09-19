import { describe, it, expect } from 'vitest';
import { buildCollision, WORLD_HALF, SPAWN } from '../src/world/map';
import { PLAYER_RADIUS, createPlayerState, updatePlayer, type MoveInput } from '../src/player/controller';
import { groundHeight, riverV, bridgePoint } from '../scripts/meadow/scene.mjs';

// Pure collision + physics tests — no GLB, no rendering. buildCollision() is
// sync and JSON-only, so this suite runs headless under plain-Node vitest.

const dt = 1 / 60;

function simulate(
  collision: ReturnType<typeof buildCollision>,
  start: { x: number; y: number; z: number },
  input: MoveInput,
  seconds: number,
  onStep?: (s: ReturnType<typeof createPlayerState>) => void,
): ReturnType<typeof createPlayerState> {
  let state = createPlayerState(start.x, start.y, start.z);
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    state = updatePlayer(state, input, dt, collision);
    onStep?.(state);
  }
  return state;
}

describe('buildCollision (meadow heightfield + generator boxes)', () => {
  const collision = buildCollision();

  it('collision heightfield matches the generator terrain function', () => {
    // A dozen sample points across the map, including the required trio.
    const samples: Array<[number, number]> = [
      [0, 8], [20, -16], [-30, 25],
      [5, 5], [-25, -25], [10, 30],
      [-15, 10], [25, 0], [0, -30],
      [30, 30], [-35, 5], [15, -25],
    ];
    for (const [x, z] of samples) {
      expect(collision.groundAt(x, z)).toBeCloseTo(groundHeight(x, z), 2);
    }
  });

  it('spawn is flat, clear ground', () => {
    expect(collision.groundAt(SPAWN.x, SPAWN.z)).toBe(0);
    const r = collision.resolveHorizontal(SPAWN.x, SPAWN.z, 0, PLAYER_RADIUS, 1.7);
    expect(r).toEqual({ x: SPAWN.x, z: SPAWN.z });
  });

  it('border walls stop a player leaning in at all four edges', () => {
    const edge = WORLD_HALF - 0.2;
    for (const [x, z] of [[edge, 0], [-edge, 0], [0, edge], [0, -edge]] as const) {
      const r = collision.resolveHorizontal(x, z, 0, PLAYER_RADIUS, 1.7);
      expect(Math.abs(r.x)).toBeLessThanOrEqual(WORLD_HALF - PLAYER_RADIUS + 1e-6);
      expect(Math.abs(r.z)).toBeLessThanOrEqual(WORLD_HALF - PLAYER_RADIUS + 1e-6);
    }
  });

  it('a player can WALK across the bridge', () => {
    // bridgePoint(-8) sits on dry ground short of the west ramp; walking
    // dir (1,1) (normalized) moves purely along the bridge's v-axis (the
    // (1,1)/sqrt2 world direction is exactly the v unit vector), climbing
    // the 0.25 m steps up onto the 1.0 m deck and back down the far side.
    const [sx, sz] = bridgePoint(-8, 0);
    const collisionStart = { x: sx, y: collision.groundAt(sx, sz), z: sz };
    const input: MoveInput = { dirX: 1, dirZ: 1, run: false, jump: false };

    let maxY = -Infinity;
    let minYNearBridge = Infinity;
    const final = simulate(collision, collisionStart, input, 8, (s) => {
      maxY = Math.max(maxY, s.y);
      if (Math.abs(riverV(s.x, s.z)) < 4) minYNearBridge = Math.min(minYNearBridge, s.y);
    });

    expect(maxY).toBeCloseTo(1.0, 1); // reaches the deck top
    expect(minYNearBridge).toBeGreaterThanOrEqual(-0.05); // never dips near the water while on the ramp/deck

    const finalV = riverV(final.x, final.z);
    expect(finalV).toBeGreaterThan(6); // walked all the way past the bridge
    expect(final.onGround).toBe(true);
    expect(final.y).toBeLessThan(0.6); // back down near ground height, not still up on the deck
  });

  it('a player can WADE the river away from the bridge', () => {
    // 10 m off the bridge axis (u = -10): no deck/steps here, so walking
    // straight across dips down into the riverbed and back up the far bank.
    const [sx, sz] = bridgePoint(-8, -10);
    const collisionStart = { x: sx, y: collision.groundAt(sx, sz), z: sz };
    const input: MoveInput = { dirX: 1, dirZ: 1, run: false, jump: false };

    let minY = Infinity;
    const final = simulate(collision, collisionStart, input, 8, (s) => {
      minY = Math.min(minY, s.y);
    });

    expect(minY).toBeLessThan(-0.5); // wades down into the water

    const finalV = riverV(final.x, final.z);
    expect(finalV).toBeGreaterThan(4); // emerged on the far side
    expect(final.y).toBeGreaterThan(-0.1); // back up out of the water
  });

  it('the ruin is climbable to the crown', () => {
    // Walk up the fallen-block steps (x = -20.1, 12 steps of rise 0.3, run
    // 0.85 toward -z) onto the crown (top 3.6). The walker overshoots the
    // crown's far edge and drops back to the ground by the end of the sim,
    // so only the MAX y (and onGround at that instant) is asserted.
    const startX = -20.1;
    const startZ = -3.5;
    const collisionStart = { x: startX, y: collision.groundAt(startX, startZ), z: startZ };
    const input: MoveInput = { dirX: 0, dirZ: -1, run: false, jump: false };

    let maxY = -Infinity;
    let onGroundAtMax = false;
    simulate(collision, collisionStart, input, 4, (s) => {
      if (s.y > maxY) {
        maxY = s.y;
        onGroundAtMax = s.onGround;
      }
    });

    expect(maxY).toBeCloseTo(3.6, 1);
    expect(onGroundAtMax).toBe(true);
  });

  it('arch passage is open', () => {
    // Walk straight through the ruined arch at x = -18 from z = -13 toward
    // -z; the piers sit at x = -18 +/- 1.8 (clear of the x = -18 centerline)
    // so a walking player should pass under the arch without getting stuck.
    const startX = -18;
    const startZ = -13;
    const collisionStart = { x: startX, y: collision.groundAt(startX, startZ), z: startZ };
    const input: MoveInput = { dirX: 0, dirZ: -1, run: false, jump: false };

    const final = simulate(collision, collisionStart, input, 4);

    expect(final.z).toBeLessThan(-18);
  });
});
