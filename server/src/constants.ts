// MUST MATCH client values:
//   WORLD_HALF  ↔ client/src/world/map.ts
//   SPAWN       ↔ client/src/world/map.ts
// Any change here must be mirrored there (and vice versa).
export const WORLD_HALF = 30;
export const SPAWN = { x: 0, y: 0, z: 8 };

// Server-only tuning:
export const MAX_STEP = 1.5;   // max horizontal metres per move message (15 Hz)
export const MAX_SPEED = 10;   // m/s, run speed 8 + slack — must cover any legit client
export const MAX_Y = 10;       // max plausible height (jump apex ≈ 1.2 + stage 1.5)
export const COLOR_COUNT = 6;  // client's AVATAR_COLORS length
export const RECONNECT_GRACE_SECONDS = 15;
export const MAX_CLIENTS = 20;
export const MOVE_BUDGET_CAP = 3;  // metres of instantly-spendable movement (covers catch-up bursts)
export const CHAT_MAX_LENGTH = 200;  // chars per message after trim
export const CHAT_BURST = 3;         // instant messages before throttling
export const CHAT_REFILL_MS = 1000;  // one token back per second
