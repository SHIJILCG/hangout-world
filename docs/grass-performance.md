# Grass appearance and performance

## Coverage adjustment (2026-10-20)

The initial optimization looked too sparse in play. Grass now retains full
instance density through the middle detail level and half density at the far
level, with section-centre boundaries of 28/52/75 m instead of 24/40/55 m.
Quality scaling, shared geometry, deterministic placement, opaque materials and
disabled grass shadows/wind remain. Existing test expectations were updated.
The adjustment passes the 108 client tests and production build. Its new
comparison is documented in [Fuller grass validation](grass-full-performance.md).
All measurements in the historical sections below describe the earlier, sparser
configuration and must not be quoted as performance of the fuller version.

## Scope and inspection

The current shared world is **480 x 480 m** (`shared/world.json`), larger than the
240 x 240 m mentioned in the request. Its size and collision data are preserved.

Primary ground coverage already uses opaque terrain materials with baked vertex
colors: biome blends, height and spatial variation, roads and forest floors.
There is no need for a new tiling texture or terrain shader. Fine terrain streams
in 30 m sections over an overview mesh. The renderer uses Three.js WebGL,
ACES tone mapping, soft shadow maps and quality-dependent residency.

Existing grass was already opaque instanced geometry, with 6/4/2 triangles per
clump. Central patches used seeded placement, shared geometry and section-based
distance selection. Regional patches used saved deterministic placements but
allocated every placement at every detail level and applied a wind vertex shader.
Grass did not normally cast shadows. Existing shrubs and small plants remain.

## Initial implementation (before the coverage adjustment)

- Preserve all terrain materials, terrain vertex colors, placement coordinates,
  road/water exclusions, physics and multiplayer code.
- Broaden close grass blades and replace two blades with low broad leaves, still
  using exactly 6/4/2 triangles. Bake dark bases and three subtle green tip colors
  into the shared geometry. No additional material, texture or draw per clump.
- Keep full nearby density; use deterministic nested half/quarter subsets farther
  away. Both loaders share 24/40/55 m detail boundaries, measured from section
  centres. Low/Medium quality scale those distances by 0.65/0.85.
- Remove regional grass wind deformation. All grass is opaque, static and cannot
  cast shadows, including when a catalog policy requests them.
- Retain section-level switching rather than introduce an alpha fade or per-frame
  instance rewriting. Detail transitions can remain visible while moving.

## Validation method

The unchanged grass build and changed grass build both include the same opt-in
benchmark harness. They are served from separate production output directories.
`client/scripts/grass-benchmark.mjs` controls an isolated headless Chrome browser
through local CDP port 9234; the local multiplayer server runs on port 2567.

- AMD Radeon graphics through ANGLE Direct3D11, hardware rendering.
- 1280 x 720, DPR 1, High quality, identical fixed cameras and warm-up.
- Open meadow (-48,-55), village (-10,17), riverbank (18,35), North Woods (-30,-160).
- Three real Colyseus clients and three animated avatars. Replicated positions
  are rebased into each benchmark view; these are preview rendering measurements,
  not full gameplay, voice/chat, ride rendering or WAN/load-test measurements.
- Three 20-second samples per view/version, reversing version order on the second
  cycle. Builds and tests are not run during sampling.
- FPS and frame intervals use requestAnimationFrame. CPU submission time does not
  include asynchronous GPU completion. This browser is capped near 60 FPS.
- Draws/triangles use renderer.info; heap is JavaScript heap after explicit GC.
  Geometry and texture counts are allocation proxies, not GPU memory bytes.
- Acceptance: no more than 5% median frame-time regression per location, neutral
  forest timing, and roughly 200 draws / 200k triangles for these views.

## Main results (2026-10-19)

Each value is the median of three samples; arrows mean before -> after.

| View | FPS | Mean frame ms | p95 ms | Draw calls | Triangles | Post-GC JS heap MiB |
| --- | --- | --- | --- | --- | --- | --- |
| Open meadow | 60.02 -> 60.02 | 16.662 -> 16.662 | 17.1 -> 17.0 | 174 -> 172 | 92,685 -> 92,481 | 14.198 -> 14.321 |
| Village | 60.02 -> 60.02 | 16.662 -> 16.662 | 17.0 -> 17.1 | 174 -> 169 | 195,235 -> 194,671 | 14.092 -> 14.228 |
| Riverbank | 60.02 -> 60.02 | 16.662 -> 16.662 | 17.0 -> 17.0 | 172 -> 169 | 98,128 -> 97,898 | 14.342 -> 14.405 |
| North Woods (obstructed camera) | 60.02 -> 60.02 | 16.662 -> 16.662 | 17.1 -> 17.0 | 126 -> 125 | 101,463 -> 101,359 | 14.698 -> 14.688 |
| Forest clearing (additional matched run) | 60.02 -> 60.02 | 16.662 -> 16.662 | 17.0 -> 17.0 | 114 -> 113 | 91,745 -> 91,625 | 13.957 -> 13.959 |

