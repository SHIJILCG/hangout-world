# Environment asset and liveliness plan

Status: village and regional prop kits, readable signs, grass breeze, and lantern warmth are implemented. The current static-camera production benchmark is complete; full before/after performance acceptance remains open. Keep the 480m world and its region layout.
Build on the existing forests and section streaming. This plan adds recognizable
places, everyday activity details and selective motion with explicit cost limits.

## What is missing

The world has terrain, buildings, vegetation and roads, but few objects that
explain how people use each place. Repeated trees alone cannot supply that story.
The next pass should give each region a visual purpose and provide interesting
details at walking distance: a stocked market, a worked orchard, a woodland
resting place, a fishing bank, and a recognizable ruined courtyard.

Use one main landmark, two supporting groups and a handful of small details per
region. Place details around entrances, junctions, paths, buildings and clearings.
Keep open meadow between destinations. Aim for a new point of interest every
25–40m along selected walking routes; do not fill every section uniformly.

## Performance evidence and approach

The [production environment benchmark](forest-performance.md) measured:

| Location | High 720p median FPS | High 1080p FPS | High 1080p p95 frame time |
| --- | ---: | ---: | ---: |
| Village | 79.5 | 65.9 | 28.3ms |
| North Woods | 88.7 | 61.5 | 28.1ms |
| Pine Grove | 79.3 | 51.1 | 37.2ms |

The village sample reported 184 draws and about 164k triangles. New content needs
a draw-call allowance, not just a triangle allowance. The pine view already has
limited headroom at 1080p. These headless, static-camera observations exclude
avatars and voice; preserve room for multiplayer rendering.

Additional assets and motion always have some cost. The objective is to keep
measured frame times within a small budget while making a much larger visual
difference. No claim of zero performance impact or guaranteed FPS should be made.

First create headroom, then spend it on assets. Add content in small batches and
compare identical cameras, quality settings and routes before approving each batch.

## Content by region

Counts below are initial design caps, not instructions to scatter every item
independently. A group of small items can become one merged prefab.

| Region | Main landmark | Supporting details | Initial placement cap |
| --- | --- | --- | --- |
| Village | A stocked market stall and a small well | Produce crates, barrels, jars/books on a counter, two benches, planters, hanging signs | 1 stall, 1 well, 2 seating groups, 4 display/storage groups |
| Orchard Farm | A harvest cart beside a packing area | Fruit baskets, picked apples, pumpkins/crop rows, sacks, tool rack, short log pile | 1 cart, 1 packing group, 3 crop plots, 4 harvest groups |
| North Woods | A woodland resting clearing | Fallen trunks, cut stumps, mushrooms, ferns, leaf patches, direction sign | 1 resting group, 6 timber/rock groups, 8 small undergrowth groups |
| Pine Grove | A rocky trail marker and supply shelter | Sparse logs, stones and equipment at the trail edge | 1 landmark group, 3 small supporting groups; require a cost-neutral result here first |
| Birch Copse | A small resting/picnic spot | Light flower patches, a bench, scattered leaves, a few stones | 1 resting group, 6 flower/ground groups |
| Old Courtyard | A broken pillar or weathered monument | Rubble, wall vines/moss colours, fragments, worn entry stones | 1 monument, 3 rubble groups, 3 ground-detail groups |
| Riverside Clearing | A short fishing platform on the bank | Fishing rod, bucket, rope coil, reeds, bank stones and a bench | 1 platform, 1 equipment group, 4 reed/stone groups, 1 bench |

Shared road details: a small family of direction signs and occasional fence
end-posts. Place them at useful junctions with clear silhouettes and readable
destinations. Keep the plaza's radius-10m clearing and all traversal routes clear.

## Asset source and reusable kit

The local project remains:
`C:\Users\shiji\Downloads\medieval-characters-main\medieval-characters-main`.

