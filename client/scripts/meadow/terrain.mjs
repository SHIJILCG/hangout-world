export const TERRAIN_SEGMENTS = 160;
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
  const socialArea = smooth(16, 80, Math.hypot(x, z - 4));
  const bridgeApproach = smooth(10, 60, Math.hypot(x - 30, z - 30));
  const bridgeRoute = smooth(10, 70, segmentDistance(x, z, 30, 30, 120, 120));
  const ruinRoute = smooth(5, 90, segmentDistance(x, z, -20.1, -3.5, -20.1, -15.35));
  const terrainMask = socialArea * bridgeApproach * bridgeRoute * ruinRoute;
  const rolling = 0.28 * Math.sin(x * 0.052) * Math.cos(z * 0.047)
    + 0.15 * Math.sin(z * 0.083 + x * 0.036)
    + 0.07 * Math.cos(x * 0.105 - z * 0.071);
  const hills = 2.7 * gaussian(x, z, -68, -60, 28, 30)
    + 3.0 * gaussian(x, z, -52, 31, 24, 20)
    + 2.7 * gaussian(x, z, 40, -72, 26, 20)
    + 3.0 * gaussian(x, z, 58, -75, 24, 18)
    + 2.2 * gaussian(x, z, 5, -66, 36, 30)
    + 2.2 * gaussian(x, z, -62, 68, 14, 22)
    + 2.4 * gaussian(x, z, -96, -83, 25, 24)
    + 2.6 * gaussian(x, z, 91, 94, 26, 22)
    + 2.3 * gaussian(x, z, -104, 49, 24, 27)
    + 2.5 * gaussian(x, z, 52, -102, 28, 21)
    + 1.8 * gaussian(x, z, -8, 43, 55, 52)
    + 1.7 * gaussian(x, z, -49, 69, 54, 56)
    + 1.75 * gaussian(x, z, 55, 68, 58, 53)
    + 1.75 * gaussian(x, z, -83, -34, 56, 60)
    + 1.8 * gaussian(x, z, 18, -82, 58, 52)
    + 1.7 * gaussian(x, z, 91, 57, 54, 58)
    + 1.6 * gaussian(x, z, -96, 78, 52, 58);
  const pondBasin = 0.35 * gaussian(x, z, 26, -23, 13, 10);
  const landscape = clamp((rolling + hills - pondBasin) * terrainMask, -4.5, 4.5);

  const riverV = (x + z - 60) / Math.SQRT2;
  const riverU = (x - z) / Math.SQRT2;
  const broadBank = smooth(2, 50, Math.abs(riverV));
  const bridgeCauseway = (1 - smooth(3, 9, Math.abs(riverU)))
    * (1 - smooth(10, 15, Math.abs(riverV)));
  const plazaProtection = 1 - smooth(13.5, 42, Math.hypot(x, z));
  const bank = Math.max(broadBank, bridgeCauseway, plazaProtection);
  const riverFloor = smooth(0, 5, Math.abs(riverV));
  return 0.7 * landscape * bank - 0.6 * (1 - riverFloor) * (1 - bridgeCauseway);
}
