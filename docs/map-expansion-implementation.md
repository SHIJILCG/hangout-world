# Expanded meadow implementation

The subsequent [forest vegetation pass](forest-regions.md) adds dense oak, pine
and birch areas, replacing the sparse woodland described in the original results
below. Its tree counts and vegetation details supersede the original expansion counts.

The playable world is **480 × 480m**, with bounds ±240m, 256 sections of 30m,
and terrain/collision sampling every 1.5m. `shared/world.json` supplies dimensions,
streaming profiles, and spawn pads to the generator, client and server.

## Places and assets

The original plaza/village connects to an outer road loop with an orchard farm,
northern woodland, old stone courtyard, and a riverside clearing. New regional
scenery includes 10 apple trees, 59 woodland trees, 30 fence modules, 43 rocks,
four lantern landmarks, ten wall modules, an open arch, 15 flagstone modules,
and 1,601 grass clumps. Placement uses the generated road curves to exclude
blocking objects from roads. Grounding follows the same collision height field.

Eight asset types were exported from the supplied local `three-low-poly` 1.2.7
library. GLBs and ISC attribution are in `client/public/environment-expansion`.
The exporter records seeds, bounds, sizes and triangle counts; the game and CI
use committed artifacts without requiring the Downloads folder. Trees and apple
trees have simplified variants. The grass now uses opaque tapered blades with
three detail levels rather than rectangular texture cards.

## Loading and memory

- Initial base map: **3,030,676 bytes**, consisting of the distant overview and
  four central detailed sections. This excludes application code, shared central
  character/environment assets, and HTTP compression.
- The complete collision height field is a separate **412,164-byte** Float32
  file; collision metadata/boxes add **90,741 bytes**. Movement waits for both.
  The large JSON height array is no longer part of production JavaScript.
- Low/Medium/High detail residency caps are 64/96/128 sections. Background loading
  has two concurrent requests, near-first priority, retries and delayed eviction.
  Coarse terrain remains available when detailed sections are missing.
- Regional template requests are also limited to two. Sections own instance
  buffers; shared asset templates use reference counts. Leaving the final section
  that uses a template releases its geometry and materials, including cancelled
  requests that finish after eviction.
- Distant terrain is merged into one indexed geometry; loading detail changes
  its visible index ranges. Backdrop pieces are also merged. Long river/flower
  geometry is clipped into the sections it occupies instead of assigned to one
  section by its center.
- Central legacy decorations remain bounded to the original village area and
  retain their existing distance/detail behavior. New regional decorations are
  created and destroyed with resident sections.

## Rebuild and inspect

```powershell
cd client
npm run generate:expansion-assets -- 'C:\Users\shiji\Downloads\medieval-characters-main\medieval-characters-main'
npm run generate:meadow
npm run build
npm test
npm run test:meadow
```

The exporter also accepts `MEDIEVAL_SOURCE`. Regenerate assets only when their
source/options change. Regenerate meadow artifacts together after changing world
dimensions, roads, regional placement or terrain. Generated JSON includes the full
height field for headless tests; production loads the binary copy.

Open `/environment-preview.html` on the running client for region buttons and a
live draw/triangle/section display. Drag to orbit and scroll to zoom. This preview
uses the same streaming, assets and collision as the multiplayer game and is also
included in the production build. `/meadow-preview.html` remains the standalone
base GLB viewer, which omits the runtime regional/character models.

`node scripts/expansion-smoke.mjs` drives an isolated browser on debugging port
9222. `ROUTE_CYCLES=3` runs repeated region visits and records memory counters,
timing, requests and screenshots to the OS temp directory. Multiplayer movement
can be checked separately with `node scripts/browser-smoke.mjs`.

## Validation and limits

The 360m intermediate stage passed all 19 original meadow checks and the browser
region route, with no runtime exceptions or failed requests. Its sampled views
ranged from 42–188 reported draws and 82,501–177,807 triangles. These observations
are not a controlled before/after FPS comparison.

The final 480m checks passed: 96 client tests, 44 server tests, 22 meadow checks,
and client/server builds. Current automated checks cover map/terrain bounds, slope, bridge traversal,
spawn clearance, binary height consistency, regional road clearance, clipped
surface area, collision indexing, template sharing/cancellation and section
eviction/retry. The optional browser preview supports repeatable region visits.

The final browser route visited all five locations three times with no runtime
errors or failed requests. It peaked at 92 resident sections, 173 reported draws,
and 160,943 triangles. Geometry and regional instance counts at every location
matched exactly between the second and third routes after warm-up. The report is
[map-expansion-browser.json](validation/map-expansion-browser.json).
The multiplayer browser checks at native DPR 1 and 2 also passed joining,
movement, jumping, all four graphics modes and section transitions without
runtime/network errors. Preset canvas dimensions were asserted at DPR 2. Timing
observations came from a headless browser while other checks were running and
should not be treated as a controlled device benchmark.

LODs change discretely. Slow downloads can show coarse terrain before scenery,
while collision remains available. Lanterns are decorative meshes; this pass does
not add day/night lighting, NPC behavior or furniture interactions. Small market
props such as jars/books were left for a later decoration pass. A controlled
device benchmark and a 20-player load test are still needed before claiming a
specific frame-rate improvement or increasing the room limit.
