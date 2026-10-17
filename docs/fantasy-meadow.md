# Fantasy Meadow Valley asset

The deliverable is [`fantasy-meadow.glb`](../client/public/models/fantasy-meadow.glb).
It is a self-contained environment asset and is also the current multiplayer map.
The game loads the GLB together with the generated heightfield/AABB collision
manifest in `client/src/world/meadow-collision.json`.

## Contents and coordinates

- glTF 2.0 binary, Y-up, meters, identity node transforms, embedded geometry.
- Playable terrain: **240 x 240 m**, `x,z = [-120,120]`. The exact center is `(0,0,0)`.
  The central plaza remains flat while the outer meadow gains distinct village,
  park/pond, activity meadow, stable, forest, ruins, and countryside zones.
- A radius-10 m disk at the center is flat grass at `y=0`, without props,
  flowers, or paths. A small additional flat margin keeps boundary triangles flat.
- The 160-segment terrain profile in `client/scripts/meadow/terrain.mjs` is a
  gameplay-adapted visual study inspired by the isolated Environment_Free
  preview; it is not an export or exact copy of Unity TerrainData. The mesh has
  25,921 grid samples and 51,200 terrain triangles, with the collision
  heightfield sampled at the same coordinates.
- Broad rolling hills surround the flat social clearing, pond basin, and
  bridge approach. Dirt paths curve around the clearing and branch toward the
  map edges. The generated profile is validated to stay within a 12-degree
  traversal slope target.
- The diagonal river follows `x + z = 60`, is 4 m wide, and stays inside the
  square. The opaque water is at `y=-0.16`, above a recessed riverbed.
- The stone bridge is centered at `(30,30)` in XZ, with a deck at `y=1`.
  Both approaches have four 0.25 m rises and 0.8 m treads, 3.2 m wide.
  The river and bridge move together toward the expanded corner; their dimensions
  are unchanged. Paths extend to the new boundaries, with trees redistributed
  and additional flowers and rocks across the outer meadow.
- The pond water is centered at `(26,-23)` in XZ, matching the pond zone used
  in the terrain visual study.
- The ruined arch is centered at `(-18,-16)` in XZ. A fallen-block pile has
  twelve 0.3 m rises, 0.85 m treads, and 1.7 m-wide tops, reaching its
  `y=3.6` crown. Broken columns and rubble surround it.
- Ten deterministic spawn pads ring the central plaza. Seventy-four faceted trees,
  village cottages, a stable/paddock, activity markers, wooden fences, low rocks,
  and white/yellow wildflower patches populate the expanded world.
- Snowy mountains, a castle plateau, and a blue lake are visual-only backdrop
  meshes, with all geometry between 100 and 260 m horizontally from the origin.
  The space between the playable square and backdrop is intentionally not
  traversable terrain; use the host scene's sky/background and distance fog.

The complete generated environment contains fewer than **90,000 triangles**;
the terrain itself contributes 51,200 triangles. The
terrain uses smooth heightfield normals; props use flat normals. All surfaces
share a single rough, opaque vertex-color material.
There are **no textures, animations, embedded lights, lightmaps, or transparent
materials**. Lighting and fog in the preview belong to the viewer, not the GLB.

## Rebuild and verify

From the client package:

```sh
npm run generate:meadow
npm run validate:meadow
npm run test:meadow
```

Generation uses the existing Three.js dependency and a fixed seed. It validates
the binary before saving it and prints triangle count, mesh count, file size,
and the measured design constraints. The saved asset is reproducible.

The asset checks inspect actual serialized positions, normals, colors, and
triangle footprints: center clearance, flatness, playable bounds, river width,
step heights/adjacency, destination heights, and backdrop distances. They also
load the saved GLB using Three.js `GLTFLoader`, compare a regenerated binary with
the saved file, and verify that deliberate geometry/material violations fail.
These are asset-specific Node tests, separate from the game's Vitest suite.

## Preview

```sh
npm run dev
```

Open `/meadow-preview.html` on the Vite development server. The preview offers
overview, bridge, ruins, meadow, and backdrop camera presets, plus a GLB download.
Drag to orbit, scroll to zoom, and right-drag to pan. This is a development-only
viewer; the production game uses the same GLB with its player/collision systems.
Vite copies the asset into `dist/models/fantasy-meadow.glb` during the normal build.

## Importing into a game

Load the single GLB using any glTF 2.0 loader with vertex-color support. Do not
rescale it or rotate its root. Mesh names identify the terrain, bridge, ruin,
props, and backdrop. Node `extras.role` identifies their purpose; backdrop nodes
have `extras.visualOnly=true`. Steps include route, step number, rise, run, and
top-height metadata; traversable structures have `extras.walkable=true`.
Three.js exposes these extras as `Object3D.userData`.

**GLB does not standardize collision or enforce movement.** This project wires
the generated heightfield and collision boxes into its controller: bridge and
ruin steps, river wading, and boundaries are covered by map tests. Other host
games must supply their own collision integration. Regenerate the GLB and
collision manifest together whenever the layout changes.

The game adds a runtime sky, clouds, and visual-only distant valley floor.
These are not embedded in the GLB and do not change its triangle budget or the
playable square. Do not treat them or the backdrop as walkable.
