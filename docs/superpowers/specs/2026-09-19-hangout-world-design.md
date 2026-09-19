# Hangout World — Design Spec

**Date:** 2026-09-19
**Status:** Approved by owner (brainstorming session)

## Summary

A website where any visitor instantly joins a shared 3D world as an avatar:
they pick a nickname and a preset character, then walk, run, and jump around
a hand-crafted low-poly park/plaza with up to 20 people at once, talking via
proximity voice chat and a world-wide text chat. No accounts. Desktop
browsers only in v1. Hosting cost target: ~$0–5/month.

## Goals

- A stranger lands on the URL and is inside the world within ~15 seconds.
- Movement feels responsive (your own avatar reacts instantly to input).
- Voice feels natural: you hear nearby people, distant people fade out.
- Runs at 60 fps on a mid-range laptop in Chrome/Firefox/Edge.

## Non-goals (v1)

- Mobile/touch support.
- User accounts, persistence, friends lists.
- Multiple maps or portals.
- Admin/moderation dashboard (only per-user mute/block).
- Custom or Ready Player Me avatars.

## Architecture

Three components:

1. **Web client** — static site (Cloudflare Pages, free tier).
   Three.js renders the world and avatars. All input handling, character
   animation, interpolation of remote players, and voice-volume logic run
   client-side. TypeScript, bundled with Vite.
2. **Game server** — Colyseus (Node.js/TypeScript) on one small Fly.io
   instance. Single authoritative room (max 20 clients) holding the
   player roster, positions/animation state, and text chat. Clients send
   input/position updates ~10–15 Hz; server broadcasts room state; clients
   interpolate.
3. **Voice service** — LiveKit Cloud (free tier). One audio room per world
   room. The game server mints LiveKit access tokens on join (LiveKit API
   secret lives only on the server). Proximity volume is computed on each
   client from avatar distances.

Data flow (movement): keyboard → local avatar moves immediately → position
update to Colyseus → broadcast → remote clients interpolate.

## Joining flow

1. Visitor opens site → join screen: nickname input, avatar picker
   (4–6 preset low-poly characters × color swatch), mic on/off toggle.
2. Click "Enter" → client connects to Colyseus room, receives a LiveKit
   token, connects to voice, spawns at the plaza spawn point.
3. Nickname floats above the avatar (billboard text).
4. Room full (20) → "world is full, retrying…" with automatic retry.
5. Nicknames pass a profanity filter server-side.

## Movement & world

- **Controls:** WASD walk, Shift run, Space jump, mouse-drag orbits a
  third-person camera; scroll zooms.
- **Character controller:** kinematic — gravity, ground/step detection,
  jump arc — collided against the map's collision mesh. No full physics
  engine in v1.
- **Map:** one low-poly park/plaza assembled from free asset packs
  (Kenney.nl / Quaternius): central plaza, grass, benches, platforms and
  ramps worth jumping on. Daytime lighting, skybox. Separate simplified
  collision mesh.
- **Animations:** idle / walk / run / jump per character; remote avatars
  play the animation matching their broadcast movement state.

## Voice & text chat

- **Proximity voice:** all players publish mic audio to the LiveKit room.
  Each client sets every remote participant's volume by avatar distance:
  full volume ≤ ~5 m, linear/curved fade to 0 at ~25 m. Speaking indicator
  above talking avatars. Persistent mic mute button.
- **Text chat:** world-wide chat panel (toggleable) relayed through
  Colyseus; each message also shows briefly as a bubble above the sender.
- **Safety:** per-player mute/block (hides their voice and messages,
  stored in localStorage); profanity filter on nicknames; message length
  and rate limits server-side.

## Error handling

- WebSocket drop → auto-reconnect with "reconnecting…" overlay; server
  removes a player for others after a 15 s grace timeout.
- Mic permission denied → join listen-only; can retry enabling later.
- LiveKit unreachable → world + text chat still function; voice UI shows
  "voice unavailable."
- Server restart → clients reconnect into a fresh room. No world state is
  persisted; nothing in the world is permanent.
- Server sanity-checks position updates (bounds + max speed) to block
  trivial teleport cheating.

## Testing

- **Server unit tests:** join/leave, room-full behavior, chat relay,
  rate limits, nickname filter, position validation.
- **Character controller unit tests:** headless math tests — jump arc,
  gravity, ground snap, step handling.
- **Multiplayer smoke test:** script connects N fake Colyseus clients and
  asserts state sync and broadcast correctness.
- **Manual:** rendering, animations, and voice verified with two browser
  windows; documented manual test checklist.

## Build phases

1. **World + movement (single player):** map loads, character walks/runs/
   jumps with third-person camera.
2. **Multiplayer:** Colyseus room, join screen, see others move with
   interpolation, name tags.
3. **Text chat:** panel + chat bubbles, rate limiting, nickname filter.
4. **Proximity voice:** LiveKit integration, token endpoint, distance
   volume, speaking indicators, mute.
5. **Polish & deploy:** animation blending, audio fade tuning, mute/block,
   full-room handling, reconnect overlay, production deploys (Pages +
   Fly.io + LiveKit Cloud).

## Stack summary

| Piece | Choice |
|---|---|
| Rendering | Three.js (TypeScript, Vite) |
| Multiplayer | Colyseus (Node.js/TypeScript) |
| Voice | LiveKit Cloud free tier |
| Client hosting | Cloudflare Pages (free) |
| Server hosting | Fly.io (free/cheap tier) |
| Assets | Kenney.nl / Quaternius free packs |
