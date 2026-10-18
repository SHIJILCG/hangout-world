# Dense forest performance measurements

These measurements use the production build served locally, with an isolated
headless Edge browser, extensions disabled, and no builds/test suites running
alongside the benchmark. The detected renderer is AMD Radeon Graphics through
ANGLE/Direct3D 11 on Windows. This measures the environment preview with a static
camera; avatars, voice, chat and multiplayer load are excluded.

The script waits for streaming to settle before each sample. Set
`BENCH_SAMPLE_MS=20000` for the repeated 20-second run recorded below. It
records average callback FPS, median/p95/p99 frame intervals, the fraction of
frames over 33ms, CPU frame submission time, draw/triangle counts, resident
sections and post-GC JavaScript heap size. CPU submission timing does not measure
asynchronous GPU completion. Renderer geometry/texture counts are allocation
counts, not GPU memory in bytes. Headless frame cadence may differ from a visible
browser and monitor refresh behavior.

The first run uses a disabled HTTP cache to measure local readiness. Later samples
use normal caching. Three locations are sampled at Low/Medium/High in 1280×720,
then at High in 1920×1080. High 720p revisits the same locations twice more to
compare allocation counts and heap after warm-up. The same camera positions and
pixel ratio 1 are used for each profile/resolution.

Reproduce with a production preview running on port 4173 and an isolated browser
on remote debugging port 9222:

```powershell
cd client
npm run build
node node_modules/vite/bin/vite.js preview --configLoader native --host 127.0.0.1 --port 4173
# In a second terminal, with the isolated browser already running:
$env:BENCH_SAMPLE_MS='20000'
node scripts/performance-benchmark.mjs
```

`BENCH_URL` can override the preview URL. The complete raw results are written to
[forest-performance.json](validation/forest-performance.json).

## Results

High 720p is the median of three 20-second samples per location. High 1080p
has one 20-second sample per location. Lower frame times are better.

| Location | High 720p FPS | p95 ms | High 1080p FPS | p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Village | 144.0 | 7.0 | 133.0 | 13.9 |
| North Woods | 144.0 | 7.0 | 118.6 | 13.9 |
| Pine Grove | 143.7 | 7.1 | 94.0 | 14.0 |

This run was paced near 144Hz at 720p and is substantially faster than the older
short run, so the FPS values must not be compared across those runs as a before/
after claim. Resolution still affects the pine view: High/1080p averaged about
94 FPS, with a 14ms p95. No sample had frames above 33.3ms. These are static
headless-preview results, not a player-device guarantee.

## Repeated travel

Allocation counts matched at every location between the last two High/720p routes.

| Location | Geometry counts | Texture counts | Post-GC JS heap MB |
| --- | ---: | ---: | ---: |
| Village | 154 to 154 | 1 to 1 | 9.91 to 9.91 |
| North Woods | 124 to 124 | 1 to 1 | 10.13 to 10.03 |
| Pine Grove | 103 to 103 | 1 to 1 | 9.46 to 9.49 |

This repeated route shows stable renderer allocation counts after warm-up. It does
not establish that long sessions cannot leak memory. Local initial readiness
with disabled HTTP cache was 0.60 seconds in this run; internet transfer was not simulated.

All 18 samples completed at 20 seconds each. There were no application exceptions
or failed world asset requests. The browser requested a missing favicon (404);
this cosmetic request is retained under ignoredRequests in the raw report.

For greater frame-rate headroom on this machine, High at 720p is preferable to
High at 1080p. The 1080p pine view is the next useful optimization target.
