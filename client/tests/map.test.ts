import { describe, it, expect } from 'vitest';
import { buildMap, WORLD_HALF, SPAWN } from '../src/world/map';
import { PLAYER_RADIUS } from '../src/player/controller';

describe('buildMap', () => {
  const map = buildMap();

  it('returns a group with children and a collision world', () => {
    expect(map.group.children.length).toBeGreaterThan(5);
    expect(map.collision).toBeDefined();
  });

  it('spawn point is on open ground', () => {
    expect(map.collision.supportHeightAt(SPAWN.x, SPAWN.z, 0, PLAYER_RADIUS)).toBe(0);
    const r = map.collision.resolveHorizontal(SPAWN.x, SPAWN.z, 0, PLAYER_RADIUS, 1.7);
    expect(r).toEqual({ x: SPAWN.x, z: SPAWN.z });
  });

  it('border walls push a player leaning into them back inside', () => {
    // Player center 0.2 m from the wall's inner face → footprint circle
    // (radius 0.4) overlaps the wall and must be pushed back inward.
    const edge = WORLD_HALF - 0.2;
    for (const [x, z] of [[edge, 0], [-edge, 0], [0, edge], [0, -edge]] as const) {
      const r = map.collision.resolveHorizontal(x, z, 0, PLAYER_RADIUS, 1.7);
      expect(Math.abs(r.x)).toBeLessThanOrEqual(WORLD_HALF - PLAYER_RADIUS + 1e-6);
      expect(Math.abs(r.z)).toBeLessThanOrEqual(WORLD_HALF - PLAYER_RADIUS + 1e-6);
    }
  });

  it('has at least one climbable platform reachable by stairs', () => {
    // The stage platform top must be reachable: some support exists at
    // each stair-step height. We just verify a raised support exists.
    let raised = false;
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 0.5) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 0.5) {
        if (map.collision.supportHeightAt(x, z, 5, PLAYER_RADIUS) > 0.5) raised = true;
      }
    }
    expect(raised).toBe(true);
  });
});
