import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './controller';

export function createAvatar(color = 0x4f8ef7): THREE.Group {
  const group = new THREE.Group();

  const bodyHeight = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, bodyHeight, 6, 16),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = PLAYER_HEIGHT / 2;   // capsule center → feet at y=0
  body.castShadow = true;
  group.add(body);

  // Nose: shows which way the avatar faces (avatar faces +z at heading 0,
  // matching controller.heading = atan2(dirX, dirZ)).
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  nose.position.set(0, PLAYER_HEIGHT * 0.75, PLAYER_RADIUS + 0.1);
  group.add(nose);

  return group;
}
