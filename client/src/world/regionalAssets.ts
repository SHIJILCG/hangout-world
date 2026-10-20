import world from '../../../shared/world.json';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGrass, GRASS_DISTANCES, grassDensityStride } from './grass';
import { disposeGeometry } from './streaming';

interface PropPolicy {lodDistances:number[];maxDistance:number;castShadow:boolean}
interface Placement {asset:string;x:number;y:number;z:number;scale:number;rotation:number}
interface Template {refs:number;promise:Promise<THREE.Group>}
interface Resident {root:THREE.Group;assets:Set<string>;cancelled:boolean;ready:boolean}

/** Section-owned instance buffers, reference-counted shared GLB resources. */
export class RegionalAssets {
  readonly group=new THREE.Group();
  private placements:Record<string,Placement[]>={};
  private catalog:Record<string,PropPolicy>={};
  private cache=new Map<string,Template>();
  private sections=new Map<string,Resident>();
  private retryAt=new Map<string,number>();
  private nextUpdate=0;
  private stopped=false;
  private loader=new GLTFLoader();
  private activeRequests=0;
  private queue:Array<()=>void>=[];
  get instanceCount():number {let n=0;this.group.traverse(o=>{if(o instanceof THREE.InstancedMesh)n+=o.count;});return n;}
  get templateCount():number{return this.cache.size;}

  async initialize():Promise<void> {
    const response=await fetch('/models/regions.json');
    if(!response.ok)throw new Error('Could not load regional scenery manifest');
    const layout=await response.json();this.placements=layout.sections;this.catalog=layout.catalog??{};
  }

  private request(asset:string):Promise<THREE.Group> {
    return new Promise((resolve,reject)=>{
      const run=()=>{
        this.activeRequests++;
        const load=asset==='grass'?Promise.resolve(createGrass()):this.loader.loadAsync(`/environment-expansion/${asset}.glb`).then(g=>g.scene);
        load.then(resolve,reject).finally(()=>{this.activeRequests--;this.queue.shift()?.();});
      };
      if(this.activeRequests<2)run();else this.queue.push(run);
    });
  }
  private acquire(asset:string):Promise<THREE.Group> {
    let entry=this.cache.get(asset);
    if(!entry){entry={refs:0,promise:this.request(asset)};this.cache.set(asset,entry);}
    entry.refs++;return entry.promise;
  }
  private release(asset:string):void {
    const entry=this.cache.get(asset);if(!entry)return;
    if(--entry.refs===0){this.cache.delete(asset);void entry.promise.then(disposeGeometry,()=>{});}
  }
  private remove(key:string):void {
    const section=this.sections.get(key);if(!section)return;
    section.cancelled=true;this.sections.delete(key);this.group.remove(section.root);
    // Geometry/material lifetime belongs to the template cache, not each instance.
    section.root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});
    section.root.clear();
    if(section.ready)for(const asset of section.assets)this.release(asset);
  }
  private async add(key:string):Promise<void> {
    const placements=this.placements[key];
    if(!placements?.length)return;
    const section:Resident={root:new THREE.Group(),assets:new Set(placements.map(p=>p.asset)),cancelled:false,ready:false};
    this.sections.set(key,section);
    const assets=[...section.assets];
    const results=await Promise.allSettled(assets.map(asset=>this.acquire(asset)));
    section.ready=true;
    if(section.cancelled||this.stopped||results.some(r=>r.status==='rejected')) {
      for(const asset of assets)this.release(asset);
      if(!section.cancelled){this.sections.delete(key);this.retryAt.set(key,performance.now()+10000);}
      return;
    }
    const transform=new THREE.Object3D();
    for(let i=0;i<assets.length;i++) {
      const result=results[i];if(result.status!=='fulfilled')continue;
      const asset=assets[i],list=placements.filter(p=>p.asset===asset);
      result.value.traverse(source=>{
        if(!(source instanceof THREE.Mesh))return;
        const match=source.name.match(/LOD(\d)/);const lod=Number(match?.[1]??0);
        const materials=Array.isArray(source.material)?source.material:[source.material];
        if(asset==='lantern')for(const material of materials)if(material instanceof THREE.MeshStandardMaterial){
          material.emissive.setHex(0xffa447);material.emissiveIntensity=0.55;
        }
        // Opaque grass also has baked lower-detail blade counts.
        const selected=asset==='grass'?list.filter((_,index)=>index%grassDensityStride(lod)===0):list;
        const instances=new THREE.InstancedMesh(source.geometry,source.material,selected.length);
        instances.visible=false; // Wait for the next distance selection; never flash all LODs together.
        selected.forEach((p,index)=>{
          transform.position.set(p.x,p.y,p.z);transform.rotation.set(0,p.rotation,0);transform.scale.setScalar(p.scale);
          transform.updateMatrix();instances.setMatrixAt(index,transform.matrix);
        });
        instances.castShadow=asset!=='grass'&&(this.catalog[asset]?.castShadow??true)&&lod===0;instances.receiveShadow=true;
        instances.userData.detail={asset,lod,hasLod:asset==='grass'||asset==='tree'||asset==='apple'||asset.startsWith('forest_')};
        instances.computeBoundingSphere();section.root.add(instances);
      });
    }
    this.group.add(section.root);
  }
  update(keys:Iterable<string>,x:number,z:number,now:number,quality:number):void {
    if(this.stopped||now<this.nextUpdate)return;this.nextUpdate=now+250;
    const wanted=new Set(keys);
    for(const key of this.sections.keys())if(!wanted.has(key))this.remove(key);
    for(const key of wanted)if(!this.sections.has(key)&&now>=(this.retryAt.get(key)??0))void this.add(key);
    for(const [key,section] of this.sections){
      const [cx,cz]=key.split(',').map(Number),distance=Math.hypot(cx*world.sectionSize+world.sectionSize/2-x,cz*world.sectionSize+world.sectionSize/2-z);
      for(const child of section.root.children){
        const {asset,lod,hasLod}=child.userData.detail;
        if(asset==='grass'){
          const scaledDistance=distance/(quality===0?.65:quality===1?.85:1);
          child.visible=scaledDistance>=GRASS_DISTANCES[lod]&&scaledDistance<GRASS_DISTANCES[lod+1];
          continue;
        }
        const policy=this.catalog[asset];
        if(policy){
          const selected=policy.lodDistances.filter(limit=>distance>=limit*(quality===0?.75:1)).length;
          child.visible=distance<policy.maxDistance&&lod===selected;
          continue;
        }
        const near=distance<(quality===0?30:50);
        const forest=asset.startsWith('forest_');
        const forestLod=distance<(quality===0?24:36)?0:distance<75?1:2;
        child.visible=forest?distance<160&&lod===forestLod:(!hasLod||lod===(near?0:1));
      }
    }
  }
  dispose():void {this.stopped=true;for(const key of this.sections.keys())this.remove(key);this.group.clear();}
}
