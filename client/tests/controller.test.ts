import { describe, it, expect } from 'vitest';
import { CollisionWorld, type Box } from '../src/world/collision';
import {
  createPlayerState, updatePlayer,
  WALK_SPEED, RUN_SPEED, JUMP_SPEED, GRAVITY,
  type MoveInput,
} from '../src/player/controller';

const flat = new CollisionWorld([]);
const DT = 1 / 60;
const idle: MoveInput = { dirX: 0, dirZ: 0, run: false, jump: false };

function simulate(world: CollisionWorld, input: MoveInput, steps: number, s = createPlayerState()) {
  for (let i = 0; i < steps; i++) s = updatePlayer(s, input, DT, world);
  return s;
}

describe('walking and running', () => {
  it('walks at WALK_SPEED', () => {
    const s = simulate(flat, { ...idle, dirX: 1 }, 60);   // 1 second
    expect(s.x).toBeCloseTo(WALK_SPEED, 1);
    expect(s.onGround).toBe(true);
  });

  it('runs at RUN_SPEED', () => {
    const s = simulate(flat, { ...idle, dirX: 1, run: true }, 60);
    expect(s.x).toBeCloseTo(RUN_SPEED, 1);
  });

  it('faces the direction of movement', () => {
    const s = simulate(flat, { ...idle, dirX: 1, dirZ: 0 }, 5);
    expect(s.heading).toBeCloseTo(Math.atan2(1, 0), 5);
  });

  it('keeps heading when idle', () => {
    let s = simulate(flat, { ...idle, dirX: 1 }, 5);
    const heading = s.heading;
    s = simulate(flat, idle, 5, s);
    expect(s.heading).toBe(heading);
  });
});

describe('jumping and gravity', () => {
  it('jump launches upward and leaves the ground', () => {
    const s = updatePlayer(createPlayerState(), { ...idle, jump: true }, DT, flat);
    expect(s.vy).toBeGreaterThan(0);
    expect(s.onGround).toBe(false);
  });

  it('reaches roughly the analytic apex then lands back at 0', () => {
    let s = updatePlayer(createPlayerState(), { ...idle, jump: true }, DT, flat);
    let apex = 0;
    for (let i = 0; i < 120; i++) {          // 2 s: plenty for a full arc
      s = updatePlayer(s, idle, DT, flat);
      apex = Math.max(apex, s.y);
    }
    const analyticApex = (JUMP_SPEED * JUMP_SPEED) / (2 * -GRAVITY);  // ≈1.225
    expect(apex).toBeGreaterThan(analyticApex * 0.85);
    expect(apex).toBeLessThan(analyticApex * 1.1);
    expect(s.y).toBe(0);
    expect(s.onGround).toBe(true);
  });

  it('cannot jump while airborne', () => {
    let s = updatePlayer(createPlayerState(), { ...idle, jump: true }, DT, flat);
    const vyAfterFirst = s.vy;
    s = updatePlayer(s, { ...idle, jump: true }, DT, flat);
    expect(s.vy).toBeLessThan(vyAfterFirst);   // gravity only; no re-launch
  });
});

describe('interaction with boxes', () => {
  const platform: Box = { minX: 1, minY: 0, minZ: -1, maxX: 3, maxY: 0.3, maxZ: 1 };
  const wall: Box     = { minX: 1, minY: 0, minZ: -1, maxX: 3, maxY: 2.0, maxZ: 1 };

  it('steps up onto a low platform while walking', () => {
    const world = new CollisionWorld([platform]);
    // 30 steps = 0.5 s at WALK_SPEED 4 → x ≈ 2, the platform's center
    const s = simulate(world, { ...idle, dirX: 1 }, 30);
    expect(s.x).toBeCloseTo(2, 1);
    expect(s.y).toBeCloseTo(0.3, 5);
    expect(s.onGround).toBe(true);
  });

  it('is blocked by a tall wall', () => {
    const world = new CollisionWorld([wall]);
    const s = simulate(world, { ...idle, dirX: 1 }, 120);
    expect(s.x).toBeCloseTo(1 - 0.4, 3);       // wall face minus PLAYER_RADIUS
  });

  it('walking off a platform falls to the ground', () => {
    const world = new CollisionWorld([platform]);
    let s = createPlayerState(2, 0.3, 0);      // standing on the platform
    s = simulate(world, { ...idle, dirX: 1 }, 120, s);
    expect(s.x).toBeGreaterThan(3.4);          // walked past the edge
    expect(s.y).toBe(0);
    expect(s.onGround).toBe(true);
  });
});
