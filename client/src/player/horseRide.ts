import * as THREE from 'three';
import { HORSE, riderPose, stepRide, type RideDefinition, type RideInput, type RidePose } from '../../../shared/rides';
import { CollisionWorld } from '../world/collision';
import { createHorse } from '../world/horse';
import { createCart } from '../world/cart';
import type { GameRoom, NetworkRide } from '../net/connection';

export class HorseRide {
  private model:ReturnType<typeof createHorse> & Partial<Pick<ReturnType<typeof createCart>,'ground'>>;
  readonly group:THREE.Group;
  private predicted:RidePose|null=null;
  private lastSnapshot='';
  private sequence=0;
  private errorUntil=0;
  private error='';
  private pendingUntil=0;
  private time=0;
  private button=document.createElement('button');
  private status=document.createElement('small');
  private rendered=false;
  private ready=true;
  private targetPosition=new THREE.Vector3();
  private action:()=>void;
  constructor(private collision:CollisionWorld,private room:()=>GameRoom,private enabled:()=>boolean,private clearInput:()=>void,hud:HTMLElement,signal:AbortSignal,readonly definition:RideDefinition=HORSE) {
    const model=definition.id===HORSE.id?createHorse():createCart();
    this.model=model;this.group=model.root;
    if('ready' in model && model.ready instanceof Promise){
      this.ready=false;
      model.ready.then(()=>{this.ready=true;}).catch(()=>{this.error='Cart model could not load. Reload to retry.';this.errorUntil=Infinity;});
    }
    this.group.visible=false;
    this.button.id=definition.id===HORSE.id?'ride-action':'cart-action';this.button.type='button';this.button.hidden=true;
    this.status.id=definition.id===HORSE.id?'ride-status':'cart-status';this.status.setAttribute('role','status');
    hud.append(this.status,this.button);
    this.action=()=>{
      const room=this.room();if(!this.ready||!this.enabled()||!this.supported(room)||performance.now()<this.pendingUntil)return;
      this.clearInput();this.pendingUntil=performance.now()+1200;
      const message={action:room.state.players.get(room.sessionId)?.rideId?'dismount':'mount',...(this.definition.id===HORSE.id?{}:{rideId:this.definition.id})};
      room.send('ride-action',message);
    };
    this.button.addEventListener('click',()=>{this.action();this.button.blur();},{signal});
    window.addEventListener('keydown',event=>{
      if(event.code!=='KeyE'||event.repeat||event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,button,[contenteditable="true"]'))return;
      if(event.defaultPrevented||this.button.hidden||this.button.disabled)return;event.preventDefault();this.action();
    },{signal});
  }
  bind(room:GameRoom) {
    this.predicted=null;this.rendered=false;this.lastSnapshot='';this.sequence=0;this.pendingUntil=0;
    room.onMessage('ride-result',({error}:{error:string})=>{this.pendingUntil=0;this.error=error;this.errorUntil=performance.now()+3500;});
  }
  private supported(room:GameRoom){return room.state.ridesVersion===1&&(this.definition.id===HORSE.id||room.state.cartsVersion===1);}
  private snapshot():NetworkRide|undefined {return this.room().state.rides?.get(this.definition.id);}
  step(input:RideInput,dt:number,connected:boolean):RidePose|null {
    const room=this.room(),ride=this.snapshot();
    const mounted=room.state.players.get(room.sessionId)?.rideId===this.definition.id&&ride?.occupant===room.sessionId;
    if(!ride||!mounted){this.predicted=null;return null;}
    const snapshot=`${ride.x},${ride.y},${ride.z},${ride.heading},${ride.speed},${ride.inputSeq}`;
    if(!this.predicted)this.predicted={...ride};
    else if(snapshot!==this.lastSnapshot) {
      const p=this.predicted, distance=Math.hypot(p.x-ride.x,p.z-ride.z);
      const blend=distance>2?1:.3;
      p.x+=(ride.x-p.x)*blend;p.y+=(ride.y-p.y)*blend;p.z+=(ride.z-p.z)*blend;
      p.heading+=Math.atan2(Math.sin(ride.heading-p.heading),Math.cos(ride.heading-p.heading))*blend;
      p.speed+=(ride.speed-p.speed)*blend;
    }
    this.lastSnapshot=snapshot;
    if(connected)this.predicted=stepRide(this.predicted,input,dt,this.collision,this.definition);
    else this.predicted.speed=0;
    return this.predicted;
  }
  send(input:RideInput) {
    const room=this.room(),ride=this.snapshot();if(!this.supported(room)||ride?.occupant!==room.sessionId)return;
    const len=Math.max(1,Math.hypot(input.dirX,input.dirZ));
    this.sequence=Math.max(this.sequence,ride.inputSeq)+1;
    room.send('ride-input',{seq:this.sequence,dirX:input.dirX/len,dirZ:input.dirZ/len,run:input.run});
  }
  render(dt:number,player:{x:number;y:number;z:number},connected:boolean) {
    this.time+=dt;const ride=this.snapshot(),room=this.room();
    if(!ride||!this.supported(room)){this.group.visible=false;this.button.hidden=true;this.status.textContent='';return null;}
    const local=ride.occupant===room.sessionId&&!!this.predicted;
    const pose=local?this.predicted!:ride;
    this.targetPosition.set(pose.x,pose.y,pose.z);
    const blend=!this.rendered||this.group.position.distanceTo(this.targetPosition)>5?1:1-Math.exp(-14*dt);
    this.group.position.lerp(this.targetPosition,blend);
    this.group.rotation.y+=Math.atan2(Math.sin(pose.heading-this.group.rotation.y),Math.cos(pose.heading-this.group.rotation.y))*blend;
    const seatShift=this.model.ground?.({...pose,x:this.group.position.x,y:this.group.position.y,z:this.group.position.z,heading:this.group.rotation.y},this.collision)??0;
    this.rendered=true;const distance=Math.hypot(player.x-pose.x,player.z-pose.z);
    this.group.visible=distance<150;
    if(this.group.visible)this.model.animate(connected?pose.speed:0,dt,this.time);
    const mounted=room.state.players.get(room.sessionId)?.rideId===this.definition.id;
    const near=distance<=this.definition.interactDistance&&Math.abs(player.y-pose.y)<1.2;
    const otherRide=!!room.state.players.get(room.sessionId)?.rideId&&!mounted;
    this.button.hidden=otherRide||!mounted&&!near;
    this.button.disabled=!this.ready||!connected||!this.enabled()||!!ride.occupant&&!mounted||performance.now()<this.pendingUntil;
    this.button.textContent=mounted?'E - Dismount':ride.occupant?`${this.definition.name} is occupied`:`E - ${this.definition.id===HORSE.id?'Ride':'Drive'} ${this.definition.name}`;
    const guidance=mounted?'WASD steer / Shift trot / Release to stop':near?this.definition.name:`${this.definition.name} - ${Math.round(distance)} m away`;
    const message=this.error&&performance.now()<this.errorUntil?this.error:guidance;
    if(this.status.textContent!==message)this.status.textContent=message;
    return {occupant:ride.occupant,driving:this.definition.id!==HORSE.id,pose:riderPose({x:this.group.position.x,y:this.group.position.y+seatShift,z:this.group.position.z,heading:this.group.rotation.y,speed:pose.speed},this.definition)};
  }
  dispose(){this.model.dispose();this.button.remove();this.status.remove();}
}
