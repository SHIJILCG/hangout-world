# Phase 4 and Phase 5 implementation plan

Status: the horse pilot and first animated cart/vehicle route milestone are
implemented locally. Shared ride state, authoritative movement, mounting,
safe dismounting, reconnect handling, mounted/driver poses and a widened bridge
are included. More animals, full-room performance validation and Phase 5
activities remain planned.

## Foundation at planning time

- The map is 480 by 480 metres with streamed scenery and shared world dimensions.
- `server/src/schema.ts` synchronizes players, but has no rides or activity state.
- `server/src/WorldRoom.ts` accepts player positions with movement limits; it does not simulate vehicle movement against terrain.
- `client/src/player/controller.ts` implements walking, running, jumping and collision.
- The current carts are decorative. Public game assets contain no horse model.
- Avatar animation currently supports standing, walking, running and jumping; mounted and seated poses need authoring.
- The generated bridge deck is 3.2 metres wide before accounting for its side structures. Vehicle clearance must be measured against collision geometry.

## Phase 4: medieval rides and carts

### 4A. Shared interaction and ride foundation

Add one interaction prompt and action for nearby objects. Use it for mounting, dismounting and later activities. Hide prompts while typing in chat and reject actions outside interaction range on the server.

Add ride definitions shared by client and server: dimensions, seat offset, speeds, acceleration, turning limits, slope limit and spawn location. Add replicated ride IDs, pose, speed and occupant, plus the player's current ride ID.

The server grants a seat atomically and accepts driving input only from its occupant. Simulate rides on a fixed server tick using terrain and collision data. Keep movement and collision rules reusable between client and server. Predict the local ride and reconcile server corrections; interpolate remote rides. Derive rider position from the seat so horse, cart and rider cannot drift apart. Reject independent walking position updates while mounted.

Choose a clear, supported dismount position beside the ride. If none is available, keep the player mounted and explain why. Stop a ride when its driver disconnects; reserve its seat during the existing reconnect grace period, then release it. Late joiners must receive current riders and vehicle poses.

### 4B. Playable horse pilot

Inspect the supplied local asset collection for a suitable licensed, rigged animal. If missing, source one and verify its license, scale, pivot, skeleton and idle/walk/run clips before integration. Record attribution with the model. Author a mounted pose for each supported avatar rig.

Pilot outcome: no suitable horse was found locally. Added an original articulated
low-poly horse with procedural gait, plus a seated pose on the seven existing
avatar rigs. Validation details are in `superpowers/specs/2026-10-18-horse-pilot.md`.

Start with one horse at the stable. Support mount, walk, trot, steering, stopping and dismount. Use a camera offset and smooth transitions appropriate to riding. Ground the animal on terrain, prevent traversal through obstacles and keep steep slopes and deep water outside its allowed route.

Acceptance: two clients see the same occupant and movement; simultaneous mount attempts grant only one seat; blocked dismounts are safe; disconnect, reconnect and late join preserve consistent state. Walking and chat continue to work after dismount.

### 4C. Animated wooden cart and vehicle routes

Implemented: one Kenney cart with independently animated wheel hubs, an original
horse and a bench seat. Shared route definitions clear a 6-metre lane through the
stable, village and local orchard, with turning areas. The bridge now uses a
6-metre deck with 7.8-metre shallow approaches. Its visual geometry and collision
are regenerated together. See `superpowers/specs/2026-10-18-cart-and-routes.md`.

Add one horse-drawn wooden cart with a driver seat. Treat horse and cart as one controlled assembly initially, with a turn limit and collision footprint covering the full assembly. Animate wheels from distance travelled and horse gait from speed. Inspect the existing Kenney cart for reusable wheel nodes, dimensions and hitch suitability before deciding whether to adapt it.

Define a stable-to-village-to-orchard route. Measure its swept turning space and bridge clearance using the actual cart dimensions. Widen road geometry, move obstructing scenery and update the bridge approaches and collision together. Prefer smooth ramps for cart crossings; retain walking access. Do not assume a wider road texture changes collision clearance.

Acceptance: drive the complete route in both directions, turn around at designated spaces, cross the bridge without catching wheels or clipping the parapets, stop safely on slopes and dismount at both ends. Two clients must agree on driver and cart position.

### 4D. Performance and multiplayer release checks

Use shared model resources and independent animation state. Reduce distant animation updates and unload distant visuals while retaining server state. Send driving inputs and compact entity state; animate wheels and gait locally instead of sending bone transforms.

Begin with a provisional room cap of four rideable horses and one cart. Confirm or reduce the cap from measurements. Record frame time, draw calls, geometry, memory and network traffic before and after the same route on the same graphics preset. Exercise delayed packets, rapid mount/dismount and reconnects. Increase the cap only after the pilot meets the agreed device budget.

## Phase 5: activities

Build on the interaction system from Phase 4. A player can have one active activity or ride at a time. The server owns participation, timing, completion and scores; clients handle prompts and cosmetic animation.

1. **Fishing:** use marked spots around the pond and the existing riverside platform. Add casting, a server-timed bite, a short catch action, result feedback and cancellation when leaving. Nearby players see the fishing state. Keep results session-based initially.
2. **Archery:** add a target range in the activity meadow. Support aiming, firing and a timed scoring round. Validate shot timing, range and target hits on the server; animate arrows locally. Handle ties, leaving and late spectators.
3. **Gathering and campfires:** add shared gathering spots with server-controlled availability and respawn timers. Add sit/stand interactions at campfires, nearby social prompts and limited visual fire effects. Avoid a separate dynamic light for every flame.
4. **Simple social games:** reuse the archery round system for a multiplayer target contest, then add a short checkpoint race. Define lobby, countdown, active round, results, ties and player departure behavior.
5. **More interactive objects:** extend the same interaction definitions to benches, wells and market props, with a clear visible outcome for each action. Keep decorative objects inexpensive.

Acceptance for each activity: two-client participation, consistent state for late joiners, cancellation and disconnect cleanup, no duplicate rewards or scores, and no conflict with chat or mounted controls. Run comparable frame-time and network measurements in the busiest activity area before adding more simultaneous effects.

## Delivery order

Deliver separate reviewable changes: interaction and ride state; the playable horse; animated cart and routes; ride validation and performance results; fishing; archery; gathering and campfires; social games and additional objects. Finish each playable milestone before expanding its asset variety. Push feature branches and review them before merging to main.

The first implementation milestone is **one horse that two players can take turns mounting, riding and safely dismounting**. Carts and activities follow once that loop is reliable.
