import * as THREE from 'three';
import { getStateCallbacks } from 'colyseus.js';
import { KeyboardInput } from './input/keyboard';
import { createPlayerState, updatePlayer, PLAYER_HEIGHT, type MoveInput } from './player/controller';
import { animateAvatar, createAvatar, disposeAvatar, loadAvatar } from './player/avatar';
import { createNameTag } from './player/nametag';
import { OrbitCamera } from './camera/orbit';
import { buildMap, SPAWN } from './world/map';
import { showJoinScreen } from './ui/joinScreen';
import { joinWorld, reconnectWorld, AVATAR_COLORS, type GameRoom } from './net/connection';
import { RemotePlayers } from './net/remotePlayers';
import { createChatPanel } from './ui/chatPanel';
import { hideBubble, showBubble } from './player/chatBubble';
import { addVoiceIndicator, setSpeaking } from './player/voiceIndicator';
import { createAtmosphere } from './world/atmosphere';
import './ui/game.css';
import { createRoster } from './ui/roster';
import { retryReconnect } from './net/reconnect';
import { createConnectionOverlay } from './ui/connectionOverlay';
import { ProximityVoice, type IceServerConfig } from './net/proximityVoice';
import { createVoiceControl, type VoiceControl } from './ui/voiceControl';
import { PROXIMITY } from './net/proximity';
import { createGraphics } from './ui/graphics';

const SEND_EVERY_N_STEPS = 4; // 60 Hz / 4 = 15 Hz
const TURN_RESPONSE = 12;

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function turnToward(from: number, to: number, dt: number): number {
  return from + angleDelta(from, to) * (1 - Math.exp(-TURN_RESPONSE * dt));
}

showJoinScreen(async (name, colorIndex) => {
  const room = await joinWorld(name, colorIndex);
  try {
    await start(room, name, colorIndex);
  } catch (err) {
    room.leave();
    throw err instanceof Error && err.message
      ? err
      : new Error('world failed to load — please try again');
  }
});

