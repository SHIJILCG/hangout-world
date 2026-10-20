# Fuller grass validation — 2026-10-20

This report covers the restored coverage after the initial grass optimization
looked too sparse. The earlier report remains historical.

## Current implementation

- Keep the existing terrain material and its baked color variation.
- Keep all deterministic placement coordinates and road/water exclusions.
- Nearby clumps use broader blades, two low leaves and baked green vertex colors.
- Share geometry and opaque materials, with 6/4/2 triangles per clump.
- Keep full instance density at near and middle detail, then half at far detail.
- Select detail at 28/52/75 m from section centres, scaled by quality.
- No grass wind shader, transparency, additional textures or shadow casting.
- Collision, player movement, networking and horse/cart behavior are unchanged.

## Method and limitations

Compare the original grass at commit `eb3ca8f` against the current fuller version.
Both frozen production builds include the same opt-in preview benchmark harness.
Three 20-second samples per version at each of four identical cameras; reverse
version order on the middle cycle. Warm streaming and collect garbage before
sampling. No builds or test suites run during samples.

Hardware: AMD Radeon graphics via ANGLE Direct3D11, headless Chrome 155,
1280 x 720, DPR 1, High quality. Today's browser ran near a 144 FPS ceiling.
Yesterday's 60 FPS results are not the comparison baseline for this run.

The harness renders three animated avatars driven by three real Colyseus
connections, rebasing replicated positions into each view. A fourth live player
was present in the shared room during these measurements. The live game can
compete for GPU/CPU resources. This is a local preview comparison, not a fully
isolated full-game or full-room load test. Voice/chat and ride rendering are not
included. CPU submission time excludes asynchronous GPU completion.

Acceptance: no more than 5% median mean-frame-time regression at each camera;
approximately 200 draws / 200k submitted triangles. FPS near a refresh ceiling
does not establish spare GPU headroom on other devices.

## Validation files

- Raw samples: [grass-full-performance.json](validation/grass-full-performance.json).
- Matched screenshots: `validation/grass-full-before-*.png` and
  `validation/grass-full-after-*.png`.
- Source: `client/src/world/grass.ts`, `environmentAssets.ts`, `regionalAssets.ts`.
- Tests: `client/tests/grass.test.ts`, `regionalAssets.test.ts`.
- Harness: `client/src/worldPreview.ts`, `client/src/benchmark/grassScene.ts`,
  `client/scripts/grass-benchmark.mjs`.

Client tests: **108/108 passed**. Production build including TypeScript: **passed**.
The coverage tests verify full/full/half density, static transforms, deterministic
geometry, opaque shared materials, quality scaling and the updated distance bands.

## Reproduction

With baseline preview on 4175, fuller preview on 4176, local multiplayer server
on 2567 and isolated Chrome CDP on 9234, run from `client` in PowerShell:

```powershell
$env:BENCH_CYCLES='3'
$env:BENCH_AFTER_URL='http://127.0.0.1:4176'
$env:BENCH_REPORT='grass-full-performance.json'
$env:BENCH_SHOT_PREFIX='grass-full'
$env:BENCH_PLACES_JSON='[{"name":"Open meadow","x":-48,"z":-55,"yaw":0},{"name":"Village","x":-10,"z":17,"yaw":0.4},{"name":"Riverbank","x":18,"z":35,"yaw":-0.8},{"name":"Forest clearing","x":-25,"z":-174,"yaw":0}]'
node scripts/grass-benchmark.mjs
```

## Measured results

Medians of three samples per location/version; arrows mean original -> fuller.

| View | FPS | Mean frame ms | p95 ms | Draws | Triangles | Heap MiB | Frame-time change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Open meadow | 143.75 -> 143.80 | 6.957 -> 6.954 | 7.1 -> 7.1 | 174 -> 174 | 92685 -> 93525 | 14.312 -> 14.319 | -0.035% |
| Village | 143.90 -> 143.40 | 6.949 -> 6.974 | 7.1 -> 7.1 | 174 -> 174 | 195235 -> 196085 | 14.234 -> 14.240 | 0.350% |
| Riverbank | 142.95 -> 143.90 | 6.995 -> 6.949 | 7.1 -> 7.1 | 172 -> 172 | 98128 -> 98638 | 14.419 -> 14.428 | -0.660% |
| Forest clearing | 143.95 -> 143.95 | 6.947 -> 6.947 | 7.0 -> 7.0 | 114 -> 115 | 91625 -> 91659 | 14.511 -> 14.507 | 0.001% |

| View | CPU submission ms | p99 ms | Geometries | Textures |
| --- | --- | --- | --- | --- |
| Open meadow | 3.396 -> 4.038 | 7.1 -> 7.1 | 152 -> 152 | 52 -> 52 |
| Village | 3.890 -> 4.831 | 7.1 -> 7.1 | 165 -> 165 | 52 -> 52 |
| Riverbank | 3.663 -> 3.973 | 7.2 -> 7.1 | 193 -> 193 | 52 -> 52 |
| Forest clearing | 3.146 -> 3.665 | 7.1 -> 7.1 | 165 -> 165 | 52 -> 52 |

**Decision: retain the fuller coverage.** The maximum median frame-time regression
was 0.350% in the village, below the 5% gate. Forest frame timing was effectively
neutral. All views remained under 200 draws / 200k triangles. All 24 samples
completed with no recorded browser exceptions or failed asset responses and no
frames over 33.34 ms.

There is measurable cost: median CPU submission increased by approximately
0.31-0.94 ms, and submitted triangles increased by 34-850. Draws stayed unchanged
except for one additional forest draw. Individual p99 samples reached 13.7-13.9 ms
in both baseline and changed runs, although median p99 remained near 7.1 ms.
These results support the local frame-time gate, not a claim of zero cost or an
FPS improvement. GPU completion timing was not measured.

Median post-GC JavaScript heap changes ranged from -0.004 to +0.009 MiB.
Median geometry and texture counts were unchanged; individual texture counts
varied from 50 to 52 in the after runs. These are whole-scene allocation proxies,
not GPU-memory byte measurements or a long-duration memory-leak test.

Compared with the rejected sparse configuration, the restored settings retain
more grass at medium and far distances. Inspection of the matched meadow
screenshots confirms distant patches are present. This retains the existing
patch-based layout; it does not add a continuous carpet of grass.
