import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface Section { key: string; x: number; z: number; url: string }
interface Loaded { root: THREE.Group; lastUsed: number }

export function disposeGeometry(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

export class StreamedMap {
  private loader = new GLTFLoader();
  private loaded = new Map<string, Loaded>();
  private pending = new Map<string, Promise<void>>();
  private retryAt = new Map<string, number>();
  private fallback = new Map<string, THREE.Object3D>();
  private sections: Section[] = [];
  private stopped = false;
  private nextUpdate = 0;
  private x = 0;
  private z = 8;
  readonly group = new THREE.Group();
  get activeSections(): number { return this.loaded.size; }
  get pendingSections(): number { return this.pending.size; }

  async initialize(): Promise<void> {
    const [response, overview] = await Promise.all([
      fetch('/models/chunks/manifest.json'), this.loader.loadAsync('/models/chunks/overview.glb'),
    ]);
    if (!response.ok) throw new Error('Could not load map section manifest');
    this.sections = await response.json() as Section[];
    this.group.add(overview.scene);
    overview.scene.traverse(o => {
      if (typeof o.userData.chunk === 'string') this.fallback.set(o.userData.chunk, o);
      if (o instanceof THREE.Mesh) o.receiveShadow = true;
    });
    // Just the four central cells block joining. Others are prefetched in the background.
    const initial = this.sections.filter(s => Math.abs(s.x) <= 15 && Math.abs(s.z) <= 15);
    for (let i=0; i<initial.length; i+=2) await Promise.all(initial.slice(i,i+2).map(s=>this.load(s)));
  }

  private load(section: Section): Promise<void> {
    const existing = this.pending.get(section.key);
    if (existing) return existing;
    const promise = this.loader.loadAsync(section.url).then(gltf => {
      if (this.stopped || Math.hypot(section.x-this.x,section.z-this.z)>180) {
        disposeGeometry(gltf.scene); return;
      }
      gltf.scene.traverse(o => {
        if (o instanceof THREE.Mesh) { o.receiveShadow = true; o.castShadow = !o.userData.terrain; }
      });
      this.group.add(gltf.scene);
      this.loaded.set(section.key,{root:gltf.scene,lastUsed:performance.now()});
      const low = this.fallback.get(section.key);
      if (low) low.visible = false;
      this.retryAt.delete(section.key);
    }).catch(error => {
      this.retryAt.set(section.key, performance.now()+10000);
      console.warn(`Map section ${section.key} will retry`,error);
    }).finally(()=>this.pending.delete(section.key));
    this.pending.set(section.key,promise);
    return promise;
  }

  update(x: number, z: number, now: number, radius: number): void {
    this.x=x; this.z=z;
    if (this.stopped || now<this.nextUpdate) return;
    this.nextUpdate=now+250;
    const ordered = [...this.sections].sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));
    for (const s of ordered) {
      const distance=Math.hypot(s.x-x,s.z-z);
      const entry=this.loaded.get(s.key);
      if (entry) {
        if (distance<radius+35) entry.lastUsed=now;
        if (distance>radius+60 && now-entry.lastUsed>5000) {
          this.group.remove(entry.root); disposeGeometry(entry.root); this.loaded.delete(s.key);
          const low=this.fallback.get(s.key); if (low) low.visible=true;
        }
      } else if (distance<radius+35 && this.pending.size<2 && now>=(this.retryAt.get(s.key)??0)) {
        void this.load(s);
      }
    }
  }

  dispose(): void {
    this.stopped=true;
    disposeGeometry(this.group);
    this.group.clear(); this.loaded.clear();
    this.fallback.clear(); this.retryAt.clear();
  }
}
