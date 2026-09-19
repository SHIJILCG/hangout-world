# Hangout World — Design Spec

**Date:** 2026-09-19
**Status:** Approved by owner (brainstorming session)

**Scope update (2026-09-20):** Owner removed voice chat to avoid voice-service
costs and quotas. Communication is text-only; Phase 4 is retired.

## Summary

A website where any visitor instantly joins a shared 3D world as an avatar:
they pick a nickname and a preset character, then walk, run, and jump around
a hand-crafted low-poly meadow with up to 20 people at once, talking via
world-wide text chat. No accounts. Desktop
browsers only in v1. Hosting cost target: ~$0–5/month.

## Goals

- A stranger lands on the URL and is inside the world within ~15 seconds.
- Movement feels responsive (your own avatar reacts instantly to input).
- Runs at 60 fps on a mid-range laptop in Chrome/Firefox/Edge.

## Non-goals (v1)

- Mobile/touch support.
- User accounts, persistence, friends lists.
- Multiple maps or portals.
- Admin/moderation dashboard (only per-user text blocking).
- Voice chat, microphone capture, and external audio services.
- Custom or Ready Player Me avatars.

## Architecture

Two components:

1. **Web client** — static site (Cloudflare Pages, free tier).
   Three.js renders the world and avatars. All input handling, character
   animation and interpolation of remote players run
   client-side. TypeScript, bundled with Vite.
2. **Game server** — Colyseus (Node.js/TypeScript) on one Render
   instance. Single authoritative room (max 20 clients) holding the
   player roster, positions/animation state, and text chat. Clients send
   input/position updates ~10–15 Hz; server broadcasts room state; clients
   interpolate.

Data flow (movement): keyboard → local avatar moves immediately → position
update to Colyseus → broadcast → remote clients interpolate.

## Joining flow

1. Visitor opens site → join screen: nickname input and six explorer colors.
2. Click "Enter" → client connects to Colyseus room and spawns in the meadow.
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

## Text chat

- **Text chat:** world-wide chat panel (toggleable) relayed through
  Colyseus; each message also shows briefly as a bubble above the sender.
- **Safety:** per-player block (hides their messages and bubbles,
  stored in localStorage); profanity filter on nicknames; message length
  and rate limits server-side.

## Error handling

- WebSocket drop → auto-reconnect with "reconnecting…" overlay; server
  removes a player for others after a 15 s grace timeout.
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
- **Manual:** rendering, animations, and text chat verified with two browser
  windows; documented manual test checklist.

## Build phases

1. **World + movement (single player):** map loads, character walks/runs/
   jumps with third-person camera.
2. **Multiplayer:** Colyseus room, join screen, see others move with
   interpolation, name tags.
3. **Text chat:** panel + chat bubbles, rate limiting, nickname filter.
4. **Retired:** voice chat removed by owner on 2026-09-20.
5. **Polish & deploy:** animation blending, text blocking,
   full-room handling, reconnect overlay, production deploys (Pages +
   Render).

## Stack summary

| Piece | Choice |
|---|---|
| Rendering | Three.js (TypeScript, Vite) |
| Multiplayer | Colyseus (Node.js/TypeScript) |
| Client hosting | Cloudflare Pages (free) |
| Server hosting | Render (single instance) |
| Assets | Kenney.nl / Quaternius free packs |
