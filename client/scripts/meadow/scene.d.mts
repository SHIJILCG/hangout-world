// Minimal ambient types for scene.mjs so tests can import it under strict
// TypeScript without pulling the whole generator pipeline into `tsc`'s
// program (scripts/meadow/*.mjs is intentionally outside tsconfig's
// "include" — this sibling declaration file is the standard way to type a
// plain JS/ESM module without enabling allowJs for the whole directory).

export declare const SPEC: Readonly<{
  seed: number;
  playableHalf: number;
  emptyRadius: number;
  riverWidth: number;
  bridgeCenter: number;
  bridgeHeight: number;
  bridgeRise: number;
  ruinRise: number;
  maxTriangles: number;
}>;

export declare function riverV(x: number, z: number): number;
export declare function bridgePoint(v: number, u?: number): [number, number];
export declare function groundHeight(x: number, z: number): number;
export declare function pathDistance(x: number, z: number): number;
export declare function buildMeadow(): {
  meshes: Array<{ name: string; geometry: unknown; extras: Record<string, unknown> }>;
  spec: typeof SPEC;
};
