import * as THREE from 'three';
import { FISHING, FISHING_SPOTS } from '../../../shared/fishing';
import type { CollisionWorld } from '../world/collision';
import type { GameRoom } from '../net/connection';
import { createNameTag } from './nametag';

/** Three shared shore rods. Static geometry; only float colors change on state updates. */
export class Fishing {
  readonly group=new THREE.Group();
  private panel=document.createElement('div');
  private status=document.createElement('small');
  private action=document.createElement('button');
  private cancel=document.createElement('button');
  private floats:THREE.InstancedMesh;
  private floatColors:string[]=[];
  private selected='';
  private message='';
  private messageUntil=0;
  private pendingUntil=0;
  private connected=false;
  private unbind:(()=>void)|undefined;

  constructor(private collision:CollisionWorld,private room:()=>GameRoom,private enabled:()=>boolean,hud:HTMLElement,signal:AbortSignal){
    this.group.name='Shared pond fishing spots';
    const wood=new THREE.MeshStandardMaterial({color:0x795137,roughness:1});
    const shore=new THREE.MeshStandardMaterial({color:0xb6a375,roughness:1});
    const floatMaterial=new THREE.MeshStandardMaterial({roughness:1});
    const rods=new THREE.InstancedMesh(new THREE.CylinderGeometry(.025,.04,1,5),wood,3);
    const markers=new THREE.InstancedMesh(new THREE.CylinderGeometry(.6,.6,.04,8),shore,3);
    this.floats=new THREE.InstancedMesh(new THREE.SphereGeometry(.12,6,4),floatMaterial,3);
    const linePoints:THREE.Vector3[]=[],transform=new THREE.Object3D();
    // The original flat pond is partly buried by the rolling heightfield. A small
    // opaque surface follows it without changing the walkable collision ground.
    const waterPositions:number[]=[],waterIndices:number[]=[],segments=24,rings=4;
    waterPositions.push(26,collision.groundAt(26,-23)+.045,-23);
    for(let ring=1;ring<=rings;ring++)for(let i=0;i<segments;i++){
      const angle=i*Math.PI*2/segments,rx=Math.cos(angle)*6.5*ring/rings,rz=Math.sin(angle)*4.5*ring/rings;
      const x=26+rx*Math.cos(.15)+rz*Math.sin(.15),z=-23-rx*Math.sin(.15)+rz*Math.cos(.15);
      waterPositions.push(x,collision.groundAt(x,z)+.045,z);
      const current=1+(ring-1)*segments+i,next=1+(ring-1)*segments+(i+1)%segments;
      if(ring===1)waterIndices.push(0,next,current);
      else{const inner=current-segments,innerNext=next-segments;waterIndices.push(inner,next,current,inner,innerNext,next);}
    }
    const waterGeometry=new THREE.BufferGeometry();waterGeometry.setAttribute('position',new THREE.Float32BufferAttribute(waterPositions,3));waterGeometry.setIndex(waterIndices);waterGeometry.computeVertexNormals();
    const water=new THREE.Mesh(waterGeometry,new THREE.MeshStandardMaterial({color:0x4d9ea7,roughness:.6}));water.name='Fishing pond surface';this.group.add(water);
    FISHING_SPOTS.forEach((spot,index)=>{
      const ground=collision.groundAt(spot.x,spot.z);
      const start=new THREE.Vector3(spot.x,ground+.35,spot.z);
      const tip=new THREE.Vector3(spot.x+(spot.waterX-spot.x)*.55,ground+2.2,spot.z+(spot.waterZ-spot.z)*.55);
      transform.position.copy(start).add(tip).multiplyScalar(.5);
      transform.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tip.clone().sub(start).normalize());
      transform.scale.set(1,start.distanceTo(tip),1);transform.updateMatrix();rods.setMatrixAt(index,transform.matrix);
      transform.quaternion.identity();transform.scale.setScalar(1);transform.position.set(spot.x,ground+.03,spot.z);
      transform.updateMatrix();markers.setMatrixAt(index,transform.matrix);
      transform.position.set(spot.waterX,collision.groundAt(spot.waterX,spot.waterZ)+.16,spot.waterZ);transform.updateMatrix();this.floats.setMatrixAt(index,transform.matrix);
      this.floats.setColorAt(index,new THREE.Color(0xddd4bb));
      linePoints.push(tip,transform.position.clone());
    });
    const lines=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePoints),new THREE.LineBasicMaterial({color:0x635844}));
    const label=createNameTag('Pond fishing');label.position.set(26,collision.groundAt(26,-17)+2.7,-17);
    this.group.add(rods,markers,this.floats,lines,label);
    this.panel.id='fishing-controls';this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
    this.action.type=this.cancel.type='button';this.cancel.textContent='Cancel fishing';
    this.panel.append(this.status,this.action,this.cancel);hud.append(this.panel);this.panel.hidden=true;
    this.action.addEventListener('click',()=>this.interact(),{signal});
    this.cancel.addEventListener('click',()=>this.send('cancel'),{signal});
    window.addEventListener('keydown',event=>{
      if(event.code!=='KeyF'||event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
      if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,button,[contenteditable="true"]'))return;
      if(!this.panel.hidden&&!this.action.disabled){event.preventDefault();this.interact();}
    },{signal});
  }
  bind(room:GameRoom):void {
    this.unbind?.();this.pendingUntil=0;this.message='';
    this.unbind=room.onMessage('fishing-result',({text}:{text:string})=>{
      this.message=text;this.messageUntil=performance.now()+4500;this.pendingUntil=0;
    });
  }
  private send(action:string):void {
    if(!this.connected||!this.enabled()||performance.now()<this.pendingUntil)return;
    this.pendingUntil=performance.now()+500;
    this.room().send('fishing-action',{action,spotId:this.selected});
  }
  private interact():void {
    if(this.action.disabled||this.panel.hidden)return;
    const spot=this.room().state.fishing?.get(this.selected);
    this.send(spot?.occupant===this.room().sessionId?'reel':'cast');
  }
  render(player:{x:number;y:number;z:number},connected:boolean,now:number):void {
    const room=this.room(),supported=room.state.fishingVersion===1;
    this.connected=connected&&supported;
    const nearest=FISHING_SPOTS.reduce((best,s)=>Math.hypot(player.x-s.x,player.z-s.z)<Math.hypot(player.x-best.x,player.z-best.z)?s:best);
    const distance=Math.hypot(player.x-nearest.x,player.z-nearest.z);
    this.group.visible=supported&&distance<55;
    if(this.group.visible)FISHING_SPOTS.forEach((s,i)=>{
      const phase=room.state.fishing?.get(s.id)?.phase??'idle';
      if(this.floatColors[i]===phase)return;this.floatColors[i]=phase;
      this.floats.setColorAt(i,new THREE.Color(phase==='bite'?0xffd24b:phase==='waiting'?0xc34c36:0xddd4bb));
      this.floats.instanceColor!.needsUpdate=true;
    });
    const mine=FISHING_SPOTS.find(s=>room.state.fishing?.get(s.id)?.occupant===room.sessionId);
    this.selected=(mine??nearest).id;
    const state=room.state.fishing?.get(this.selected),owner=!!mine;
    const onFoot=!room.state.players.get(room.sessionId)?.rideId;
    const near=distance<=FISHING.range&&Math.abs(player.y-this.collision.groundAt(nearest.x,nearest.z))<1.2;
    this.panel.hidden=!supported||!owner&&!(near&&onFoot);
    this.cancel.hidden=!owner;
    const blocked=!this.connected||!this.enabled()||now<this.pendingUntil;
    this.cancel.disabled=blocked;
    this.action.disabled=blocked||!owner&&!!state?.occupant;
    this.action.textContent=owner?(state?.phase==='bite'?'F - Reel in!':'F - Reel early'):state?.occupant?'Spot occupied':'F - Cast line';
    const count=room.state.players.get(room.sessionId)?.fishCaught??0;
    const guidance=owner?(state?.phase==='bite'?'Bite! Reel in now!':'Waiting for a bite... Walk away to stop.'):`Pond fishing - ${count} caught this session`;
    const text=!connected?'Fishing unavailable while reconnecting.':state?.phase==='bite'&&owner?guidance:now<this.messageUntil?this.message:guidance;
    if(this.status.textContent!==text)this.status.textContent=text;
  }
  dispose():void {
    this.unbind?.();this.panel.remove();
    const materials=new Set<THREE.Material>();
    this.group.traverse(o=>{
      if(o instanceof THREE.InstancedMesh)o.dispose();
      if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments)o.geometry.dispose();
      if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments||o instanceof THREE.Sprite){
        for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
      }
    });
    for(const material of materials){if('map' in material)(material.map as THREE.Texture|null)?.dispose();material.dispose();}
    this.group.clear();
  }
}
