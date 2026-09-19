# Fantasy Meadow Valley asset

The deliverable is [`fantasy-meadow.glb`](../client/public/models/fantasy-meadow.glb).
It is a standalone environment, not a replacement for the existing multiplayer map.

## Contents and coordinates

- glTF 2.0 binary, Y-up, meters, identity node transforms, embedded geometry.
- Playable terrain: **80 x 80 m**, `x,z = [-40,40]`. The exact center is `(0,0,0)`.
  This expands the original 60 x 60 m layout without scaling props or step heights.
- A radius-10 m disk at the center is flat grass at `y=0`, without props,
  flowers, or paths. A small additional flat margin keeps boundary triangles flat.
- Gentle faceted meadow hills surround the clearing. Dirt paths curve around
  the clearing and branch toward the map edges.
- The diagonal river follows `x + z = 60`, is 4 m wide, and stays inside the
  square. The opaque water is at `y=-0.16`, above a recessed riverbed.
- The stone bridge is centered at `(30,30)` in XZ, with a deck at `y=1`.
  Both approaches have four 0.25 m rises and 0.8 m treads, 3.2 m wide.
  The river and bridge move together toward the expanded corner; their dimensions
  are unchanged. Paths extend to the new boundaries, with trees redistributed
  and additional flowers and rocks across the outer meadow.
- The ruined arch is centered at `(-18,-16)` in XZ. A fallen-block pile has
  twelve 0.3 m rises, 0.85 m treads, and 1.7 m-wide tops, reaching its
  `y=3.6` crown. Broken columns and rubble surround it.
- Ten faceted trees, wooden fences, low rocks, and white/yellow wildflower patches.
- Snowy mountains, a castle plateau, and a blue lake are visual-only backdrop
  meshes, with all geometry between 100 and 200 m horizontally from the origin.
  The space between the playable square and backdrop is intentionally not
  traversable terrain; use the host scene's sky/background and distance fog.

All surfaces use flat normals and a single rough, opaque vertex-color material.
There are **no textures, animations, embedded lights, lightmaps, or transparent
materials**. Lighting and fog in the preview belong to the viewer, not the GLB.
The total triangle budget is checked against a strict `<60,000` threshold.

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
viewer; the existing production entry point and game world remain unchanged.
Vite copies the asset into `dist/models/fantasy-meadow.glb` during the normal build.

## Importing into a game

Load the single GLB using any glTF 2.0 loader with vertex-color support. Do not
rescale it or rotate its root. Mesh names identify the terrain, bridge, ruin,
props, and backdrop. Node `extras.role` identifies their purpose; backdrop nodes
have `extras.visualOnly=true`. Steps include route, step number, rise, run, and
top-height metadata; traversable structures have `extras.walkable=true`.
Three.js exposes these extras as `Object3D.userData`.

**GLB does not standardize collision or enforce movement.** The step geometry is
traversable, but collision bodies, slope handling, river behavior, and world
boundaries must be wired into the host game separately. In particular, this
project's current ground-plane/AABB controller does not support the new rolling
terrain automatically. Do not treat the backdrop as walkable or add its bounds
to the playable collision world.
