# Phase 5: pond fishing

Three shared rod stations surround the village pond at (26,-17), (34,-23), and
(27,-29). Approach on foot within 2.2 m and press F or click Cast line. The float
turns red while waiting, then gold on a bite. Press F within three seconds to
catch a fish. Reeling early or missing the bite ends the cast without a catch.
Waits last 4-8 seconds. Cancel or walk more than 3 m away to free the spot.

The server owns all station occupancy, deadlines and catch totals. It validates
distance, height and mounted state, rejects occupied spots and limits interaction
messages. A player can hold only one station. Disconnecting releases the station
immediately; a successful reconnection preserves the player's session count but
does not resume the cast. Leaving the session or restarting the server resets
counts. Mounting a ride also releases the station.

All clients see shared float colors. These are stationary shore rods; this first
version does not add a held-rod character animation, inventory, fish economy or
persistent progression. Archery and campfire activities remain later work.

Rendering uses three instanced sets (rods, shore markers, floats), one line batch,
one label and a 168-triangle opaque water surface. The original flat pond was
partly buried by the rolling ground; the added surface follows ground height
without changing terrain collision, and floats are raised to match.
No fishing props cast shadows, and the group is hidden beyond
55 m from the nearest station. Float colors update only when the shared phase
changes. No new dependencies or downloaded assets are used.

## Verification (2026-10-21)

- Client tests: **115 passed**, including seven fishing UI/rendering tests.
- Server tests: **67 passed**, including seven fishing rules tests and two
  real Colyseus room integration tests.
- Client production build and server TypeScript build: **passed**.
- `git diff --check`: **passed**.
- Two-client browser check: F casts, shared occupancy rejects a competing player,
  bites appear on both clients, clicking Reel awards and replicates one catch,
  cancellation frees the station, and walking away releases it. No recorded
  browser exceptions. The ordinary game join/HUD also loaded successfully.
- Integration tests additionally cover late joins, immediate release on socket
  loss and catch-count preservation after successful reconnection. Rules tests
  cover early/expired reels, remote/airborne/mounted requests and action throttling.

The browser uses the game's Fishing component in the environment preview with
two real connections and scripted, rate-limited movement. It is not a full
manual playthrough of the character controller. Reproduce with
`node scripts/fishing-browser-check.mjs` from `client`, with the dev game on 5173,
server on 2567 and isolated Chrome CDP on 9234.

Five-second rendering samples at the same pond camera (1280 x 720, High):

| Fishing group | FPS | Mean frame time | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Hidden | 143.80 | 6.954 ms | 188 | 137,115 |
| Visible | 144.00 | 6.944 ms | 194 | 137,549 |

The measured additional work is **6 draws / 434 triangles**. The small FPS
difference is measurement variation near the browser ceiling, not an improvement.
These short dev-build samples are a smoke check, not a repeated production
performance benchmark or a guarantee on other devices.

Evidence: [raw browser results](validation/fishing-browser.json) and
[bite screenshot](validation/fishing-bite.png).
