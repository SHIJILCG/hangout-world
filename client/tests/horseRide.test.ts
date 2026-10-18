// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HorseRide } from '../src/player/horseRide';
import { CollisionWorld } from '../src/world/collision';
import { CART, HORSE, type RideDefinition } from '../../shared/rides';
import type { GameRoom } from '../src/net/connection';
import * as THREE from 'three';
vi.mock('../src/world/cart',()=>({createCart:()=>({root:new THREE.Group(),animate:vi.fn(),dispose:vi.fn()})}));

const cleanup: (()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).forEach(fn=>fn());document.body.innerHTML='';});
function setup(definition:RideDefinition=HORSE) {
  const horse={x:0,y:0,z:0,heading:0,speed:0,occupant:'',inputSeq:0};
  const player={x:1,y:0,z:0,heading:0,name:'A',colorIndex:0,rideId:''};
  const room={sessionId:'a',state:{players:new Map([['a',player]]),ridesVersion:1,cartsVersion:1,rides:new Map([[definition.id,horse]])},send:vi.fn(),onMessage:vi.fn()};
  const abort=new AbortController(),clear=vi.fn();let enabled=true;
  const ride=new HorseRide(new CollisionWorld([]),()=>room as unknown as GameRoom,()=>enabled,clear,document.body,abort.signal,definition);
  ride.bind(room as unknown as GameRoom);
  cleanup.push(()=>{abort.abort();ride.dispose();});
  return {room,horse,player,ride,clear,disable:()=>{enabled=false;},render:()=>ride.render(1/60,player,true)};
}
const pressE=(target:EventTarget=window)=>target.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true}));
describe('horse interaction',()=>{
  it('requires cart capability and sends the selected cart id',()=>{
    const s=setup(CART);s.room.state.cartsVersion=0;s.render();pressE();expect(s.room.send).not.toHaveBeenCalled();
    s.room.state.cartsVersion=1;s.render();pressE();
    expect(s.room.send).toHaveBeenCalledWith('ride-action',{action:'mount',rideId:CART.id});
  });
  it('renders the driver on the bench and hides the other ride action',()=>{
    const s=setup(CART);s.horse.occupant='a';s.player.rideId=CART.id;
    const rendered=s.render()!;expect(rendered.driving).toBe(true);
    expect(rendered.pose.z).toBe(CART.seatOffset);expect(rendered.pose.y).toBe(CART.seatOrigin);
    s.horse.occupant='';s.player.rideId=HORSE.id;s.render();
    expect(document.querySelector<HTMLButtonElement>('#cart-action')!.hidden).toBe(true);
  });
  it('mounts nearby with E and suppresses duplicate pending actions',()=>{
    const s=setup();s.render();pressE();pressE();
    expect(s.clear).toHaveBeenCalledOnce();expect(s.room.send).toHaveBeenCalledExactlyOnceWith('ride-action',{action:'mount'});
  });
  it('does not send to older servers, occupied seats, distant horses or while chat is open',()=>{
    const s=setup();s.room.state.ridesVersion=0;s.render();pressE();s.ride.send({dirX:0,dirZ:1,run:true});
    s.room.state.ridesVersion=1;s.horse.occupant='b';s.render();pressE();
    s.horse.occupant='';s.player.x=10;s.render();pressE();
    s.player.x=1;s.disable();s.render();pressE();expect(s.room.send).not.toHaveBeenCalled();
  });
  it('ignores E while typing and offers dismount for the owner',()=>{
    const s=setup();s.render();const input=document.createElement('input');document.body.append(input);pressE(input);
    expect(s.room.send).not.toHaveBeenCalled();s.horse.occupant='a';s.player.rideId=HORSE.id;s.render();pressE();
    expect(s.room.send).toHaveBeenCalledWith('ride-action',{action:'dismount'});
  });
  it('normalizes sequenced inputs and renders the rider at the horse seat',()=>{
    const s=setup();s.horse.occupant='a';s.horse.inputSeq=8;s.player.rideId=HORSE.id;
    s.ride.send({dirX:1,dirZ:1,run:true});
    expect(s.room.send).toHaveBeenCalledWith('ride-input',expect.objectContaining({seq:9,run:true}));
    expect(s.room.send.mock.calls[0][1].dirX).toBeCloseTo(Math.SQRT1_2);
    expect(s.room.send.mock.calls[0][1].dirZ).toBeCloseTo(Math.SQRT1_2);
    const pose=s.ride.step({dirX:0,dirZ:1,run:true},1/60,true)!;
    const rendered=s.render()!;expect(rendered.occupant).toBe('a');expect(rendered.pose.y).toBeCloseTo(pose.y+HORSE.seatOrigin);
    s.player.rideId='';s.horse.occupant='';expect(s.ride.step({dirX:0,dirZ:0,run:false},1/60,true)).toBe(null);
  });
});
