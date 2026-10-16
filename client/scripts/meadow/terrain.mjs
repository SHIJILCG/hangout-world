export const TERRAIN_SEGMENTS = 128;
export const TERRAIN_SAMPLES = TERRAIN_SEGMENTS + 1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (start, end, value) => {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
};
const gaussian = (x, z, cx, cz, sx, sz) =>
  Math.exp(-((((x - cx) / sx) ** 2) + (((z - cz) / sz) ** 2)) * 0.5);
const segmentDistance = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / lengthSquared, 0, 1);
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};

export function groundHeight(x, z) {
  const socialArea = smooth(16, 30, Math.hypot(x, z - 4));
  const bridgeApproach = smooth(11, 26, Math.hypot(x - 30, z - 30));
  const bridgeRoute = smooth(10, 19, segmentDistance(x, z, 30, 30, 80, 80));
  const ruinRoute = smooth(5, 25, segmentDistance(x, z, -20.1, -3.5, -20.1, -15.35));
  const terrainMask = socialArea * bridgeApproach * bridgeRoute * ruinRoute;
  const rolling = 0.28 * Math.sin(x * 0.052) * Math.cos(z * 0.047)
    + 0.15 * Math.sin(z * 0.083 + x * 0.036)
    + 0.07 * Math.cos(x * 0.105 - z * 0.071);
  const hills = 2.7 * gaussian(x, z, -68, -60, 28, 30)
    + 3.0 * gaussian(x, z, -52, 31, 24, 20)
    + 2.7 * gaussian(x, z, 40, -72, 26, 20)
    + 3.0 * gaussian(x, z, 58, -75, 24, 18)
    + 2.2 * gaussian(x, z, 5, -66, 36, 30)
    + 2.2 * gaussian(x, z, -62, 68, 14, 22);
  const pondBasin = 0.35 * gaussian(x, z, 26, -23, 13, 10);
  const landscape = clamp((rolling + hills - pondBasin) * terrainMask, -3, 3);

  const riverV = (x + z - 60) / Math.SQRT2;
  const riverU = (x - z) / Math.SQRT2;
  const broadBank = smooth(2, 14, Math.abs(riverV));
  const bridgeCauseway = (1 - smooth(3, 9, Math.abs(riverU)))
    * (1 - smooth(10, 15, Math.abs(riverV)));
  const bank = Math.max(broadBank, bridgeCauseway);
  return landscape * bank - 0.6 * (1 - bank);
}