Its installed `three-low-poly` 1.2.7 declarations were checked for this plan.
Confirmed reusable generators include `ApothecaryJarGeometry`,
`PotionBottleGeometry`, `BookGeometry`, `BookshelfGeometry`, `DeskGeometry`,
`createPumpkinGeometry`, `PumpkinPatch`, `createHewnTimberGeometry`,
`PlankFloor`, `WeatheredPlankGeometry`, `LeafGeometry`, `EllipticLeafGeometry`,
`StoneWall`, `StoneFencePostGeometry`, doors, windows and lanterns. Existing game
rocks, shrubs, fences and tree parts can also be reused.

Crates, barrels, benches, carts, a well, mushrooms, signs and a fishing platform
were not confirmed as ready-made local assets. Author these as simple reusable
meshes or assemblies from existing wood/stone parts and Three.js primitives.
Do not label them as imported assets. Export models offline, record attribution
and seeds, and commit the results so runtime/CI does not depend on Downloads.

Start with approximately 12 reusable prop families and 2–3 colour/shape variants
where they make a visible difference. Examples:

- Storage: a crate, barrel and sack/basket silhouette, arranged into a few groups.
- Gathering: a shared bench/table construction used in village, birch and riverside.
- Harvest: one small produce family using existing apples and local pumpkins.
- Woodland: stump/log pieces plus a small mushroom/fern family.
- Story landmarks: stall, well, cart, monument and platform assemblies.

Reuse silhouettes with different arrangements and palettes. Avoid exporting a
new material and model for every colour change or every hand-placed object.

## Render and asset budgets

These are initial caps to test, not predictions that they will automatically pass.

| Item | Proposed budget |
| --- | --- |
| Small prop source | 40–200 triangles; opaque, preferably one material |
| Medium prop or display group | 200–700 triangles; one material preferred |
| Main landmark | 700–1,500 triangles near; 150–350 triangles at distance |
| New detail visible in one view | Up to 8k triangles / 8 additional draws in village; 5k / 4 draws in forests |
| Pine Grove additions | No net regression until its existing 1080p cost is improved |
| First asset kit download | Target at most 1.5MB total uncompressed, loaded by region |
| Additional join-critical assets | At most 150KB uncompressed; load remote regional props on approach |
| Small detail range | Full detail within 15–25m; simplified/grouped until 35–45m; then hidden |
| Landmark range | Near model within 35m, simple silhouette to 100–120m |
| Static decoration animation CPU | Target under 0.5ms added CPU submission work per frame on the benchmark machine |
| Existing section caps | Preserve 64/96/128 resident sections for Low/Medium/High |

Do not use additional section residency or a higher pixel ratio to compensate for
content placement. Maintain the current overall target of roughly 200 reported
draws / 200k visible triangles along the standard route. Draw counts alone do not
measure transparent overdraw, shadow work or GPU time, so frame timing remains
the acceptance test.

## Implementation changes that make the kit affordable

1. **Merge cottage pieces by opaque material or bake vertex colours.** The cottage
   is currently instanced one source mesh at a time. Combine compatible walls,
   trim and roof pieces before instancing so their detail does not consume a draw
   per small piece. Compare appearance and shadow cost before changing LOD ranges.
2. **Profile the pine view at a fixed 1080p camera.** Compare shadows enabled vs
   disabled, then test a single stepped crown surface against overlapping cone
   layers. Measure which change helps rather than assuming triangle count is the
   cause. Preserve the tree's visible silhouette and forest density.
3. **Add a data-driven prop catalog.** Store category, bounds, pivot, LOD ranges,
   maximum distance, shadow policy and collider shape. The current regional loader
   has hardcoded grass/tree LOD rules and enables shadows for most LOD0 assets;
   new small props should use explicit metadata instead.
4. **Export static dressing groups as merged prefabs.** A stall's jars, books and
   produce can share a vertex-colour mesh. Repeat crates, barrels and stumps with
   section instancing. Keep repeated props in a few material families per section.
