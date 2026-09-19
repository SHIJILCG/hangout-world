# Hangout World

A browser-based multiplayer hangout in a colorful, low-poly fantasy meadow.
Pick a nickname and an explorer color, wander with other players, climb the
old ruins, and chat above your characters' heads. No accounts required.

Built for desktop browsers with **Three.js, TypeScript, Vite, and Colyseus**.

## Features

- **A shared world for up to 20 players** with smooth remote-player movement,
  automatic full-room retries, and recovery from brief connection drops.
- **An 80 x 80 meter meadow** with rolling hills, wildflowers, winding paths,
  trees, fences, a river, a walkable stone bridge, and climbable ruins.
  Snowy mountains, a castle, and a lake form the distant backdrop.
- **Rounded low-poly explorers** in six colors, with idle, walk, run, and jump
  animations.
- **World-wide text chat** with readable, high-contrast overhead bubbles.
  Bubbles wrap long messages and stay a consistent screen size as the camera
  moves; the chat panel shows the full message.
- **Player blocking** that hides a player's messages and bubbles, including
  messages already on screen. Preferences are saved locally.
- **A reproducible environment asset**: one vertex-colored GLB under 60,000
  triangles, generated alongside the game's collision manifest.

Communication is **text-only**. No microphone access, LiveKit account, or
third-party voice-service credentials are needed. Hosting still depends on
your chosen provider's limits and pricing.

## Controls

| Action | Control |
| --- | --- |
| Walk | `W`, `A`, `S`, `D` |
| Run | Hold `Shift` while moving |
| Jump | `Space` |
| Rotate the camera | Click and drag in the world |
| Zoom | Mouse wheel |
| Open chat / send a message | `Enter` |
| Cancel typing | `Escape` |
| Block / unblock a player | Open the **Players** roster |

## Run locally

### Requirements

- Node.js 20.19 or newer and npm.
- A desktop browser with WebGL support.
- Git, if cloning the repository.

```sh
git clone https://github.com/SHIJILCG/hangout-world.git
cd hangout-world
```

The client and server are separate npm packages. Start each in its own
terminal, beginning at the repository root.

**Terminal 1 - game server**

```sh
cd server
npm ci
npm run dev
```

**Terminal 2 - browser client**

```sh
cd client
npm ci
npm run dev
```

Open **http://localhost:5173**, choose a nickname and color, and enter the world.
Open another browser tab or window to try multiplayer.

The game server runs on port **2567** by default. No environment file or
external service account is required for local play.

### Configuration

| Variable | Package | Purpose |
| --- | --- | --- |
| `PORT` | Server | Override the game-server port; defaults to `2567`. |
| `VITE_SERVER_URL` | Client | Override the multiplayer WebSocket URL. By default, the client connects to its current hostname on port `2567`. |

See the [client environment template](client/.env.example) and
[server environment template](server/.env.example). Keep real environment
files private; never put secrets in `VITE_*` variables, which are bundled
into the browser client.

For LAN testing, run the client with `npm run dev -- --host` and open the
displayed network URL on another computer. Both computers must be able to
reach the game server.

## Development commands

Run these from the **repository root**:

```sh
# Client tests and production build
npm --prefix client test
npm --prefix client run build

# Server tests and typecheck
npm --prefix server test
npm --prefix server run build

# Environment asset validation and geometry/collision checks
npm --prefix client run validate:meadow
npm --prefix client run test:meadow
```

Server integration tests use port **2568** by default. On Linux/macOS, use
`TEST_PORT=2578 npm --prefix server test` if that port is already occupied.

To regenerate the meadow and its collision manifest together:

```sh
npm --prefix client run generate:meadow
```

With the client development server running, visit
**http://localhost:5173/meadow-preview.html** for the standalone asset viewer.
It includes camera presets and a GLB download; it is separate from gameplay.

## Project structure

```text
client/
  src/             Rendering, characters, movement, networking, and UI
  public/models/   Generated fantasy-meadow.glb environment
  scripts/meadow/  Reproducible asset generator and validation
  tests/           Client unit and regression tests
server/
  src/             Colyseus room, player state, chat, and validation
  tests/           Server validation and room integration tests
docs/              Setup, asset documentation, and design history
render.yaml        Render game-server deployment configuration
```

## Deployment

- **Server:** the included [Render configuration](render.yaml) installs locked
  dependencies, checks TypeScript, starts the server, and exposes `/health`.
- **Client:** build the `client` package on Cloudflare Pages with
  `npm ci && npm run build`, publish `dist`, and set
  `VITE_SERVER_URL=wss://<your-render-service>.onrender.com`.

Use HTTPS/WSS in production. Deploy **one game-server process/instance**:
the single-world guarantee is process-local, not shared across multiple
servers. Free hosting may sleep or cold-start.

See the [deployment guide](docs/deployment.md) for configuration and a
two-browser verification checklist.

## Current scope

- Desktop keyboard/mouse play; mobile/touch controls are not implemented.
- No accounts or persistent world state.
- Blocks apply to a room/session identity, not a nickname. They cannot follow
  someone who reconnects as a new player.
- The 60 fps goal still needs target-device profiling; it is not a performance
  guarantee.
- Production HTTPS/WSS behavior still needs deployment verification.

## More documentation

- [Environment layout, GLB constraints, and asset generation](docs/fantasy-meadow.md)
- [Setup, deployment, and manual verification](docs/deployment.md)
- [Design specification and scope updates](docs/superpowers/specs/2026-09-19-hangout-world-design.md)
