import { WORLD_HALF, MAX_STEP, MAX_Y, COLOR_COUNT, CHAT_MAX_LENGTH } from './constants';

const BANNED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'asshole',
  'dick', 'pussy', 'whore', 'slut', 'hitler', 'nazi', 'rape',
];

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Guest';
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 16);
  if (name.length < 2) return 'Guest';
  const lower = name.toLowerCase();
  if (BANNED_WORDS.some((w) => lower.includes(w))) return 'Guest';
  return name;
}

export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().slice(0, CHAT_MAX_LENGTH);
  return text.length > 0 ? text : null;
}

export function clampColorIndex(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return 0;
  return raw >= 0 && raw < COLOR_COUNT ? raw : 0;
}

export interface Pose { x: number; y: number; z: number; heading: number }

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function validateMove(current: Pose, target: unknown, maxStep: number = MAX_STEP): Pose {
  if (typeof target !== 'object' || target === null) return { ...current };
  const t = target as Record<string, unknown>;
  const nums = [t.x, t.y, t.z, t.heading];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ...current };
  }
  let x = clamp(t.x as number, -WORLD_HALF, WORLD_HALF);
  let z = clamp(t.z as number, -WORLD_HALF, WORLD_HALF);
  let y = clamp(t.y as number, 0, MAX_Y);
  const heading = t.heading as number;

  // Cap horizontal displacement at maxStep toward the target.
  const dx = x - current.x;
  const dz = z - current.z;
  const dist = Math.hypot(dx, dz);
  if (dist > maxStep) {
    const s = maxStep / dist;
    x = current.x + dx * s;
    z = current.z + dz * s;
  }

  // Cap vertical displacement at maxStep too, clamping y toward the target.
  const dy = y - current.y;
  if (Math.abs(dy) > maxStep) {
    y = current.y + Math.sign(dy) * maxStep;
  }

  return { x, y, z, heading };
}