5. **Retain section ownership and template reference counts.** Load a prop family
   when an approaching section needs it, deduplicate requests, and release instance
   buffers/templates when their last section unloads. Keep request concurrency bounded.
   Stream fine village decorations after entry; if a starting landmark is needed
   immediately, preload only its coarse model within the join-critical allowance.
6. **Budget collisions separately.** Small plants and loose decoration need no
   colliders. Large logs, carts and structures get simple volumes. A platform
   gets an explicit supporting surface, with verified approaches and step heights.
   Keep collision available before its visible section finishes loading.

New small props should not cast dynamic shadows by default. Use vertex-colour
contact shading or a small number of opaque ground-colour details. Keep shadow
casting for selected nearby silhouettes that benefit visibly, such as a cart or
stall canopy. Avoid a separate point light, transparent texture or material for
each lantern, leaf patch or sign.

## Make it feel alive

Add movement and sound after the static prop pass meets its budget:

| Effect | Implementation and limit |
| --- | --- |
| Breeze in nearby grass and a couple of cloth signs | Shared vertex animation with one time uniform; no per-blade JavaScript update or material clone. Small bounded displacement and matching culling bounds. |
| Warm lantern centres | Shared emissive material; no additional shadow-casting lights or bloom requirement. |
| Water and woodland ambience | At most two nearby region sound beds crossfading; suspend distant audio. Source suitable licensed/owned files and start audio from the existing user gesture. Audio clips were not verified in the supplied asset kit. |
| Chimney smoke at the village | Optional one or two nearby capped emitters; test transparent fill cost at 1080p before enabling. Hide outside 25–30m and on Low. |
| One local villager or farmer | Later, separately measured phase using existing character assets. Reuse model templates, update distant animation at reduced frequency, hide beyond the activity area, and cap simultaneously active ambient actors at two. |

Start with the breeze, emissive lanterns and ambient sound. Those changes create
movement and regional identity without introducing a large actor/pathfinding
system. Add smoke and ambient characters only when a separate measured allowance
is available. Keep ornamental motion out of server movement-message traffic.

## Delivery order and review checkpoints

1. **Create headroom and establish the prop pipeline.** Capture current camera
   baselines; merge cottage pieces; profile the pine view; implement prop metadata
   and material/shadow defaults. Validate streaming and template disposal.
2. **Village pilot.** Add the stall/counter display, storage groups, seating and
   one landmark. Review at player height, not just an overhead preview. Measure
   village 720p and 1080p before adding the full kit elsewhere.
3. **Orchard and riverside.** Reuse the pilot's wood/storage pieces, add harvest
   groupings and the fishing platform, and check the platform's support/collision.
4. **Forest, birch and ruin details.** Add timber, ground/flower patches, a resting
   spot and courtyard fragments. Preserve different density and palettes per region.
5. **Breeze and sound.** Add one effect at a time, measuring near and far views.
6. **Optional activity actors and smoke.** Treat these as separate budgets after
   the static kit and first effects pass, rather than including them in the same
   unchecked content batch.

Each checkpoint delivers exported assets, region placements, catalogue entries,
screenshots from player height, collision changes where needed, and a short
before/after measurement record. Commit checkpoints separately so an expensive
asset group can be adjusted or reverted without losing the rest of the pass.

## Acceptance checks

- Repeat the same production benchmark cameras, resolution, quality and warm-up.
  Use at least three 20-second samples for both the before and after comparisons; the previous
  1080p figures were single samples. A relative frame-time target of at most 5%
  regression is an initial gate, not a substitute for repeated measurements.
  If ordinary run-to-run variation exceeds that allowance, mark the comparison
  inconclusive and gather more samples before attributing the difference to assets.
- Use an interleaved before/after order and several moving camera views to reduce
  warm-up, scheduling and favourable-angle bias. Add the orchard/riverside to the
  existing Village/North Woods/Pine Grove route.
