import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { WorldMap } from '../world/map';
import { joinWorld, type GameRoom } from '../net/connection';
import { RemotePlayers } from '../net/remotePlayers';

/** Opt-in preview benchmark: real local room peers, rebased into each fixed view. */
export async function attachGrassBenchmark(context:{scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;map:WorldMap;visit:(x:number,z:number)=>void;frameHooks:Set<(now:number)=>void>}) {
  const rooms:GameRoom[]=[],origins:{x:number;y:number;z:number}[]=[];
  const avatars=new RemotePlayers();context.scene.add(avatars.group);
  let x=0,z=8,previous=performance.now(),phase=0,lastSend=0;
  const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  try {
    for(let i=0;i<3;i++) {
      const room=await joinWorld(`GrassBench${i+1}`,i);rooms.push(room);
      const deadline=performance.now()+5000;
      while(!room.state.players?.get(room.sessionId)&&performance.now()<deadline)await pause(20);
      const p=room.state.players?.get(room.sessionId);if(!p)throw new Error('Benchmark player state did not arrive');
      origins.push({x:p.x,y:p.y,z:p.z});avatars.add(room.sessionId,p);
    }
    await Promise.all(rooms.map(room=>avatars.getRoot(room.sessionId)!.userData.avatarLoad));
  } catch(error){for(const room of rooms)void room.leave();avatars.clear();throw error;}
  const tick=(now:number)=>{
    const dt=Math.min(.1,(now-previous)/1000);previous=now;phase+=dt;
    if(now-lastSend>=1000/15){lastSend=now;rooms.forEach((room,i)=>room.send('move',{...origins[i],x:origins[i].x+Math.sin(phase)*.5,heading:Math.PI/2}));}
    rooms.forEach((room,i)=>{
      const p=rooms[0].state.players.get(room.sessionId);if(!p)return;
      const px=x+(i-1)*1.5+(p.x-origins[i].x),pz=z-2+(p.z-origins[i].z);
      avatars.updateTarget(room.sessionId,{x:px,y:context.map.collision.groundAt(px,pz),z:pz,heading:p.heading});
    });
    avatars.tick(dt,x,z);
  };
  context.frameHooks.add(tick);
  addEventListener('pagehide',()=>{context.frameHooks.delete(tick);avatars.clear();rooms.forEach(room=>void room.leave());},{once:true});
  return {
    players:rooms.length,
    visit(nx:number,nz:number,yaw=0){
      x=nx;z=nz;phase=0;context.visit(x,z);
      const y=context.map.collision.groundAt(x,z);
      context.controls.target.set(x,y+1.5,z);
      context.camera.position.set(x+Math.sin(yaw)*7,y+4.2,z+Math.cos(yaw)*7);context.controls.update();
    },
    networkState(){return {clients:rooms.length,replicatedPlayers:rooms[0].state.players.size,sessionIds:rooms.map(room=>room.sessionId)};},
  };
}
