export const MIN_PITCH = 0.05;
export const MAX_PITCH = 1.2;
export const MIN_DIST = 2;
export const MAX_DIST = 10;

const DRAG_SENSITIVITY = 0.005;   // radians per px
const ZOOM_SENSITIVITY = 0.002;   // distance units per wheel deltaY
const HEAD_OFFSET = 1.5;          // aim above the feet, at head height

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export class OrbitCamera {
  yaw = 0;
  pitch = 0.4;
  distance = 6;

  applyDrag(dx: number, dy: number): void {
    this.yaw -= dx * DRAG_SENSITIVITY;
    this.pitch = clamp(this.pitch + dy * DRAG_SENSITIVITY, MIN_PITCH, MAX_PITCH);
  }

  applyZoom(deltaY: number): void {
    this.distance = clamp(this.distance + deltaY * ZOOM_SENSITIVITY, MIN_DIST, MAX_DIST);
  }

  offset(): { x: number; y: number; z: number } {
    const horiz = this.distance * Math.cos(this.pitch);
    return {
      x: Math.sin(this.yaw) * horiz,
      y: HEAD_OFFSET + this.distance * Math.sin(this.pitch),
      z: Math.cos(this.yaw) * horiz,
    };
  }

  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  right(): { x: number; z: number } {
    const f = this.forward();
    return { x: -f.z, z: f.x };
  }
}
