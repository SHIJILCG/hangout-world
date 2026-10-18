# Playable game smoke report

Date: 2026-10-18

## Setup

Ran the actual Vite client at `http://127.0.0.1:5173` with the local Colyseus server on port 2567. Joined as `PerfCheck` in isolated headless Edge at 1280x720, DPR 1, using the AMD Radeon integrated graphics renderer. This exercises `main.ts` and its real `buildMap()` path rather than the standalone environment preview.

## Results

The player joined, the world rendered, and keyboard movement streamed terrain and regional GLBs. Spawn loaded village bench, stall, storage and well models. Moving north loaded forest birch, oak, shrub, log and floor-patch models. The browser smoke also exercised Low, Medium, High and Auto graphics settings, three sprint movement directions, and jump.

| State | FPS | p95 frame time | Draws | Triangles | Active sections |
| --- | ---: | ---: | ---: | ---: | ---: |
| Spawn / Auto | 143 | 7.2 ms | 89 | 75,574 | 20 |
| Low | 144 | 7.2 ms | 72 | 73,716 | 32 |
| Medium | 144 | 7.1 ms | 95 | 80,806 | 42 |
| High | 144 | 7.1 ms | 112 | 90,011 | 58 |
| Auto after streaming | 144 | 7.1 ms | 114 | 91,357 | 66 |

No browser exceptions occurred. No requests failed in the second run. The first run recorded a cosmetic `/favicon.ico` 404; world and regional model requests succeeded. Active sections remained below the profile caps (64 Low, 96 Medium, 128 High). Headless frame timing is capped near 144 Hz here and is not a player-device performance guarantee.

## Captures

- Spawn: [playable-game-spawn.png](playable-game-spawn.png)
- Woods route: [playable-game-woods-route.png](playable-game-woods-route.png)

The local client, server, and isolated browser were stopped after the smoke run.
