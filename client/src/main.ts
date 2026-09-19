import * as THREE from 'three';
import { getStateCallbacks, type Room } from 'colyseus.js';
import { KeyboardInput } from './input/keyboard';
import { createPlayerState, updatePlayer, PLAYER_HEIGHT, type MoveInput } from './player/controller';
import { createAvatar } from './player/avatar';
import { createNameTag } from './player/nametag';
import { OrbitCamera } from './camera/orbit';
import { buildMap, SPAWN } from './world/map';
import { showJoinScreen } from './ui/joinScreen';
import { joinWorld, AVATAR_COLORS } from './net/connection';
import { RemotePlayers } from './net/remotePlayers';

const SEND_EVERY_N_STEPS = 4; // 60 Hz / 4 = 15 Hz

showJoinScreen(async (name, colorIndex) => {
  const room = await joinWorld(name, colorIndex);
  start(room, name, colorIndex);
});

function start(room: Room, name: string, colorIndex: number): void {
  // --- Renderer / scene ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 90);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- World + local player ---
  const map = buildMap();
  scene.add(map.group);

  const avatar = createAvatar(AVATAR_COLORS[colorIndex] ?? AVATAR_COLORS[0]);
  const myTag = createNameTag(name);
  myTag.position.set(0, PLAYER_HEIGHT + 0.45, 0);
  avatar.add(myTag);
  scene.add(avatar);

  const input = new KeyboardInput();
  const orbit = new OrbitCamera();
  let player = createPlayerState(SPAWN.x, SPAWN.y, SPAWN.z);

  // --- Remote players ---
  const remotes = new RemotePlayers();
  scene.add(remotes.group);

  const $ = getStateCallbacks(room);
  $(room.state).players.onAdd((p: any, sessionId: string) => {
    if (sessionId === room.sessionId) {
      // Local player is predicted locally, but the name may have been
      // sanitized server-side (e.g. a profane name replaced with "Guest") —
      // make sure the local tag reflects what everyone else actually sees.
      if (p.name !== name) {
        avatar.remove(myTag);
        const sanitizedTag = createNameTag(p.name);
        sanitizedTag.position.copy(myTag.position);
        avatar.add(sanitizedTag);
      }
      return;
    }
    remotes.add(sessionId, {
      name: p.name, colorIndex: p.colorIndex,
      x: p.x, y: p.y, z: p.z, heading: p.heading,
    });
    $(p).onChange(() => {
      remotes.updateTarget(sessionId, { x: p.x, y: p.y, z: p.z, heading: p.heading });
    });
  });
  $(room.state).players.onRemove((_p: any, sessionId: string) => {
    remotes.remove(sessionId);
  });

  room.onLeave(() => {
    // Reload back to the join screen on disconnect — simplest reliable recovery.
    location.reload();
  });

  // --- Mouse: drag to orbit, wheel to zoom ---
  let dragging = false;
  renderer.domElement.addEventListener('mousedown', () => { dragging = true; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (dragging) orbit.applyDrag(e.movementX, e.movementY);
  });
  window.addEventListener('wheel', (e) => orbit.applyZoom(e.deltaY), { passive: true });

  // --- Fixed-timestep loop ---
  const STEP = 1 / 60;
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    accumulator += Math.min((now - last) / 1000, 0.25);
    last = now;

    while (accumulator >= STEP) {
      const k = input.state;
      const f = orbit.forward();
      const r = orbit.right();
      const move: MoveInput = {
        dirX: f.x * k.moveZ + r.x * k.moveX,
        dirZ: f.z * k.moveZ + r.z * k.moveX,
        run: k.run,
        jump: k.jump,
      };
      player = updatePlayer(player, move, STEP, map.collision);
      remotes.tick(STEP);

      stepCount++;
      if (stepCount % SEND_EVERY_N_STEPS === 0) {
        room.send('move', { x: player.x, y: player.y, z: player.z, heading: player.heading });
      }
      accumulator -= STEP;
    }

    avatar.position.set(player.x, player.y, player.z);
    avatar.rotation.y = player.heading;

    const off = orbit.offset();
    camera.position.set(player.x + off.x, player.y + off.y, player.z + off.z);
    camera.lookAt(player.x, player.y + 1.5, player.z);

    renderer.render(scene, camera);
  });
}
