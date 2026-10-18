# Shared horse pilot

One original articulated chestnut horse waits outside the stable at (23, -23).
Players approach and press E or click the interaction button to mount/dismount.
WASD steers relative to the camera; Shift trots; releasing movement stops.

The server owns the single seat, simulates ride movement at 30 Hz against the
generated collision field, and derives the rider's pose from the horse. Mounted
players cannot submit walking positions. Inputs are sequenced, validated and
expire after 350 ms. Disconnect stops the horse immediately and retains the seat
during the existing reconnect grace period. Leaving releases it.

Dismount checks supported, unobstructed positions beside and behind the horse.
If all are blocked the horse stops and the player remains mounted with feedback.
Rides cannot enter deep water, cross steep ledges or pass through scenery.

The client predicts motion with shared pure physics and reconciles state updates.
Horse and rider share the rendered pose; remote state is interpolated. Animation
is cosmetic. Capability ridesVersion=1 gates new outbound messages. The horse
uses original geometry, one material and baked rigid parts; no external license
or texture download is required. The character's existing rig supplies the
mounted pose. Carts and Phase 5 activities remain subsequent milestones.

Acceptance: ownership contention, unauthorized input, movement limits, obstacle
and water rejection, safe/blocked dismount, release/reconnect, late join and
walking after dismount. Validate both packages and a two-client browser session.

## Validation report — 2026-10-18

- Client: 103 tests passed across 18 files (`npm test -- --maxWorkers=2`).
- Server: 53 tests passed across 5 files (`npm test -- --configLoader runner`).
- Both package builds passed. Vite retains the existing large atmosphere chunk warning.
- Browser: joined the real local game, walked to Chestnut, mounted using E,
  steered west from (23, -23) to approximately (15.4, -23.9), released to stop,
  dismounted and resumed walking. Corrected the saddle height and spread the legs
  after inspecting the first rendering.
- A second Colyseus client in the same browser received the mounted pose, moved
  into range after the first rider dismounted, and successfully mounted. The main
  game rendered that remote rider seated on Chestnut. The second rider then
  dismounted and left. This was one rendered game plus a scripted network client,
  not two independently controlled browser windows.
- Loaded and animated all seven avatar rigs in the browser; transforms were finite.
- Geometry inspection: 808 triangles, 11 rigid meshes sharing one material, no
  horse texture downloads. One horse and one server simulation are active.
- One test run with the software-rendered browser active exceeded an existing
  collision test's timeout. Closing the test browser and limiting test workers
  produced the clean full pass above.

## Scope and remaining checks

This completes the single-horse pilot. Carts, wider vehicle routes and bridge
crossings, more animals and Phase 5 activities are not implemented here.
Hardware FPS comparison, delayed/lossy-network driving and full-room load
measurements remain for the performance milestone before increasing the ride cap.
Prediction uses smooth corrections rather than replaying unacknowledged inputs;
high latency may cause visible correction. Some decorative props have no collision
in the existing generated field. Horse physics uses that same field.

Server deployments must include `shared/`, `client/public/models/collision.json`
and `client/public/models/heights.bin`. The Render blueprint now builds and starts
from the repository root so these runtime files are part of the deployment.
