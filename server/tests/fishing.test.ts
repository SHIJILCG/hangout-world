import { afterEach, expect, it, vi } from 'vitest';
import { FishingSystem } from '../src/fishing';
import { WorldState, PlayerState } from '../src/schema';
import { rideWorld } from '../src/rideWorld';
import { FISHING_SPOTS } from '../../shared/fishing';
afterEach(()=>vi.restoreAllMocks());
function setup(){
  vi.spyOn(Math,'random').mockReturnValue(0);
  const state=new WorldState(),notify=vi.fn(),system=new FishingSystem(state,notify),spot=FISHING_SPOTS[0];
  for(const id of ['a','b']){const p=new PlayerState();Object.assign(p,{x:spot.x,y:rideWorld.groundAt(spot.x,spot.z),z:spot.z});state.players.set(id,p);}
  const action=(id:string,action:string,time:number,spotId:string=spot.id)=>system.action(id,{action,spotId},time);
  return {state,system,notify,action,spot:state.fishing.get(spot.id)!};
}
it('reserves a shared spot for only one player and does not allow stealing',()=>{
  const s=setup();s.action('a','cast',0);s.action('b','cast',0);s.action('b','reel',4000);
  expect(s.spot.occupant).toBe('a');expect(s.state.players.get('b')!.fishCaught).toBe(0);
});
it('awards exactly once during a bite and replicates the total in player state',()=>{
  const s=setup();s.action('a','cast',0);s.system.tick(3999);expect(s.spot.phase).toBe('waiting');
  s.system.tick(4000);expect(s.spot.phase).toBe('bite');s.action('a','reel',4500);s.action('a','reel',5000);
  expect(s.state.players.get('a')!.fishCaught).toBe(1);expect(s.spot.occupant).toBe('');expect(s.spot.phase).toBe('idle');
});
it('does not award early or expired catches',()=>{
  const s=setup();s.action('a','cast',0);s.action('a','reel',1000);expect(s.state.players.get('a')!.fishCaught).toBe(0);
  s.action('a','cast',2000);s.system.tick(6000);s.action('a','reel',9000);
  expect(s.spot.phase).toBe('idle');expect(s.state.players.get('a')!.fishCaught).toBe(0);
});
it('rejects remote, airborne and mounted casts',()=>{
  const s=setup(),p=s.state.players.get('a')!;p.x+=5;s.action('a','cast',0);expect(s.spot.occupant).toBe('');
  p.x-=5;p.y+=3;s.action('a','cast',500);expect(s.spot.occupant).toBe('');
  p.y-=3;p.rideId='stable-horse';s.action('a','cast',1000);expect(s.spot.occupant).toBe('');
});
it('releases on walking away, mounting, cancellation and disconnect without rewards',()=>{
  for(const reason of ['move','mount','cancel','leave']){
    const s=setup(),p=s.state.players.get('a')!;s.action('a','cast',0);
    if(reason==='move')p.x+=4;if(reason==='mount')p.rideId='stable-horse';
    if(reason==='cancel')s.action('a','cancel',500);if(reason==='leave')s.system.leave('a');
    s.system.tick(500);expect(s.spot.occupant).toBe('');expect(p.fishCaught).toBe(0);
  }
});
it('limits duplicate actions and ignores malformed or unknown requests',()=>{
  const s=setup();for(const message of [null,1,'cast',{}, {action:'award',spotId:'pond-south'},{action:'cast',spotId:'missing'}])s.system.action('a',message,0);
  expect(s.spot.occupant).toBe('');s.action('a','cast',500);s.action('a','cancel',501);expect(s.spot.occupant).toBe('a');
  s.action('a','cancel',701);expect(s.spot.occupant).toBe('');
});
it('allows concurrent fishing at different spots and only one spot per player',()=>{
  const s=setup();s.action('a','cast',0);const second=FISHING_SPOTS[1],p=s.state.players.get('b')!;
  Object.assign(p,{x:second.x,z:second.z,y:rideWorld.groundAt(second.x,second.z)});s.action('b','cast',0,second.id);
  expect([...s.state.fishing.values()].filter(v=>v.occupant)).toHaveLength(2);
  s.action('a','cast',1000);expect([...s.state.fishing.values()].filter(v=>v.occupant==='a')).toHaveLength(1);
});
