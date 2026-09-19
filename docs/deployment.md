# Game setup and deployment

## Current features

- An 80 x 80 m meadow with terrain collision, climbable bridge/ruins, and river wading.
- Six explorer color choices, procedural low-poly rigs, blended idle/walk/run/jump
  poses, a styled join screen/HUD, sky/clouds, and distant scenery.
  Explorers use rounded, faceted heads, tapered tunics, capsule limbs, and
  rounded hands/boots while keeping the same standing collision dimensions.
- World-wide text chat with chat bubbles, message length/rate limits, and a
  player roster with block/unblock. Blocking also removes existing messages
  and bubbles from that player.
  Overhead bubbles wrap up to 80 characters, use high-contrast text at a
  camera-independent screen size, and disappear after five seconds.
  Scenery still occludes them; full messages remain in the chat panel.
- Reconnect overlay, bounded retries, frozen movement while disconnected,
  restored player session, and return-to-join when recovery expires.
- One 20-player world per server process, with cancellable automatic full-room retry.

Voice chat was removed at the owner's request on 2026-09-20. There are no
microphone controls, audio connections, voice tokens, or LiveKit dependencies.
No third-party voice subscription, account, or credentials are needed.

Previously configured values in a private `server/.env` are no longer used by
the game. The file remains ignored and was not deleted. The owner can remove
those unused credentials and revoke the API key in the service dashboard.
Removing the integration does not delete an external cloud project or change
its billing plan. Close any old game tabs still running the previous client.

## Local development

Start the server and client in separate terminals:

```sh
cd server
npm ci
npm run dev
```

```sh
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`, pick a nickname/color, and enter the world.
Press **Enter** to open text chat, **Enter** to send, or **Escape** to cancel.
Use the player roster to block/unblock messages.

The game server defaults to port 2567 and honors `PORT`.
The client defaults to the same hostname on port 2567, or uses
`VITE_SERVER_URL` from [`client/.env.example`](../client/.env.example).
Use `npm run dev -- --host` to expose the client for LAN testing.

## Player preferences

Blocking is local to the player, not a server ban. Preferences persist by room
ID and session ID in localStorage (up to 200 entries), not by nickname.
Existing saved blocks from the earlier client are retained; obsolete voice
mute settings are ignored and dropped when preferences are saved again.
Without accounts, a block cannot follow someone who returns with a new session.

## Production

### Game server: Render

Use [`render.yaml`](../render.yaml). It installs locked dependencies with
`npm ci`, runs the TypeScript build gate, starts the game server, and exposes
`/health` for health checks.

Deploy **one process/instance**: singleton enforcement is process-local.
Horizontal scaling requires shared room coordination.
Free hosting can sleep/cold-start; account for that during join/reconnect
testing and check current hosting limits before public launch.

### Client: Cloudflare Pages

- Root directory: `client`
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Environment: `VITE_SERVER_URL=wss://<your-render-service>.onrender.com`
- Node 20.19+ is tested.

Use HTTPS/WSS in production. Deploy the matching server and client together
and reload old game tabs after the voice-removal update: the removed token
message is no longer registered on the server.

No production deployment is performed automatically.

## Verification

From `client`:

```sh
npm test
npm run test:meadow
npm run build
```

From `server`:

```sh
npm test
npm run build
```

Server integration tests use port 2568 by default. If occupied, run
`TEST_PORT=2578 npm test`.

### Two-browser checklist

1. Join with different nicknames/colors; verify both rosters and movement.
2. Walk, run, jump, climb the bridge/ruin, and wade the river. Verify local
   and remote animations and camera controls.
3. Exchange text messages and verify chat bubbles. There should be no voice
   panel, microphone prompt, or external audio-service request.
4. Block a player; verify incoming and existing messages/bubbles are hidden.
   Unblock them and confirm new messages arrive again.
5. Briefly interrupt the game socket and restore it within 15 seconds.
   Verify the same session returns without duplicate canvases or rosters.
6. Restart the server; recovery should expire with a return-to-join action.
7. Test full-room waiting/cancellation, then vacate a slot and verify admission
   to the same room. Integration tests also fill all 20 slots.
8. Profile 20 visible avatars on target Chrome/Firefox/Edge hardware.
   The 60 fps goal is not a measured guarantee.

Remaining verification: deployed HTTPS/WSS behavior and target-hardware
performance. Additional hardening follow-ups: better nickname matching and
a transport-level message flood limit beyond the existing per-feature limits.
