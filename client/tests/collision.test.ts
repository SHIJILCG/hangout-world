import { describe, it, expect } from 'vitest';
import { CollisionWorld, type Box } from '../src/world/collision';

const R = 0.4;   // player radius used in tests
const H = 1.7;   // player height used in tests

const platform: Box = { minX: 2, minY: 0, minZ: -1, maxX: 4, maxY: 0.3, maxZ: 1 };  // steppable
const wall: Box     = { minX: 6, minY: 0, minZ: -2, maxX: 7, maxY: 2.0, maxZ: 2 };  // blocking

describe('supportHeightAt', () => {
  it('returns ground height on open ground', () => {
    const w = new CollisionWorld([platform, wall]);
    expect(w.supportHeightAt(0, 0, 0, R)).toBe(0);
  });

  it('returns platform top when standing over a steppable box', () => {
    const w = new CollisionWorld([platform]);
    expect(w.supportHeightAt(3, 0, 0, R)).toBe(0.3);
  });

  it('counts the box when only the footprint edge overlaps it', () => {
    const w = new CollisionWorld([platform]);
    // player center just left of minX=2, but circle of radius R overlaps
    expect(w.supportHeightAt(2 - R / 2, 0, 0, R)).toBe(0.3);
  });

  it('ignores tops higher than footY + STEP_HEIGHT', () => {
    const w = new CollisionWorld([wall]);
    expect(w.supportHeightAt(6.5, 0, 0, R)).toBe(0);
  });

  it('can stand on a tall box when already at its level', () => {
    const w = new CollisionWorld([wall]);
    expect(w.supportHeightAt(6.5, 0, 2.0, R)).toBe(2.0);
  });
});

describe('resolveHorizontal', () => {
  it('does nothing in open space', () => {
    const w = new CollisionWorld([wall]);
    expect(w.resolveHorizontal(0, 0, 0, R, H)).toEqual({ x: 0, z: 0 });
  });

  it('pushes the player out of a blocking wall along x', () => {
    const w = new CollisionWorld([wall]);
    // player center just inside the wall's -x face
    const out = w.resolveHorizontal(6.1, 0, 0, R, H);
    expect(out.x).toBeCloseTo(6 - R, 5);
    expect(out.z).toBe(0);
  });

  it('does not push out of a steppable platform', () => {
    const w = new CollisionWorld([platform]);
    // platform top (0.3) is below footY + STEP_HEIGHT, so it is a floor, not a wall
    expect(w.resolveHorizontal(3, 0, 0, R, H)).toEqual({ x: 3, z: 0 });
  });

  it('does not collide with boxes entirely above the player', () => {
    const overhead: Box = { minX: -1, minY: 5, minZ: -1, maxX: 1, maxY: 6, maxZ: 1 };
    const w = new CollisionWorld([overhead]);
    expect(w.resolveHorizontal(0, 0, 0, R, H)).toEqual({ x: 0, z: 0 });
  });
});

describe('heightfield ground', () => {
  // 3x3 grid over [-1, 1]: a simple slope in x, flat in z.
  const grid = {
    min: -1, step: 1, size: 3,
    heights: [
      0, 0.5, 1,   // z = -1 row: x = -1, 0, 1
      0, 0.5, 1,   // z = 0
      0, 0.5, 1,   // z = 1
    ],
  };
  const w = new CollisionWorld([], grid);

  it('returns exact heights at grid nodes', () => {
    expect(w.groundAt(-1, -1)).toBe(0);
    expect(w.groundAt(0, 0)).toBe(0.5);
    expect(w.groundAt(1, 1)).toBe(1);
  });

  it('interpolates between nodes', () => {
    expect(w.groundAt(0.5, 0)).toBeCloseTo(0.75, 5);
    expect(w.groundAt(-0.5, 0.5)).toBeCloseTo(0.25, 5);
  });

  it('clamps outside the grid to the edge values', () => {
    expect(w.groundAt(5, 0)).toBe(1);
    expect(w.groundAt(-5, -5)).toBe(0);
  });

  it('supportHeightAt uses the heightfield as base support', () => {
    expect(w.supportHeightAt(0.5, 0, 1, 0.4)).toBeCloseTo(0.75, 5);
  });

  it('a box on sloped ground still wins when higher and steppable', () => {
    const box = { minX: -0.4, minY: 0, minZ: -0.4, maxX: 0.4, maxY: 0.7, maxZ: 0.4 };
    const world = new CollisionWorld([box], grid);
    expect(world.supportHeightAt(0, 0, 0.5, 0.4)).toBeCloseTo(0.7, 5); // 0.7 ≤ 0.5+0.35
  });

  it('flat-number ground still works (back-compat)', () => {
    const flat = new CollisionWorld([], 2);
    expect(flat.groundAt(12, -7)).toBe(2);
    expect(flat.supportHeightAt(12, -7, 2, 0.4)).toBe(2);
  });
});
