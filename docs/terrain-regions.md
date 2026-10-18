# Regional elevation rollout

Builds on the approved northern terrain pilot. Orchard Farm now has a 4m level platform covering its tree rows and fences, with a 48m blend into the surrounding meadow. Old Courtyard has a 3.2m level foundation covering its arch, walls and flagstones, with a 42m approach. These broad earthen rises avoid steps between rigid floor and fence pieces.

Birch Copse and Pine Grove gain smooth, distinct rises. Remote riverbanks vary their slope width gradually along the river while retaining the existing water level and bridge protections. The village and original bridge/ruin routes retain their existing terrain.

Terrain remains 236,209 triangles in the standalone generated world. The 1.5m near grid, 15m overview, section limits and runtime update logic are unchanged. Regeneration updates visible terrain, collision grids and regional asset heights together. No new model downloads or render passes are introduced by this change.

The full terrain slope requirement remains 12 degrees. New tests check level orchard/courtyard footprints, raised woodland, descending orchard approaches and river-bed height. The preliminary 1.5m scan found a maximum slope of about 10.96 degrees. Rendering cost still depends on view; unchanged geometry budgets do not establish an FPS guarantee.

Validation completed: production build, all 25 meadow/expansion checks and all nine targeted player-map/collision tests passed. Browser views of orchard, courtyard, birch and pine confirmed the regenerated heights; screenshots and section/render counts are saved in docs/validation/terrain-*.png and terrain-regions.json. No controlled FPS comparison was run.
