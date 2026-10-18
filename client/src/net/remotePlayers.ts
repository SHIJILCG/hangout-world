import * as THREE from 'three';
import { animateAvatar, createAvatar, disposeAvatar, loadAvatar } from '../player/avatar';
import { createNameTag } from '../player/nametag';
import { PLAYER_HEIGHT } from '../player/controller';
import { AVATAR_COLORS } from './connection';
import { stepToward, type Pose } from './interpolation';
import { hideBubble } from '../player/chatBubble';
import { addVoiceIndicator, setSpeaking } from '../player/voiceIndicator';

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
  animationTime: number;
  ridePose?: Pose;
}

export class RemotePlayers {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private time = 0;

  constructor(private isGrounded: (pose: Pose) => boolean = () => true) {}

  add(sessionId: string, info: RemoteInfo): void {
    if (this.entries.has(sessionId)) this.remove(sessionId);
    const color = AVATAR_COLORS[info.colorIndex] ?? AVATAR_COLORS[0];
    const root = createAvatar(color);
    void loadAvatar(root, info.colorIndex).catch((error: unknown) => console.error('Could not load medieval character', error));
    const tag = createNameTag(info.name);
    tag.position.set(0, PLAYER_HEIGHT + 0.45, 0);
    root.add(tag);
    addVoiceIndicator(root);

    const pose: Pose = { x: info.x, y: info.y, z: info.z, heading: info.heading };
    root.position.set(pose.x, pose.y, pose.z);
    root.rotation.y = pose.heading;

    this.group.add(root);
    this.entries.set(sessionId, { root, pose, target: { ...pose }, animationTime: 0 });
  }

  updateTarget(sessionId: string, pose: Pose): void {
    const entry = this.entries.get(sessionId);
    if (entry) entry.target = { ...pose };
  }

  remove(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.group.remove(entry.root);
    hideBubble(entry.root);
    disposeAvatar(entry.root);
    this.entries.delete(sessionId);
  }

  getRoot(sessionId: string): THREE.Group | undefined {
    return this.entries.get(sessionId)?.root;
  }

  setRidePose(sessionId:string,pose:Pose|null,driving=false):void {
    const entry=this.entries.get(sessionId);if(!entry)return;
    entry.ridePose=pose??undefined;entry.root.userData.mounted=!!pose;
    entry.root.userData.driving=driving;
  }

  setSpeaking(sessionId: string, speaking: boolean): void {
    const entry = this.entries.get(sessionId);
    if (entry) setSpeaking(entry.root, speaking);
  }

  tick(dt: number, viewerX = 0, viewerZ = 0): void {
    if (dt <= 0) return;
    this.time += dt;
    for (const entry of this.entries.values()) {
      const previous = entry.pose;
      entry.pose = entry.ridePose ? {...entry.ridePose} : stepToward(entry.pose, entry.target, dt);
      entry.root.position.set(entry.pose.x, entry.pose.y, entry.pose.z);
      entry.root.rotation.y = entry.pose.heading;
      const speed = Math.min(8, Math.hypot(entry.pose.x - previous.x, entry.pose.z - previous.z) / dt);
      const distance=Math.hypot(entry.pose.x-viewerX,entry.pose.z-viewerZ);
      entry.root.visible=distance<150;
      entry.animationTime+=dt;
      const interval=distance<30?0:distance<70?1/20:1/10;
      if (entry.root.visible && entry.animationTime>=interval) {
        animateAvatar(entry.root, this.time, speed, this.isGrounded(entry.pose), Math.min(entry.animationTime,0.2));
        entry.animationTime=0;
      } else if (!entry.root.visible) entry.animationTime=0;
    }
  }

  clear(): void {
    for (const id of this.entries.keys()) this.remove(id);
  }
}
