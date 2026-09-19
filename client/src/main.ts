import * as THREE from 'three';
import { KeyboardInput } from './input/keyboard';
import { createPlayerState, updatePlayer, type MoveInput } from './player/controller';
import { createAvatar } from './player/avatar';
import { OrbitCamera } from './camera/orbit';
import { buildMap, SPAWN } from './world/map';

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

// --- World + player ---
const map = buildMap();
scene.add(map.group);

const avatar = createAvatar();
scene.add(avatar);

const input = new KeyboardInput();
const orbit = new OrbitCamera();
let player = createPlayerState(SPAWN.x, SPAWN.y, SPAWN.z);

// --- Mouse: drag to orbit, wheel to zoom ---
let dragging = false;
renderer.domElement.addEventListener('mousedown', () => { dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (dragging) orbit.applyDrag(e.movementX, e.movementY);
});
window.addEventListener('wheel', (e) => orbit.applyZoom(e.deltaY), { passive: true });

// --- Fixed-timestep loop: logic at 60 Hz, render every animation frame ---
const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  accumulator += Math.min((now - last) / 1000, 0.25);  // clamp after tab-away
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
    accumulator -= STEP;
  }

  avatar.position.set(player.x, player.y, player.z);
  avatar.rotation.y = player.heading;

  const off = orbit.offset();
  camera.position.set(player.x + off.x, player.y + off.y, player.z + off.z);
  camera.lookAt(player.x, player.y + 1.5, player.z);

  renderer.render(scene, camera);
});
