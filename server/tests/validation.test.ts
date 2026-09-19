import { describe, it, expect } from 'vitest';
import { sanitizeName, clampColorIndex, validateMove, type Pose } from '../src/validation';
import { WORLD_HALF, MAX_STEP, MAX_Y } from '../src/constants';

describe('sanitizeName', () => {
  it('accepts a normal name, trimmed', () => {
    expect(sanitizeName('  Alice  ')).toBe('Alice');
  });
  it('collapses inner whitespace', () => {
    expect(sanitizeName('Ann   Lee')).toBe('Ann Lee');
  });
  it('truncates to 16 chars', () => {
    expect(sanitizeName('abcdefghijklmnopqrstuvwx')).toBe('abcdefghijklmnop');
  });
  it('falls back to Guest for short, empty, or non-string input', () => {
    expect(sanitizeName('a')).toBe('Guest');
    expect(sanitizeName('')).toBe('Guest');
    expect(sanitizeName(undefined)).toBe('Guest');
    expect(sanitizeName(42)).toBe('Guest');
  });
  it('falls back to Guest for profane names, case-insensitively', () => {
    expect(sanitizeName('FuckYou')).toBe('Guest');
    expect(sanitizeName('sHiThead')).toBe('Guest');
  });
});

describe('clampColorIndex', () => {
  it('passes valid indexes through', () => {
    expect(clampColorIndex(0)).toBe(0);
    expect(clampColorIndex(5)).toBe(5);
  });
  it('clamps/repairs invalid input to 0', () => {
    expect(clampColorIndex(99)).toBe(0);
    expect(clampColorIndex(-1)).toBe(0);
    expect(clampColorIndex(2.7)).toBe(0);
    expect(clampColorIndex('3')).toBe(0);
    expect(clampColorIndex(undefined)).toBe(0);
  });
});

describe('validateMove', () => {
  const at: Pose = { x: 0, y: 0, z: 8, heading: 0 };

  it('accepts a normal small step', () => {
    const next = validateMove(at, { x: 0.4, y: 0, z: 7.7, heading: 1.2 });
    expect(next).toEqual({ x: 0.4, y: 0, z: 7.7, heading: 1.2 });
  });
  it('returns current pose for garbage input', () => {
    expect(validateMove(at, null)).toEqual(at);
    expect(validateMove(at, 'x')).toEqual(at);
    expect(validateMove(at, { x: NaN, y: 0, z: 0, heading: 0 })).toEqual(at);
    expect(validateMove(at, { x: Infinity, y: 0, z: 0, heading: 0 })).toEqual(at);
    expect(validateMove(at, { x: 1, y: 0, z: 0 })).toEqual(at); // missing heading
  });
  it('clamps x/z to the world bounds', () => {
    const next = validateMove({ x: WORLD_HALF - 0.1, y: 0, z: 0, heading: 0 },
                              { x: WORLD_HALF + 50, y: 0, z: 0, heading: 0 });
    expect(next.x).toBe(WORLD_HALF);
  });
  it('clamps y to [0, MAX_Y] (displacement small enough not to trip the step cap)', () => {
    expect(validateMove(at, { x: 0, y: -5, z: 8, heading: 0 }).y).toBe(0);
    const nearTop: Pose = { x: 0, y: MAX_Y - 1, z: 8, heading: 0 };
    expect(validateMove(nearTop, { x: 0, y: 99, z: 8, heading: 0 }).y).toBe(MAX_Y);
  });
  it('caps horizontal teleports at MAX_STEP toward the target', () => {
    const next = validateMove(at, { x: 10, y: 0, z: 8, heading: 0 });
    expect(next.x).toBeCloseTo(MAX_STEP, 5);   // moved MAX_STEP toward x=10
    expect(next.z).toBeCloseTo(8, 5);
  });
  it('allows a full-speed run step untouched', () => {
    // 8 m/s at 15 Hz = 0.533 m
    const next = validateMove(at, { x: 0.53, y: 0, z: 8, heading: 0 });
    expect(next.x).toBeCloseTo(0.53, 5);
  });

  it('honors a custom horizontal displacement cap', () => {
    const next = validateMove(at, { x: 1, y: 0, z: 8, heading: 0 }, 0.2);
    expect(next.x).toBeCloseTo(0.2, 5);   // capped at custom maxStep, not MAX_STEP
  });

  it('lets a step under the custom cap through untouched', () => {
    const next = validateMove(at, { x: 0.1, y: 0, z: 8, heading: 0 }, 0.2);
    expect(next.x).toBeCloseTo(0.1, 5);
  });

  it('caps vertical displacement at the custom cap too', () => {
    const from: Pose = { x: 0, y: 0, z: 8, heading: 0 };
    const next = validateMove(from, { x: 0, y: 5, z: 8, heading: 0 }, 0.2);
    expect(next.y).toBeCloseTo(0.2, 5);   // clamped toward target, not jumped to 5
  });

  it('caps vertical displacement at MAX_STEP by default (no third arg)', () => {
    const from: Pose = { x: 0, y: 0, z: 8, heading: 0 };
    const next = validateMove(from, { x: 0, y: 5, z: 8, heading: 0 });
    expect(next.y).toBeCloseTo(MAX_STEP, 5);
  });

  it('defaults the third param to MAX_STEP when omitted (two-arg call unchanged)', () => {
    const next = validateMove(at, { x: 10, y: 0, z: 8, heading: 0 });
    expect(next.x).toBeCloseTo(MAX_STEP, 5);
  });
});
