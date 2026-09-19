export interface Pose { x: number; y: number; z: number; heading: number }

export const SNAP_DISTANCE = 5;
export const SMOOTHING = 12;

export function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export function stepToward(current: Pose, target: Pose, dt: number): Pose {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  if (Math.hypot(dx, dz) > SNAP_DISTANCE) return { ...target };

  const k = 1 - Math.exp(-SMOOTHING * dt);
  return {
    x: current.x + dx * k,
    y: current.y + (target.y - current.y) * k,
    z: current.z + dz * k,
    heading: current.heading + shortestAngleDelta(current.heading, target.heading) * k,
  };
}
