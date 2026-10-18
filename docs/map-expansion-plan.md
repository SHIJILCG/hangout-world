# Map expansion and local asset plan

Status: implemented at 480 × 480 metres after generating and checking the 360m
intermediate map. See [current implementation notes](map-expansion-implementation.md)
for shipped features, checks, measured payload sizes, and remaining limits.

## Target and sequence

Expand to **480 × 480 metres** (four times the area), in two releases:

1. Prove configurable dimensions and streaming at 360 × 360m (144 sections).
2. Expand to 480 × 480m (256 sections) after the performance and traversal gates pass.

Keep the existing central 240m layout and spawn positions. Preserve 30m sections
and 1.5m detailed terrain sampling. Render distance, shadow distance, and local
vegetation density must not increase with total map size. Expansion should add
places to explore rather than stretch existing buildings or terrain.

## Verified local source

`C:\Users\shiji\Downloads\medieval-characters-main\medieval-characters-main`

- `character-kit/models`: seven character GLBs already integrated into this game.
- `node_modules/three-low-poly`, version 1.2.7: procedural geometry and factories,
  with an ISC license. Candidate API names below were checked in the installed
  `dist/three-low-poly.d.ts` declarations. These are generators, not additional
  ready-made GLB files.
- Export selected models to standalone GLBs offline, record source/version/seed
  and license in CREDITS, and load them with the game's existing Three.js version.
  Do not require access to the Downloads directory at runtime or in CI. Make the
  export script accept a configurable source directory and commit its outputs.

## Useful additions, in priority order

| Priority | Confirmed local generator | Intended use | Integration work |
| --- | --- | --- | --- |
| 1 | `RusticFence`, `createWoodPicketFence`, `StoneFencePostGeometry` | Farm boundaries, paddocks, path entrances | Export short repeatable pieces; add simplified box collisions and gate openings. |
| 1 | `MossyRockGeometry`, `BoulderGeometry`, `scatterMossyRocks` | Riverbanks, woodland edges, small landmarks | Export 3–4 seeded variants; instance per section; collide only with larger rocks. |
| 1 | `DeciduousTree`, `ClearingTreeGeometry`, existing `AppleTree` | Woodland variety and expanded orchard | Export coarse/fine variants, unify scale and ground pivots, use trunk colliders. |
| 2 | `HangingLanternGeometry`, `CoachLanternGeometry` | Village entrances and a few road junctions | Use emissive surfaces first; avoid one shadow-casting point light per lantern. |
| 2 | `FlagstoneFloor`, `StoneWall`, `ArchGeometry` | Ruined courtyard, lookout, short footpaths | Export bounded modules with explicit walkable surfaces and step limits. |
| 2 | `createWindow`, `createArchedDoor`, `createDoubleDoor` | Add variation to existing cottages | Bake into cottage variants with LODs; cap materials and mesh count. |
| 3 | `ApothecaryJar`, `BookGeometry`, `BookshelfGeometry`, `DeskGeometry` | A small decorated market/apothecary corner | Nearby-only decorative props; share materials; no physics for tiny objects. |

Grass repair comes before adding more vegetation: the current imported grass
renders as rectangular cards. Create a small opaque blade/clump mesh with 2–3
LOD variants, or supply a verified alpha-cutout texture. No dedicated grass
generator was confirmed in the inspected local library, so budget this as custom
asset work. Benches, carts, barrels, wells and windmills are not assumed to exist
as ready-made assets in this folder.

## Proposed places

Coordinates are approximate design areas within the new ±240m bounds; final
placement must follow terrain slope, river continuity, and road clearance.

| Area | Approximate location | Contents and purpose |
| --- | --- | --- |
| Existing village/plaza | Central ±120m | Keep current meeting point; improve grass and cottage details first. |
| Orchard and farm | West, x=-210..-135 | Apple trees, rustic fences, field paths, one small gathering clearing. |
| Woodland trail | North, z=-210..-135 | Mixed trees, mossy rocks, looping walking route with clear sightlines. |
| Riverside clearing | East, x=135..210 | Follow the extended river, add bank stones, lantern markers and a picnic clearing. |
| Old courtyard/lookout | South, z=135..210 | Stone wall/arch modules, flagstones, accessible steps and a distant landmark. |

Connect these areas with a road loop and short branches from the existing road
ends. Keep buildings, fences, grass and tree trunks out of road and bridge
clearance envelopes. Decorative props do not imply new interaction systems.

## Implementation phases

### A. Remove fixed map assumptions

- Add a shared/generated world specification for dimensions, section size,
  terrain spacing, spawn locations, and render profiles. Make client/server bounds
  and generator constants derive from it.
