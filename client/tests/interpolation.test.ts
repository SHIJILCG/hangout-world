import { describe, it, expect } from 'vitest';
import { stepToward, shortestAngleDelta, SNAP_DISTANCE, type Pose } from '../src/net/interpolation';

const at = (x: number, z: number, heading = 0): Pose => ({ x, y: 0, z, heading });

describe('shortestAngleDelta', () => {
  it('returns the direct difference for small angles', () => {
    expect(shortestAngleDelta(0.2, 0.5)).toBeCloseTo(0.3, 5);
    expect(shortestAngleDelta(0.5, 0.2)).toBeCloseTo(-0.3, 5);
  });
  it('wraps across the ±π seam', () => {
    // from 3.0 to -3.0 the short way is +0.283 (through π), not -6.0
    expect(shortestAngleDelta(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6.0, 5);
    expect(shortestAngleDelta(-3.0, 3.0)).toBeCloseTo(-(2 * Math.PI - 6.0), 5);
  });
});

describe('stepToward', () => {
  it('moves toward the target without overshooting', () => {
    const next = stepToward(at(0, 0), at(1, 0), 1 / 60);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(1);
  });
  it('converges to the target within a second', () => {
    let p = at(0, 0);
    const target = at(2, -1, 1.0);
    for (let i = 0; i < 60; i++) p = stepToward(p, target, 1 / 60);
    expect(p.x).toBeCloseTo(2, 1);
    expect(p.z).toBeCloseTo(-1, 1);
    expect(p.heading).toBeCloseTo(1.0, 1);
  });
  it('snaps instantly when the target is far (teleport)', () => {
    const next = stepToward(at(0, 0), at(SNAP_DISTANCE + 1, 0), 1 / 60);
    expect(next.x).toBe(SNAP_DISTANCE + 1);
  });
  it('interpolates heading across the ±π seam the short way', () => {
    const next = stepToward(at(0, 0, 3.1), at(0, 0, -3.1), 1 / 60);
    // must move toward +π (increasing), not down through 0
    expect(next.heading).toBeGreaterThan(3.1);
  });
  it('is stable at the target (no drift)', () => {
    const p = at(1, 1, 0.5);
    const next = stepToward(p, at(1, 1, 0.5), 1 / 60);
    expect(next).toEqual(p);
  });
});
