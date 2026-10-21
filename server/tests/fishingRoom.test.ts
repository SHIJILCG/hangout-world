import { beforeAll,afterAll,beforeEach,expect,it } from 'vitest';
import { boot,type ColyseusTestServer } from '@colyseus/testing';
import appConfig from '../src/app.config';
import { FISHING_SPOTS } from '../../shared/fishing';
import { rideWorld } from '../src/rideWorld';
let server:ColyseusTestServer;
beforeAll(async()=>{server=await boot(appConfig,2574);});
afterAll(async()=>{await server?.shutdown();});
beforeEach(async()=>{await server.cleanup();});
it('replicates exclusive occupancy, bites, catches and late-join state',async()=>{
  const room=await server.createRoom('world',{}),a=await server.connectTo(room,{name:'Angler'}),b=await server.connectTo(room,{name:'Neighbor'});
  const spot=FISHING_SPOTS[0];for(const c of [a,b]){c.onMessage('fishing-result',()=>{});Object.assign(room.state.players.get(c.sessionId)!,{x:spot.x,z:spot.z,y:rideWorld.groundAt(spot.x,spot.z)});}
  a.send('fishing-action',{action:'cast',spotId:spot.id});b.send('fishing-action',{action:'cast',spotId:spot.id});
  await expect.poll(()=>room.state.fishing.get(spot.id)!.occupant).not.toBe('');const owner=room.state.fishing.get(spot.id)!.occupant;
  const winner=owner===a.sessionId?a:b;
  const late=await server.connectTo(room,{name:'Observer'});
  await expect.poll(()=>late.state.fishing?.get(spot.id)?.occupant).toBe(owner);
  await expect.poll(()=>late.state.fishing.get(spot.id).phase,{timeout:11000}).toBe('bite');
  winner.send('fishing-action',{action:'reel',spotId:spot.id});
  await expect.poll(()=>late.state.players.get(owner)?.fishCaught).toBe(1);
  await expect.poll(()=>late.state.fishing.get(spot.id).occupant).toBe('');
},15000);
it('releases a disconnected station and preserves the session count on reconnect',async()=>{
  const room=await server.createRoom('world',{}),a=await server.connectTo(room,{name:'Angler'});a.onMessage('fishing-result',()=>{});
  const spot=FISHING_SPOTS[0],p=room.state.players.get(a.sessionId)!;
  Object.assign(p,{x:spot.x,z:spot.z,y:rideWorld.groundAt(spot.x,spot.z),fishCaught:2});
  a.send('fishing-action',{action:'cast',spotId:spot.id});await expect.poll(()=>room.state.fishing.get(spot.id)!.occupant).toBe(a.sessionId);
  const token=a.reconnectionToken,id=a.sessionId;await a.leave(false);
  await expect.poll(()=>room.state.fishing.get(spot.id)!.occupant).toBe('');
  const restored=await server.sdk.reconnect(token);await expect.poll(()=>restored.state.players?.get(id)?.fishCaught).toBe(2);
  expect(restored.state.fishing.get(spot.id).phase).toBe('idle');await restored.leave(true);
});