- In `scripts/meadow/chunks.mjs`, replace the fixed `-4..3` section clamp with
  bounds derived from the specification. For 480m the valid indices are `-8..7`.
- Derive terrain segments: 160 now, 240 at 360m, 320 at 480m. Keeping 160 segments
  while expanding would reduce ground detail and change collision sampling.
- Parameterize valley-floor openings, sky/backdrop extent, river endpoints,
  road endpoints, placement exclusions and boundary walls. Audit hardcoded 116,
  120, 160, 180 and 240 values by meaning rather than blindly replacing numbers.
- Export the actual generated road paths/clearance data for vegetation placement;
  remove the separately maintained `STUDY_ROADS` approximation.
- Update legacy preview text, generator validation, and dimension-specific tests.
  Replace the old 90k whole-map triangle ceiling with per-section budgets plus
  a reported total. At 480m, detailed terrain alone has 204,800 triangles before
  scenery and seam skirts; the full world is not meant to render simultaneously.

### B. Bound loading and memory before adding area

- Keep the overview and four spawn sections as the initial base-map payload.
  Use a coarser distant overview or overview LODs so its cost does not quadruple
  with map area. Preserve matching borders and skirts.
- Keep two background section requests, distance-prioritized prefetch, retries,
  and eviction. Replace the loader's literal 180m discard radius with a value
  derived from the configured load/unload radii. Add a resident-section limit
  and evict the farthest eligible sections when traversal fills that budget.
- Move vegetation/prop placements into section manifests. Instantiate and release
  them with section residency; visibility-only culling currently retains every
  instance buffer. Cache asset templates with reference counts and dispose unused
  GPU resources safely. Deduplicate in-flight loads.
- Load decorative templates only when a section needs them. Include essential
  central buildings in the initial set; don't download every new regional prop
  just to enter the plaza.
- Move height samples out of the JavaScript bundle. At 480m, a 321×321 Float32
  height field is about 0.41MB before compression and remains reasonable to fetch
  once before movement. Keep full collision available independently of visual
  streaming; retain the existing collision spatial index.
- Add diagnostics for resident sections, instance counts and approximate geometry
  bytes alongside the current draw/triangle/frame-time display.

### C. Export, validate and place assets

- Build one reproducible export script using the supplied local source library.
  Record triangle counts, bounds, materials, scale, pivot and output byte sizes.
- Start with fences, rock variants and tree variants; repair grass in the same
  visual pass. Then add lanterns/ruins and finally small market props.
- Assign colliders from gameplay shape rather than detailed render meshes.
  Check door clearances, bridge approaches, fence gaps and maximum step height.
- Share opaque materials; merge static pieces within sections; instance repeated
  props. Keep transparent effects and animated decorations out of the first pass.

### D. Expand and validate in stages

1. Generate 360m terrain, road loop and two new areas; keep central terrain stable.
2. Measure a repeatable spawn-to-edge-to-spawn route with a fixed camera/profile.
3. Add the remaining areas and generate 480m only after the gates below pass.
4. Run all client/server/meadow tests plus section seams, map bounds, asset LOD,
   collision, failed-request/retry, rapid travel and repeated eviction tests.
5. Browser-check Low/Medium/High/Auto at native DPR 1 and 2, cold and warm cache,
   two simultaneous players, throttled downloads, and reconnect near a new edge.

## Acceptance gates (proposed budgets, not measured promises)

- No voids at section borders; no fall-through or invisible blocking geometry on
  normally loaded routes. Under delayed downloads, fallback terrain remains visible.
- Same central spawn, movement speed, voice/chat radius and 20-player room limit.
- Initial base-map transfer stays at or below approximately 4MB uncompressed;
  report shared assets, collision and JavaScript separately rather than hiding
  them in that figure.
- High profile resident detail target: at most 128 sections, including prefetch
  and eviction hysteresis; lower profiles use tighter limits. No monotonic growth
  in geometry/texture counts after three complete routes through all regions.
- Initial rendering targets: at most ~200 main-view draw calls and ~200k visible
  triangles on the standard route; report shadow-pass work separately. Adjust
  these only with evidence from device profiling.
- Compare the expanded world against the current 240m baseline on the same device
  and graphics profile: target no more than 10% regression in p95 frame time after
  warm-up. Test cold-load spikes separately. Do not treat the prior headless FPS
  observations as a controlled baseline.
- If a gate fails, reduce per-section density/material count or revise streaming
  before proceeding to the next map size.

## Deliverables

Shared world specification; dimension-independent chunk generator; bounded prop
streaming; reproducible local-asset exporter and licensed GLBs; repaired grass;
360m then 480m layouts; updated collision/road manifests; tests and a recorded
before/after performance route. Implement this in subsequent commits.
