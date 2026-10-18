# Northern terrain pilot

The first terrain pass adds two broad ridges to North Woods and the adjacent northern meadow, separated by a shallow saddle. Ridge centres are (-82, -183) at 6.32m and (65, -180) at 5.09m; the saddle at (-8, -160) is 1.99m. The change fades out before the village and eastern river corridor.

The existing 1.5m terrain grid, 30m sections, 15m distant terrain and residency limits are retained. The generated standalone mesh still has 236,209 triangles. Heights, section geometry, regional prop placements and collision data are regenerated together. Roads follow the same smooth terrain surface. No additional runtime terrain calculations or assets are introduced.

The 12-degree traversal slope requirement is retained. The world height envelope test increases from 4.5m to 7m to accommodate the northern ridges; this does not change the slope requirement. New tests require two visible ridges and a lower saddle. This is the northern preview only; orchard, riverbanks and ruins remain future regional passes.

Validation: all 24 meadow/expansion checks and the production build passed. The full quarter-metre terrain scan retains the 12-degree maximum traversal requirement. Browser screenshot: docs/validation/terrain-north-pilot.png. No controlled FPS comparison was performed for this terrain-only pass.

The approved pilot has now been extended to the remaining regions; see [regional terrain rollout](terrain-regions.md).