- At the pine hotspot require neutral or better median and p95 frame time before
  spending any newly created headroom there. Avoid describing a 51-FPS average
  baseline as a guaranteed 60-FPS experience.
- Retain roughly 200 draws / 200k visible triangles as a quick regression check;
  also compare CPU submission time, p95/p99 frame intervals and frames over 33ms.
- Compare allocation counts and post-GC heap at the same locations after three
  complete routes. No continuing growth in geometry/texture/instance counts.
- Check low settings and effective 720p/1080p render sizes, cold loading, delayed
  requests and rapid return trips. Validate failed model downloads explicitly;
  successful HTTP responses can still contain an HTML fallback.
- Check footsteps/routes through the forest, plaza clearing, building entrances,
  signs, bridge, farm gaps and dock approaches. Decorative clusters must not
  obscure the third-person camera or introduce invisible blockers.
- Check two clients in the busiest area, then a fuller multiplayer load before
  treating the static environment timing as the game's total performance budget.
- If a batch exceeds its allowance, first reduce material/draw count, shadow
  coverage or visibility distance; review decoration density with a player-height
  screenshot and remeasure the adjusted result.

## First visible result

Begin with a village that feels inhabited: one stocked stall, a small well,
seating, a few believable storage/produce arrangements and readable junction
signs. Reuse that kit for an orchard packing area and riverside fishing spot.
Then give the forests and ruins their own ground-level details. This produces
recognizable destinations while keeping the cost of each content batch reviewable.

## Village pilot checkpoint

Implemented two stocked stalls using the existing market footprints, one well, two benches and two storage groups. All four reusable models are original primitive assemblies (139,872 bytes total), with two LODs and no dynamic shadow casting. The supplied cottage assets are baked into one indexed vertex-colour mesh per LOD, preserving their geometry and reducing their combined download from 1,500,000 to 1,212,844 bytes.

Regional metadata now controls prop LOD distances, visibility limits, shadow casting and simple collision boxes. Template sharing, section ownership and request concurrency remain in place. New blockers are checked against road and plaza clearance. Rebuild with `npm run generate:expansion-assets -- <source>`, `npm run generate:village-assets`, then `npm run generate:meadow` from client.

Validation: production build, seven streaming/prop tests and four expansion checks passed. Browser verification checks all seven placed props and captures a player-height view in `docs/validation/village-pilot.png`. Cottage triangle counts and precise bounds were compared during export verification. Render-count evidence is recorded in `docs/validation/village-pilot.json`; this is not the repeated before/after FPS acceptance test.

The village checkpoint was followed by regional work below. Its original short benchmark was a screening sample, not final acceptance.


## Regional props checkpoint

Added one harvest cart, three crop displays and four storage groups across the orchard; one small fishing platform with gear and a nearby bench; and a cleared North Woods resting spot with six fallen-log groups and eight leaf/fern patches. Small ground props have no collision. The fishing platform has a low support collider checked along its bank approach against the 0.35m player step limit.

All additions use the same section-streamed one-mesh-per-asset kit and remain under the original section caps. Orchard and riverside browser counts were verified. Build, meadow validation, five expansion checks and sixteen targeted runtime map/streaming/collision tests passed. See docs/validation/regional-props-browser.json.

Added three readable regional direction signs. Nearby grass now bends through one shared wind uniform; lantern centers use warm emissive materials without adding point lights. The grass motion is disabled at Low quality. The browser check found all three signs and no shader or world asset errors.

Remaining: add regional sound after selecting licensed/owned audio (no sound files were present in either supplied asset folder). Birch/courtyard additions should wait for a measured draw and frame budget; smoke and ambient characters remain optional, separately-budgeted work. The completed run has three 20-second High/720p samples per camera but only one High/1080p sample. Capture three 1080p samples and a matching pre-change build, then cover moving cameras, multiplayer and player devices before calling performance acceptance complete.
