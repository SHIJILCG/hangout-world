// MUST MATCH client values:
//   WORLD_HALF  ↔ client/src/world/map.ts (meadow: 240x240 world)
//   SPAWN       ↔ client/src/world/map.ts
// Any change here must be mirrored there (and vice versa).
export const WORLD_HALF = 120;
export interface SpawnPoint { x: number; y: number; z: number }
export const SPAWN_POINTS: readonly SpawnPoint[] = [
  { x: 0, y: 0, z: 8 },
  { x: 1.9, y: 0, z: 8 },
  { x: 1.55, y: 0, z: 6.8 },
  { x: 0.6, y: 0, z: 5.8 },
  { x: -0.6, y: 0, z: 5.8 },
  { x: -1.55, y: 0, z: 6.8 },
  { x: -1.9, y: 0, z: 8 },
  { x: -1.55, y: 0, z: 9.2 },
  { x: -0.6, y: 0, z: 9.5 },
  { x: 0.6, y: 0, z: 9.2 },
] as const;
export const SPAWN: SpawnPoint = SPAWN_POINTS[0]!;

// Server-only tuning:
export const MIN_Y = -1;       // riverbed depth (wading allowed below surface; depth ≈ −0.8)
export const MAX_STEP = 1.5;   // max horizontal metres per move message (15 Hz)
export const MAX_SPEED = 10;   // m/s, run speed 8 + slack — must cover any legit client
export const MAX_Y = 10;       // max plausible height (jump apex ≈ 1.2 + stage 1.5)
export const COLOR_COUNT = 7;  // client's AVATAR_COLORS length
export const RECONNECT_GRACE_SECONDS = 15;
export const MAX_CLIENTS = 20;
export const MOVE_BUDGET_CAP = 3;  // metres of instantly-spendable movement (covers catch-up bursts)
export const CHAT_MAX_LENGTH = 200;  // chars per message after trim
export const CHAT_BURST = 3;         // instant messages before throttling
export const CHAT_REFILL_MS = 1000;  // one token back per second

// Social distances use horizontal world metres (the meadow is 240 x 240 m).
export const PROXIMITY = {
  chatRadius: 18,
  voiceRadius: 22,
} as const;
