# Cart and vehicle routes — 2026-10-18

## Delivered

- One horse-drawn cart starts at (12, -32), next to the stable lane. E mounts
  and dismounts, WASD steers relative to the camera, Shift increases speed.
- The existing Kenney Fantasy Town Kit cart is CC0; its two wheel meshes have
  hub pivots and rotate from travelled distance. Added shafts, bench and a
  separate seated driver animation. Horse and axle heights follow terrain.
- Horse and cart have independent server-owned seats. A player can use only
  one ride at a time. Driving input, reconnect reservation, input expiry,
  stopping and safe dismount use the shared ride system.
- `cartsVersion=1` gates cart controls separately from the horse capability.
  Older horse clients retain their original action format.
- A conservative full-assembly footprint checks obstacles, water and slopes.
  Cart speed is capped at 5.5 m/s with slower turning and acceleration.
- `shared/vehicle-routes.json` defines the stable/village/bridge route and local
  orchard branch, with turning areas. Roads are 6 metres wide. Movable scenery
  was cleared and one market stall moved from (13, 12) to (20, 5).
- The bridge has a 6-metre-wide, 6.4-metre-long flat wooden deck, 7.8-metre ramps,
  and side rails. Generated visuals and collision use the same dimensions.
  Walking traversal remains supported.

## Validation

Final checks: 105 client tests, 58 server tests and 26 environment checks passed.
Both package builds passed; Vite retains the large shared atmosphere chunk
warning. Commands:

```sh
npm --prefix client test -- --maxWorkers=2
npm --prefix server test -- --configLoader runner
npm --prefix client run test:meadow
npm --prefix client run build
npm --prefix server run build
```

Route simulations drive each branch in both directions, then stop and dismount.
Tests cover spawn clearance, bench offset, rear/wheel collisions, speed, water,
seat exclusivity, separate horse/cart drivers and cart reconnect/leave handling.

Browser inspection confirmed asset loading, mounting and both rotating wheels.
The live game drove from the stable through the village onto the bridge, while
a second scripted Colyseus client received matching cart/driver state. The live
drive continued across the bridge, returned through the village, visited the
orchard and returned to the stable; dismounting and walking afterward succeeded.
All seven
avatar rigs loaded and produced finite driver-pose transforms.
After the return drive, the second client approached and took the released cart
seat. The first client's game rendered the new driver on the bench and disabled
its mount button while occupied. Both test clients left and the cart was released
near its stable start. This used one rendered game and a second scripted network
client in the same browser, rather than two independently controlled windows.

The complete cart assembly has 1,464 triangles, 18 meshes and 3 materials
(including its horse, bench and shafts). There is one free horse and one cart.
No bone or wheel animation transforms are sent over the network.

## Limits

This is a single-driver rigid assembly, with no passenger or inventory system.
It does not simulate articulated hitch dynamics or collisions between players
and moving rides. Full-room device FPS, memory and adverse-network benchmarks
remain Phase 4D work before increasing the animal/vehicle cap. Physics route
checks use generated blocking scenery; existing nonblocking decoration remains
nonblocking. Browser checks use software rendering and do not establish a
hardware FPS budget. These changes are local and have not been pushed.
