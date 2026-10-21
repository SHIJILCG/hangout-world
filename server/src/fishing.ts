import { FISHING, FISHING_SPOTS } from '../../shared/fishing';
import { FishingState, type WorldState } from './schema';
import { rideWorld } from './rideWorld';

/** Timers and rewards are server-owned. At most one cast per player and spot. */
export class FishingSystem {
  private deadlines=new Map<string,number>();
  private lastAction=new Map<string,number>();
  constructor(private state:WorldState,private notify:(id:string,text:string)=>void) {
    for(const spot of FISHING_SPOTS)state.fishing.set(spot.id,new FishingState());
  }
  release(id:string):void {
    for(const [key,spot] of this.state.fishing)if(spot.occupant===id){
      spot.occupant='';spot.phase='idle';this.deadlines.delete(key);
    }
  }
  leave(id:string):void {this.release(id);this.lastAction.delete(id);}
  tick(now:number):void {
    for(const definition of FISHING_SPOTS){
      const spot=this.state.fishing.get(definition.id)!;if(!spot.occupant)continue;
      const player=this.state.players.get(spot.occupant);
      if(!player||player.rideId||Math.hypot(player.x-definition.x,player.z-definition.z)>FISHING.releaseRange||Math.abs(player.y-rideWorld.groundAt(definition.x,definition.z))>1.2){
        this.release(spot.occupant);continue;
      }
      if(now<(this.deadlines.get(definition.id)??Infinity))continue;
      if(spot.phase==='waiting'){
        spot.phase='bite';this.deadlines.set(definition.id,now+FISHING.biteWindowMs);
      }else{
        this.notify(spot.occupant,'The fish got away. Cast again!');this.release(spot.occupant);
      }
    }
  }
  action(id:string,message:unknown,now:number):void {
    const player=this.state.players.get(id);
    if(!player||!message||typeof message!=='object')return;
    const {action,spotId}=message as {action?:unknown;spotId?:unknown};
    if(action!=='cast'&&action!=='reel'&&action!=='cancel')return;
    if(now-(this.lastAction.get(id)??-Infinity)<200)return;
    this.lastAction.set(id,now);this.tick(now);
    if(action==='cancel'){this.release(id);return;}
    const definition=FISHING_SPOTS.find(s=>s.id===spotId);if(!definition)return;
    const spot=this.state.fishing.get(definition.id)!;
    if(player.rideId||Math.hypot(player.x-definition.x,player.z-definition.z)>FISHING.range||Math.abs(player.y-rideWorld.groundAt(definition.x,definition.z))>1.2){
      this.notify(id,'Stand beside a fishing rod on foot.');return;
    }
    if(action==='cast'){
      if(spot.occupant){this.notify(id,'This fishing spot is occupied.');return;}
      if([...this.state.fishing.values()].some(s=>s.occupant===id))return;
      spot.occupant=id;spot.phase='waiting';
      this.deadlines.set(definition.id,now+FISHING.minWaitMs+Math.random()*(FISHING.maxWaitMs-FISHING.minWaitMs));
      this.notify(id,'Line cast. Wait for the bite!');
    }else if(spot.occupant===id){
      if(spot.phase==='bite'){
        player.fishCaught=Math.min(0xffffffff,player.fishCaught+1);
        this.notify(id,`Caught a pond fish! Session total: ${player.fishCaught}.`);
      }else this.notify(id,'Too soon! Wait for the float to turn gold.');
      this.release(id);
    }
  }
}