async function start(room: GameRoom, name: string, colorIndex: number): Promise<void> {
  // --- World ---
  const avatar = createAvatar(AVATAR_COLORS[colorIndex] ?? AVATAR_COLORS[0]);
  const [mapResult, avatarResult] = await Promise.allSettled([buildMap(), loadAvatar(avatar, colorIndex)]);
  if (mapResult.status === 'rejected' || avatarResult.status === 'rejected') {
    if (mapResult.status === 'fulfilled') mapResult.value.dispose();
    disposeAvatar(avatar);
    throw mapResult.status === 'rejected' ? mapResult.reason : (avatarResult as PromiseRejectedResult).reason;
  }
  const map = mapResult.value;

  // --- Renderer / scene ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd4e8da);
  scene.fog = new THREE.Fog(0xd4e8da, 130, 650);
  scene.add(map.group);
  scene.add(createAtmosphere());
  const hud = document.createElement('aside');
  hud.id = 'world-hud';
  hud.innerHTML = '<strong>Meadow Valley</strong><small>WASD move / Shift run / Space jump</small><small>Click world to look / Escape to release / Scroll to zoom</small><small>Enter to chat</small>';
  document.body.append(hud);
  const graphics = createGraphics(renderer, map, hud);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1400);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    graphics.resize();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Local player ---
  let myTag = createNameTag(name);
  myTag.position.set(0, PLAYER_HEIGHT + 0.45, 0);
  avatar.add(myTag);
  addVoiceIndicator(avatar);
  scene.add(avatar);

  const input = new KeyboardInput();
  const orbit = new OrbitCamera();
  let player = createPlayerState(SPAWN.x, SPAWN.y, SPAWN.z);
  let avatarHeading = player.heading;
  let connected = true;
  const lifetime = new AbortController();

  // --- Remote players ---
  const remotes = new RemotePlayers((pose) => pose.y <= map.collision.supportHeightAt(pose.x, pose.z, pose.y, 0.4) + 0.08);
  scene.add(remotes.group);
  let voiceControl!: VoiceControl;
  const voice = new ProximityVoice({
    selfId: () => room.sessionId,
    positionFor: (id) => {
      if (id === room.sessionId) return player;
      const root = remotes.getRoot(id);
      return root ? root.position : undefined;
    },
    send: (type, message) => { if (connected) room.send(type, message); },
    onStatus: (status) => {
      voiceControl.setStatus(status);
      voiceControl.setEnabled(voice.isEnabled);
    },
    onPeerStatus: (id, status) => voiceControl.setDebugStatus(`${id.slice(0, 8)}: ${status}`),
    onSpeaking: (id, speaking) => remotes.setSpeaking(id, speaking),
    onSelfSpeaking: (speaking) => setSpeaking(avatar, speaking),
  }, PROXIMITY.voiceRadius);
  voiceControl = createVoiceControl({
    enable: () => { void voice.enable().then(() => voiceControl.setEnabled(voice.isEnabled)); },
    disable: () => voice.disable(),
    toggleMute: () => { voice.setMuted(!voice.isMuted); voiceControl.setMuted(voice.isMuted); },
    toggleIncoming: () => { voice.setIncomingEnabled(!voice.isIncomingEnabled); voiceControl.setIncoming(voice.isIncomingEnabled); },
  });
  const chat = createChatPanel((text) => {
    if (connected) room.send('proximity-chat', { text });
  });
  const roster = createRoster(room.roomId, room.sessionId, () => {
    for (const id of room.state.players.keys()) {
      if (!roster.isBlocked(id)) continue;
      chat.hideSender(id);
      const root = remotes.getRoot(id);
      if (root) hideBubble(root);
    }
  }, (id, muted) => voice.setPeerMuted(id, muted));
  window.addEventListener('pagehide', () => {
    lifetime.abort();
    voice.dispose();
    voiceControl.dispose();
    chat.dispose();
    roster.dispose();
    input.dispose();
    renderer.setAnimationLoop(null);
    graphics.dispose();
    remotes.clear();
    disposeAvatar(avatar);
    map.dispose();
    renderer.dispose();
    if (connected) void room.leave();
  }, { once: true });

  function bindRoom(channel: GameRoom): void {
    const $ = getStateCallbacks(channel);
    $(channel.state).players.onAdd((p, sessionId) => {
      roster.add(sessionId, p.name);
      if (sessionId === channel.sessionId) {
        // The server allocates one of the deterministic plaza pads on every
        // new join; reconnects also restore the authoritative pose.
        player = { ...createPlayerState(p.x, p.y, p.z), heading: p.heading };
        avatarHeading = p.heading;
        if (p.name !== name) {
          avatar.remove(myTag);
          myTag.material.map?.dispose();
          myTag.material.dispose();
          myTag = createNameTag(p.name);
          myTag.position.set(0, PLAYER_HEIGHT + 0.45, 0);
          avatar.add(myTag);
          name = p.name;
        }
        return;
      }
      remotes.add(sessionId, p);
      voice.setPeerMuted(sessionId, roster.isMuted(sessionId));
      $(p).onChange(() => {
        remotes.updateTarget(sessionId, { x: p.x, y: p.y, z: p.z, heading: p.heading });
      });
    });
    $(channel.state).players.onRemove((_p, sessionId) => {
      remotes.remove(sessionId);
      voice.removePlayer(sessionId);
      roster.remove(sessionId);
    });
    channel.onMessage('proximity-chat', ({ id, text }: { id: string; text: string }) => {
      if (roster.isBlocked(id)) return;
      const sender = channel.state.players.get(id);
      const isSelf = id === channel.sessionId;
      chat.addMessage(sender?.name ?? 'Unknown player', text, isSelf, id);
      const target = isSelf ? avatar : remotes.getRoot(id);
      if (target) showBubble(target, text);
    });
    channel.onMessage('voice-config', ({ iceServers }: { iceServers?: IceServerConfig[] }) => {
      console.info('[voice][colyseus][received] voice-config', { iceServers });
      if (Array.isArray(iceServers)) voice.setIceServers(iceServers);
    });
    channel.onMessage('voice-nearby', ({ id, nearby }: { id: string; nearby: boolean }) => {
      console.info('[voice][colyseus][received] voice-nearby', { id, nearby });
      voice.setNearby(id, nearby);
    });
    channel.onMessage('voice-signal', ({ from, signal }: { from: string; signal: unknown }) => {
      console.info('[voice][colyseus][received] voice-signal', { from, signal });
      void voice.handleSignal(from, signal);
    });
    // Register listeners before asking the server for a per-session ICE config.
    console.info('[voice][colyseus][sent] voice-config');
    channel.send('voice-config', {});
    console.info('[voice][colyseus][sent] proximity-capable');
    channel.send('proximity-capable', {});
    channel.onLeave(() => {
      voice.resetConnections();
      if (!lifetime.signal.aborted) void recover(channel.reconnectionToken);
    });
  }

  async function recover(token: string): Promise<void> {
    if (!connected) return;
    connected = false;
    input.clear();
    const overlay = createConnectionOverlay();
    try {
      const restored = await retryReconnect(() => reconnectWorld(token), lifetime.signal, 6, 500, (late) => {
        void late.leave().catch(() => console.warn('Could not close a late reconnection'));
      });
      if (lifetime.signal.aborted) { void restored.leave(); return; }
      room = restored;
      remotes.clear();
      roster.clear();
      bindRoom(room);
      connected = true;
      if (voice.isEnabled) room.send('voice-ready', { enabled: true });
      input.clear();
      overlay.dispose();
    } catch (error) {
      if (!lifetime.signal.aborted) overlay.failed(error instanceof Error ? error.message : 'The server is unavailable.');
    }
  }
  bindRoom(room);

  // Enter opens chat when the game has focus (never while already typing).
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('select, button, summary')) return;
    if (connected && e.key === 'Enter' && !chat.isOpen) {
      e.preventDefault();
      chat.open();
      input.clear();
    }
  });

  // Click the world once to capture the pointer; Escape releases it. UI
  // controls never capture the pointer because they are not the canvas.
  let pointerLockFallback = false;
  renderer.domElement.addEventListener('click', () => {
    const request = renderer.domElement.requestPointerLock();
    if (request && typeof request.catch === 'function') {
      void request.catch(() => {
        pointerLockFallback = true;
        console.info('Pointer lock was not granted; using canvas mouse-look fallback.');
      });
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === renderer.domElement
      || (pointerLockFallback && e.target === renderer.domElement)) {
      orbit.applyLook(e.movementX, e.movementY);
    }
  });
  renderer.domElement.addEventListener('wheel', (e) => orbit.applyZoom(e.deltaY), { passive: true });
  window.addEventListener('blur', () => { input.clear(); });
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('button, input, details')) input.clear();
  });

  // --- Fixed-timestep loop ---
  const STEP = 1 / 60;
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const frameMs = now - last;
    // Bound catch-up work after tab suspension or a long asset upload.
    accumulator += Math.min(frameMs / 1000, STEP * 5);
    last = now;

    while (accumulator >= STEP) {
      const editing = document.activeElement instanceof HTMLElement
        && Boolean(document.activeElement.closest('input, textarea, select, button, summary'));
      const k = chat.isOpen || !connected || editing
        ? { moveX: 0, moveZ: 0, run: false, jump: false }
        : input.state;
      const f = orbit.forward();
      const r = orbit.right();
      const move: MoveInput = {
        dirX: f.x * k.moveZ + r.x * k.moveX,
        dirZ: f.z * k.moveZ + r.z * k.moveX,
        run: k.run,
        jump: k.jump,
      };
      const previousX = player.x;
      const previousZ = player.z;
      if (connected) player = updatePlayer(player, move, STEP, map.collision);
      const actualSpeed = Math.hypot(player.x - previousX, player.z - previousZ) / STEP;
      if (actualSpeed > 0.01) {
        const movementHeading = Math.atan2(player.x - previousX, player.z - previousZ);
        avatarHeading = turnToward(avatarHeading, movementHeading, STEP);
      }
      animateAvatar(avatar, stepCount * STEP, actualSpeed, player.onGround, STEP);

      stepCount++;
      if (connected && stepCount % SEND_EVERY_N_STEPS === 0) {
        room.send('move', { x: player.x, y: player.y, z: player.z, heading: player.heading });
      }
      accumulator -= STEP;
    }

    avatar.position.set(player.x, player.y, player.z);
    avatar.rotation.y = avatarHeading;
    remotes.tick(Math.min(frameMs / 1000, 0.1), player.x, player.z);
    voice.tick();

    const off = orbit.offset();
    camera.position.set(player.x + off.x, player.y + off.y, player.z + off.z);
    camera.lookAt(player.x, player.y + 1.5, player.z);

    map.update(player.x, player.y, player.z, now, graphics.quality);
    renderer.render(scene, camera);
    graphics.record(frameMs, now);
  });
}
