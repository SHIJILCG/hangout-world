// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Fishing } from '../src/player/fishing';
import { CollisionWorld } from '../src/world/collision';
import type { GameRoom } from '../src/net/connection';
import { FISHING_SPOTS } from '../../shared/fishing';
vi.mock('../src/player/nametag',()=>({createNameTag:()=>new THREE.Sprite(new THREE.SpriteMaterial())}));
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).forEach(fn=>fn());document.body.innerHTML='';});
function setup(){
  const p={x:26,y:0,z:-17,rideId:'',fishCaught:0};
  const room={sessionId:'a',state:{players:new Map([['a',p]]),fishingVersion:1,fishing:new Map(FISHING_SPOTS.map(s=>[s.id as string,{occupant:'',phase:'idle'}]))},send:vi.fn(),onMessage:vi.fn(()=>vi.fn())};
  let enabled=true;const abort=new AbortController();
  const fishing=new Fishing(new CollisionWorld([]),()=>room as unknown as GameRoom,()=>enabled,document.body,abort.signal);fishing.bind(room as unknown as GameRoom);
  cleanup.push(()=>{abort.abort();fishing.dispose();});
  return {fishing,room,p,disable:()=>{enabled=false;},render:(connected=true)=>fishing.render(p,connected,performance.now()),spot:room.state.fishing.get('pond-south')!};
}
const press=(target:EventTarget=window)=>target.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',bubbles:true}));
it('casts nearby and prevents duplicate pending requests',()=>{
  const s=setup();s.render();press();press();expect(s.room.send).toHaveBeenCalledExactlyOnceWith('fishing-action',{action:'cast',spotId:'pond-south'});
});
it('reels a bite and exposes cancellation for the owner',()=>{
  const s=setup();s.spot.occupant='a';s.spot.phase='bite';s.render();
  expect(document.body.textContent).toContain('Bite!');expect(document.querySelectorAll('button')[1].hidden).toBe(false);
  press();expect(s.room.send).toHaveBeenCalledWith('fishing-action',{action:'reel',spotId:'pond-south'});
});
it('blocks occupied stations, mounted players, distant players, chat and disconnected clients',()=>{
  const s=setup();s.spot.occupant='b';s.render();press();s.spot.occupant='';s.p.rideId='stable-horse';s.render();press();
  s.p.rideId='';s.p.x=100;s.render();press();s.p.x=26;s.render(false);press();s.disable();s.render();press();
  expect(s.room.send).not.toHaveBeenCalled();
});
it('ignores typing and hides the feature on an older server',()=>{
  const s=setup();s.render();const input=document.createElement('input');document.body.append(input);press(input);
  s.room.state.fishingVersion=0;s.render();press();expect(s.room.send).not.toHaveBeenCalled();expect(s.fishing.group.visible).toBe(false);
});
it('shares geometry across stations, casts no shadows and culls distant props',()=>{
  const s=setup();s.render();const instances=s.fishing.group.children.filter(o=>o instanceof THREE.InstancedMesh);
  expect(instances).toHaveLength(3);expect(instances.every(o=>o.count===3&&!o.castShadow)).toBe(true);
  s.p.x=100;s.render();expect(s.fishing.group.visible).toBe(false);
});
it('shows session totals and sends explicit cancellation',()=>{
  const s=setup();s.p.fishCaught=3;s.render();expect(document.body.textContent).toContain('3 caught');
  s.spot.occupant='a';s.spot.phase='waiting';s.render();document.querySelectorAll('button')[1].click();
  expect(s.room.send).toHaveBeenCalledWith('fishing-action',{action:'cancel',spotId:'pond-south'});
});
it('keeps the pond surface and floats above terrain without adding colliders',()=>{
  const s=setup(),water=s.fishing.group.getObjectByName('Fishing pond surface') as THREE.Mesh;
  const positions=water.geometry.getAttribute('position');for(let i=0;i<positions.count;i++)expect(positions.getY(i)).toBeGreaterThan(0);
  expect(water.geometry.index!.count/3).toBe(168);expect(water.castShadow).toBe(false);
  expect((water.material as THREE.MeshStandardMaterial).transparent).toBe(false);
});
