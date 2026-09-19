import { describe, it, expect } from 'vitest';
import { OrbitCamera, MIN_PITCH, MAX_PITCH, MIN_DIST, MAX_DIST } from '../src/camera/orbit';

describe('OrbitCamera', () => {
  it('at yaw 0 sits behind the player (+z) and looks toward -z', () => {
    const cam = new OrbitCamera();
    const off = cam.offset();
    expect(off.x).toBeCloseTo(0, 5);
    expect(off.z).toBeGreaterThan(0);
    expect(off.y).toBeGreaterThan(0);
    const fwd = cam.forward();
    expect(fwd.x).toBeCloseTo(0, 5);
    expect(fwd.z).toBeCloseTo(-1, 5);
  });

  it('forward and right are unit length and perpendicular', () => {
    const cam = new OrbitCamera();
    cam.applyDrag(123, 45);
    const f = cam.forward();
    const r = cam.right();
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(1, 5);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1, 5);
    expect(f.x * r.x + f.z * r.z).toBeCloseTo(0, 5);
  });

  it('at yaw 0, right points toward +x', () => {
    const cam = new OrbitCamera();
    const r = cam.right();
    expect(r.x).toBeCloseTo(1, 5);
    expect(r.z).toBeCloseTo(0, 5);
  });

  it('clamps pitch', () => {
    const cam = new OrbitCamera();
    cam.applyDrag(0, 100000);
    expect(cam.pitch).toBe(MAX_PITCH);
    cam.applyDrag(0, -200000);
    expect(cam.pitch).toBe(MIN_PITCH);
  });

  it('clamps zoom distance', () => {
    const cam = new OrbitCamera();
    cam.applyZoom(100000);
    expect(cam.distance).toBe(MAX_DIST);
    cam.applyZoom(-200000);
    expect(cam.distance).toBe(MIN_DIST);
  });

  it('offset length matches distance (ignoring the head-height lift)', () => {
    const cam = new OrbitCamera();
    cam.applyDrag(300, 80);
    const off = cam.offset();
    const len = Math.hypot(off.x, off.y - 1.5, off.z);   // 1.5 = HEAD_OFFSET
    expect(len).toBeCloseTo(cam.distance, 5);
  });
});
