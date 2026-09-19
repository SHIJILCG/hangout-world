import * as THREE from 'three';
import { createAvatar } from '../player/avatar';
import { createNameTag } from '../player/nametag';
import { PLAYER_HEIGHT } from '../player/controller';
import { AVATAR_COLORS } from './connection';
import { stepToward, type Pose } from './interpolation';

export interface RemoteInfo {
  name: string;
  colorIndex: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface Entry {
  root: THREE.Group;
  pose: Pose;     // rendered (smoothed) pose
  target: Pose;   // latest server pose
}

export class RemotePlayers {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();

  add(sessionId: string, info: RemoteInfo): void {
    if (this.entries.has(sessionId)) this.remove(sessionId);
    const color = AVATAR_COLORS[info.colorIndex] ?? AVATAR_COLORS[0];
    const root = createAvatar(color);
    const tag = createNameTag(info.name);
    tag.position.set(0, PLAYER_HEIGHT + 0.45, 0);
    root.add(tag);

    const pose: Pose = { x: info.x, y: info.y, z: info.z, heading: info.heading };
    root.position.set(pose.x, pose.y, pose.z);
    root.rotation.y = pose.heading;

    this.group.add(root);
    this.entries.set(sessionId, { root, pose, target: { ...pose } });
  }

  updateTarget(sessionId: string, pose: Pose): void {
    const entry = this.entries.get(sessionId);
    if (entry) entry.target = { ...pose };
  }

  remove(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.group.remove(entry.root);
    this.entries.delete(sessionId);
  }

  tick(dt: number): void {
    for (const entry of this.entries.values()) {
      entry.pose = stepToward(entry.pose, entry.target, dt);
      entry.root.position.set(entry.pose.x, entry.pose.y, entry.pose.z);
      entry.root.rotation.y = entry.pose.heading;
    }
  }
}
