export interface Box {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export interface HeightGrid {
  min: number;       // world coord of heights[0] in both x and z
  step: number;      // grid spacing
  size: number;      // samples per side
  heights: number[]; // row-major, z-then-x: heights[zi * size + xi] at (min+xi*step, min+zi*step)
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
  constructor(private boxes: Box[], private ground: number | HeightGrid = 0) {}

  groundAt(x: number, z: number): number {
    const g = this.ground;
    if (typeof g === 'number') return g;

    const { min, step, size, heights } = g;
    const fx = Math.max(0, Math.min(size - 1, (x - min) / step));
    const fz = Math.max(0, Math.min(size - 1, (z - min) / step));

    const xi0 = Math.floor(fx);
    const zi0 = Math.floor(fz);
    const xi1 = Math.min(size - 1, xi0 + 1);
    const zi1 = Math.min(size - 1, zi0 + 1);

    const tx = fx - xi0;
    const tz = fz - zi0;

    const h00 = heights[zi0 * size + xi0];
    const h10 = heights[zi0 * size + xi1];
    const h01 = heights[zi1 * size + xi0];
    const h11 = heights[zi1 * size + xi1];

    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  }

  supportHeightAt(x: number, z: number, footY: number, radius: number): number {
    let support = this.groundAt(x, z);
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
