import { CollisionWorld } from '../world/collision';

export interface PlayerState {
  x: number; y: number; z: number;
  vy: number;
  onGround: boolean;
  heading: number;
}

export interface MoveInput {
  // world-space move direction; normalized internally, so any length is accepted
  dirX: number; dirZ: number;
  run: boolean;
  jump: boolean;
}

export const WALK_SPEED = 4;
export const RUN_SPEED = 8;
export const JUMP_SPEED = 7;
export const GRAVITY = -20;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.7;

export function createPlayerState(x = 0, y = 0, z = 0): PlayerState {
  return { x, y, z, vy: 0, onGround: true, heading: 0 };
}

export function updatePlayer(s: PlayerState, input: MoveInput, dt: number, world: CollisionWorld): PlayerState {
  const next = { ...s };

  // Horizontal move
  const len = Math.hypot(input.dirX, input.dirZ);
  if (len > 1e-6) {
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    const nx = input.dirX / len;
    const nz = input.dirZ / len;
    next.x += nx * speed * dt;
    next.z += nz * speed * dt;
    next.heading = Math.atan2(nx, nz);
  }
  const resolved = world.resolveHorizontal(next.x, next.z, s.y, PLAYER_RADIUS, PLAYER_HEIGHT);
  next.x = resolved.x;
  next.z = resolved.z;

  // Jump (only from the ground)
  if (input.jump && s.onGround) {
    next.vy = JUMP_SPEED;
    next.onGround = false;
  }

  // Gravity + vertical move
  next.vy += GRAVITY * dt;
  next.y += next.vy * dt;

  // Land / snap to the supporting surface (step detection uses the
  // pre-move foot height so we can step up but not teleport up walls).
  const support = world.supportHeightAt(next.x, next.z, s.y, PLAYER_RADIUS);
  if (next.vy <= 0 && next.y <= support) {
    next.y = support;
    next.vy = 0;
    next.onGround = true;
  } else {
    next.onGround = false;
  }

  return next;
}
