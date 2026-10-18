# Forest and regional vegetation pass

The expanded map now has 1,030 regional forest trees: 555 oaks, 291 pines and
184 birches. These replace the previous 59 scattered woodland trees. Planting
forms three connected zones with irregular edges, rather than spreading the
same density over the whole map:

- North Woods: dense dark oak canopy, some birches, mossy green ground and shrubs.
- Pine Grove: evergreen silhouettes, closer planting and a drier needle-coloured floor.
- Birch Copse: pale trunks, lighter foliage and more open ground.

The orchard remains in rows and the courtyard/riverside areas retain open views.
Regional grass increased from 1,601 to 3,199 clumps, with shorter grass under the
forest canopy. There are 329 shrubs. Roads retain 5m trunk clearance; tree
collisions cover trunks so the player can walk under the canopy.

`scripts/meadow/biomes.mjs` defines the zones and their blended ground colouring.
`regions.mjs` places the trees deterministically. Full oak/birch silhouettes use
388 triangles, reducing to 100 then 40 with distance. Pines use 92/60/40 triangles.
Models are opaque, instanced per section, and loaded/unloaded through the existing
regional template cache. Only nearby high-detail trees cast shadows. New LOD
instances begin hidden so loading cannot briefly draw all three levels together.

Forest and shrub models are authored with Three.js primitives in the existing
asset export script. Existing imported models retain their source attribution.

Use `/environment-preview.html` to compare North Woods, Pine Grove and Birch
Copse using the region buttons. The browser smoke check now asserts visible
forest tree instances, as successful HTTP responses alone do not prove a GLB
loaded: a missing asset may receive the development server's HTML fallback.

After exporting new asset filenames, restart the Vite server if it was already
running. Characters and generated terrain binaries are excluded from hot reload
to avoid OneDrive file locks; newly exported regional models are watched.

Validation: the client build, regional asset/LOD tests and generated map checks
pass. A browser route through all seven preview locations loaded the forest
models successfully, with no runtime errors or failed requests. The North Woods
sample included 632 active forest trees, 97 reported draws and 99,845 rendered
triangles. The pine and birch samples included 291 and 81 active tree instances.
These are scene observations, not a controlled before/after FPS benchmark.
The saved report is [forest-browser.json](validation/forest-browser.json).
