import { CollisionWorld } from './collision';
import world from './world.json';

export const HORSE = {
  id: 'stable-horse', name: 'Chestnut', x: 23, z: -23, heading: Math.PI,
  walkSpeed: 4, trotSpeed: 9, acceleration: 9, turnRate: 2.2,
  radius: 0.4, halfLength: 0.95, height: 2.8, seatOrigin: 1.12,
  interactDistance: 3, inputTimeout: 350, seatOffset: 0, supportRange: 0.3,
  dismountSide: 1.5, dismountRear: 2,
} as const;
export type RideDefinition = { [K in keyof typeof HORSE]: K extends 'id' | 'name' ? string : number };
export const CART: RideDefinition = {
  ...HORSE, id: 'stable-cart', name: 'Orchard cart', x: 12, z: -32, heading: 0,
  walkSpeed: 3, trotSpeed: 5.5, acceleration: 4, turnRate: 0.75,
  radius: 0.95, halfLength: 2.7, height: 3, seatOrigin: 0.65, seatOffset: -1,
  interactDistance: 4, supportRange: 0.65, dismountSide: 2.1, dismountRear: 4,
};
export const RIDE_DEFINITIONS: readonly RideDefinition[] = [HORSE, CART];
export function rideDefinition(id: string | undefined): RideDefinition | undefined {
  return RIDE_DEFINITIONS.find(definition => definition.id === id);
}
export function riderPose(p: RidePose, definition: RideDefinition = HORSE) {
  return { x: p.x + Math.sin(p.heading) * definition.seatOffset,
    y: p.y + definition.seatOrigin, z: p.z + Math.cos(p.heading) * definition.seatOffset, heading: p.heading };
}
export interface RidePose { x: number; y: number; z: number; heading: number; speed: number }
export interface RideInput { dirX: number; dirZ: number; run: boolean }
export const STOP: RideInput = { dirX: 0, dirZ: 0, run: false };
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b-a), Math.cos(b-a));

/** Overlapping ground probes cover the horse's length and turning sweep. */
export function rideSupport(p: RidePose, collision: CollisionWorld, definition: RideDefinition = HORSE): number | null {
  const heights: number[] = [];
  const probes = Math.ceil(definition.halfLength / definition.radius) * 2;
  for (let i = 0; i <= probes; i++) {
    const offset = (2 * i / probes - 1) * definition.halfLength;
    const x = p.x + Math.sin(p.heading)*offset, z = p.z + Math.cos(p.heading)*offset;
    if (Math.max(Math.abs(x), Math.abs(z)) > world.half - 1) return null;
    const y = collision.supportHeightAt(x, z, p.y, definition.radius);
    // Stop at water, ledges and steep slopes. Bridge support takes precedence.
    if (y < -0.12 || Math.abs(y-p.y) > definition.supportRange) return null;
    const clear = collision.resolveHorizontal(x, z, y, definition.radius, definition.height);
    if (Math.hypot(clear.x-x, clear.z-z) > 0.001) return null;
    heights.push(y);
  }
  if (Math.max(...heights)-Math.min(...heights) > definition.supportRange * 2) return null;
  const center = heights[probes / 2];
  return Math.abs(center - p.y) <= 0.3 ? center : null;
}

export function stepRide(p: RidePose, input: RideInput, dt: number, collision: CollisionWorld, definition: RideDefinition = HORSE): RidePose {
  const next = { ...p };
  const length = Math.hypot(input.dirX, input.dirZ);
  const moving = length > 0.01;
  const desired = moving ? Math.atan2(input.dirX, input.dirZ) : p.heading;
  const turn = Math.max(-definition.turnRate*dt, Math.min(definition.turnRate*dt, angleDelta(p.heading, desired)));
  next.heading = p.heading + turn;
  const target = moving ? (input.run ? definition.trotSpeed : definition.walkSpeed) * Math.max(0,Math.cos(angleDelta(next.heading,desired))) : 0;
  next.speed += Math.max(-definition.acceleration*dt, Math.min(definition.acceleration*dt, target-next.speed));
  const steps = Math.max(1,Math.ceil(next.speed*dt/0.12));
  for (let i=0; i<steps; i++) {
    const candidate = { ...next, x: next.x+Math.sin(next.heading)*next.speed*dt/steps, z: next.z+Math.cos(next.heading)*next.speed*dt/steps };
    const support = rideSupport(candidate,collision,definition);
    if (support===null) return { ...p, speed: 0 };
    next.x=candidate.x; next.z=candidate.z; next.y=support;
  }
  return next;
}

export function dismountSpot(p: RidePose, collision: CollisionWorld, definition: RideDefinition = HORSE): {x:number;y:number;z:number} | null {
  for (const offset of [Math.PI/2,-Math.PI/2,Math.PI]) {
    const distance = offset===Math.PI ? definition.dismountRear : definition.dismountSide;
    const x=p.x+Math.sin(p.heading+offset)*distance, z=p.z+Math.cos(p.heading+offset)*distance;
    const y=collision.supportHeightAt(x,z,p.y,0.4);
    if (Math.max(Math.abs(x),Math.abs(z))>world.half-1 || y < -0.12 || Math.abs(y-p.y)>0.35) continue;
    const resolved=collision.resolveHorizontal(x,z,y,0.4,1.7);
    if (Math.hypot(resolved.x-x,resolved.z-z)<0.001) return {x,y,z};
  }
  return null;
}
