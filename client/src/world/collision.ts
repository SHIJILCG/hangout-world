export interface Box {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export const STEP_HEIGHT = 0.35;

function circleOverlapsBox(x: number, z: number, radius: number, b: Box): boolean {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

export class CollisionWorld {
  constructor(private boxes: Box[], private groundY = 0) {}

  supportHeightAt(x: number, z: number, footY: number, radius: number): number {
    let support = this.groundY;
    for (const b of this.boxes) {
      if (b.maxY <= footY + STEP_HEIGHT + 1e-6 &&
          b.maxY > support &&
          circleOverlapsBox(x, z, radius, b)) {
        support = b.maxY;
      }
    }
    return support;
  }

  resolveHorizontal(x: number, z: number, footY: number, radius: number, height: number): { x: number; z: number } {
    for (const b of this.boxes) {
      const blocksBody = b.maxY > footY + STEP_HEIGHT && b.minY < footY + height;
      if (!blocksBody || !circleOverlapsBox(x, z, radius, b)) continue;

      // Penetration depth on each axis for the circle's center vs the
      // box expanded by radius; push out along the shallower axis.
      const pushLeft = x - (b.minX - radius);
      const pushRight = (b.maxX + radius) - x;
      const pushBack = z - (b.minZ - radius);
      const pushFront = (b.maxZ + radius) - z;
      const px = Math.min(pushLeft, pushRight);
      const pz = Math.min(pushBack, pushFront);
      if (px <= pz) {
        x = pushLeft <= pushRight ? b.minX - radius : b.maxX + radius;
      } else {
        z = pushBack <= pushFront ? b.minZ - radius : b.maxZ + radius;
      }
    }
    return { x, z };
  }
}
