# Environment performance plan

The original performance pass below covered the 240m map. The world is now 480m;
see [current implementation notes](map-expansion-implementation.md) for updated
payload sizes, streaming behavior, assets and validation results.

Implement in this order:

1. Generate 30m map chunks, merge static geometry within each chunk, omit replaced houses/bridge pieces, and provide coarse terrain while detail streams. Bound concurrent requests, retry failed sections, and unload distant geometry.
2. Partition environment instances into the same grid. Use existing asset LODs, reduced grass density with distance, and a simplified cottage asset.
3. Add graphics presets and adaptive pixel ratio, player-centered shadows, and optional frame-time/render counters.
4. Index collision boxes in a spatial grid while retaining collision order. Reduce animation frequency for distant players and reuse parsed character templates.
5. Compile the client and document generated artifacts, controls, and limits. Actual frame-rate gains require browser/device profiling.

Keep the 240m layout, authoritative movement rules, and full collision height field. Streaming affects visual detail; collision remains available before movement. No map expansion or publication in this pass.

## Implemented

- 64 generated 30m sections, with terrain and scenery merged separately. Replaced house and bridge geometry is omitted from these runtime files. The original monolithic GLB remains available for the existing asset preview and generator validation.
- A 7,077-triangle overview (including seam skirts and backdrop) stays available while detailed sections load. Four central sections load before joining. Background loading uses two concurrent requests, nearest first, a 35m prefetch margin, retry delays, and delayed eviction beyond the active radius plus 60m.
- Grass has 4,998 seeded placements instead of 14,994 overlapping instances. Section detail bands use existing grass LODs and 100% / 50% / 33% density, then hide distant grass. Pines use their existing three LODs. Cottage LOD drops from 20,706 to 6,790 triangles. Other assets retain their source geometry with distance culling.
- Shared source geometry/materials across instance batches; 36 cloud meshes combined into one instanced draw. Collision uses 8m grid buckets with ordered candidate queries and re-querying after pushes.
- Cached parsed character templates with separate skeletons per avatar. Distant character animation runs at 20/10 Hz and characters beyond 150m are hidden. Physics catch-up is capped at five fixed steps per rendered frame.
- Player-centered 96m shadow coverage; 1024px shadows on Low and 2048px otherwise. Auto adjusts pixel ratio between 0.75 and the smaller of native DPR/1.75, using sustained frame-time windows. Fixed Low/Medium/High are available in Graphics. Show performance displays frame timing, draws, triangles, DPR, and section counts.

## Generated sizes and compilation

The overview plus four starting sections is **3,605,808 bytes**, compared with
**9,289,812 bytes** for the former base-map download. These figures exclude shared
environment models, character assets, application code, and HTTP compression.
All detailed sections total 9,960,428 bytes; streaming reduces startup and active
geometry rather than the sum of every downloadable file. Skirts add geometry to
cover boundaries between coarse and detailed terrain.

Regenerate after editing the world:

```sh
cd client
npm run generate:meadow
npm run generate:cottage-lod
npm run build
```

The client TypeScript/production build and meadow validation pass. Follow-up
testing covers 93 client tests, 44 server tests, and 19 meadow checks. Added tests
compare 5,000 spatial collision/support queries with the exhaustive algorithm,
exercise streaming concurrency/eviction/retry, and cover graphics presets.
The server reconnection test now waits for its server-side disconnect handler
before reconnecting, avoiding a race in the test harness.

`node scripts/browser-smoke.mjs` exercises a running localhost client/server using
a separate Edge/Chrome instance on debugging port 9222. Set `TEST_DPR=2` to check
high-density display presets. It joins, exercises graphics controls, runs in three
directions, jumps, captures screenshots into the OS temp directory, checks failed
requests/runtime exceptions, and leaves the room. Browser runs at DPR 1 and 2
completed without runtime exceptions or failed requests. Section counts fell
from 63 to 36 during travel at DPR 1, demonstrating eviction. Preset render sizes
were 1280×720, 1920×1080, and 2560×1440 at native DPR 2.

Observed headless frame rates were roughly 60–90 FPS at DPR 1 and 39–76 FPS during
the DPR 2 preset/travel run. These are smoke-test observations, not a controlled
before/after benchmark; browser extensions and concurrent build processes also
ran during the second capture. No microphone/voice or broad multiplayer load test
was performed. The Vite large JavaScript bundle warning remains.

## Practical limits

Shared environment templates and the full collision manifest still load at join.
Only base-map sections are downloaded and evicted by distance; vegetation batches
stay resident and switch visibility/detail. LOD transitions are discrete and can
be visible. Under slow connections or after teleporting, coarse terrain may appear
before detailed scenery; collision remains authoritative and available. Measure
on target devices using the Graphics readout before choosing a larger map size.
Visual inspection also shows that the existing grass source renders as rectangular
cards rather than shaped blades; that asset needs a separate visual refinement.