The largest median frame-time increase was 0.0015%, below the 5% gate. All these
views stayed below 200 draws / 200k triangles. This supports retaining the change
for this configuration; **it does not demonstrate higher FPS** at the browser cap.

Median CPU submission times were 5.53 -> 5.56 ms (meadow), 5.58 -> 5.67 ms
(village), 5.87 -> 5.85 ms (river), and 5.09 -> 4.99 ms (woods). Median p99 was
17.2 ms for all views/versions. One after river sample and one after woods sample
had a single frame over 33 ms; all other main samples had none.

Median heap changes ranged from -0.010 to +0.136 MiB. Allocation counts varied:
median geometries were 139 -> 148, 155 -> 164, 188 -> 193 and 178 -> 178;
median textures were 50 -> 52. Across individual runs textures ranged 48-52
before and 52 after. No new textures were added by the grass implementation;
these whole-scene allocation counts depend on loading/disposal timing. They are
not evidence of a GPU-memory improvement. Post-GC heap at the end of repeated
routes did not grow monotonically; this short run is not a long-duration leak test.

Stored regional instance totals (all props and all detail levels) fell from
3,591 -> 2,772, 2,178 -> 1,520, 2,309 -> 1,627 and 4,880 -> 3,892. This follows
from eliminating redundant distant grass transforms. Visible-group grass counts
in the raw JSON do not apply camera-frustum culling; use renderer draw/triangle
counts for submitted work.

**Limits:** the user requested the playable project be started during sampling.
The shared room grew from three benchmark peers to four total players during the
first after pass. The harness continued rendering its three controlled avatars,
but the extra room traffic and live game could contend for resources. Therefore
these timings are indicative local measurements, not a fully isolated device
certification. Raw samples include the observed player counts. The original
woods camera is partly blocked by a tree; an additional clearing view is recorded
separately. No claims are made about low-end/mobile devices, uncapped GPU time,
voice/chat, full rooms, or network latency.

Raw results: [main comparison](validation/grass-performance.json),
[forest clearing comparison](validation/grass-forest-performance.json),
[initial baseline](validation/grass-baseline.json). Matched screenshots are in
`docs/validation/grass-before-*.png` and `grass-after-*.png`.

The additional forest camera is (-25,-174), yaw 0, in the designed clearing.
Its six samples had no frames over 33 ms and no recorded errors. Median CPU
submission was 5.10 -> 4.95 ms, geometry counts 107 -> 111, textures 52 -> 52.
One baseline sample retained 65 sections instead of 67; subsequent samples and
all after samples retained 67. The table uses medians and the raw file preserves
this loading-history variation. All six had four total room players, including
the three controlled benchmark avatars.

Tests: client `npm.cmd test` passed **108/108**; production build including
TypeScript checks passed. Grass tests cover deterministic geometry, 6/4/2 triangle
budgets, shared opaque materials, nested density subsets, static transforms,
quality-dependent distance selection and no grass shadows. Existing collision,
movement, bridge/wading, ride and connection tests also passed. `git diff --check`
passed.

Server regression suite: **58/58 passed** with
`npm.cmd test -- --configLoader runner`. The default config loader first failed
because the sandbox denied an ancestor-directory read; the runner loader completed
successfully without changing server code.

## Files changed

Production grass changes: `client/src/world/grass.ts`,
`client/src/world/environmentAssets.ts`, `client/src/world/regionalAssets.ts`.

Validation: `client/tests/grass.test.ts`, `client/tests/regionalAssets.test.ts`,
`client/src/worldPreview.ts`, `client/src/benchmark/grassScene.ts`,
`client/scripts/grass-benchmark.mjs`, this report and `docs/validation/grass-*`.

The benchmark loads only with `environment-preview.html?grass-benchmark`; it is
not invoked by the playable game's entry point.

## Reproducing the comparison

Baseline grass source is commit `eb3ca8fbdcd2ca0967f327a15588d20be8b57809`.
Build that revision with the same preview/harness additions and serve its output
on 4175. Build the changed source separately and serve its output on 4176.
Keep the local multiplayer server running and an isolated hardware-enabled Chrome
with remote debugging on 9234. From `client`, run in PowerShell:

```powershell
$env:BENCH_AFTER_URL='http://127.0.0.1:4176'
$env:BENCH_CYCLES='3'
$env:BENCH_REPORT='grass-performance.json'
node scripts/grass-benchmark.mjs
```

Optional `BENCH_PLACES_JSON` overrides the camera list, `BENCH_QUALITY` selects
0/1/2 and `BENCH_SAMPLE_MS` changes sample duration (default 20,000 ms).
Avoid other GPU-heavy applications for a cleaner comparison. Do not overwrite
the baseline output when building the changed version.
