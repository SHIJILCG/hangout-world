import { describe, it, expect } from 'vitest';
import { CollisionWorld } from '../../shared/collision';
import { HORSE, STOP, dismountSpot, rideSupport, stepRide } from '../../shared/rides';
import { RideSystem, type Ride, type Rider } from '../src/rides';
import { rideWorld } from '../src/rideWorld';

const horse=():Ride=>({x:0,y:0,z:0,heading:0,speed:0,occupant:'',inputSeq:0});
const rider=():Rider=>({x:1.5,y:0,z:0,heading:0,rideId:''});
describe('horse ownership and movement',()=>{
  it('grants one nearby seat and rejects distant or duplicate claims',()=>{
    const h=horse(),system=new RideSystem(h,new CollisionWorld([])),a=rider(),b=rider();
    expect(system.mount('far',{...b,x:20},0)).toContain('closer');
    expect(system.mount('a',a,0)).toBe('');
    expect(system.mount('b',b,0)).toContain('already');
    expect(h.occupant).toBe('a');expect(a.rideId).toBe(HORSE.id);expect(b.rideId).toBe('');
  });
  it('rejects outsider, malformed and replayed driving inputs and expires stale input',()=>{
    const h=horse(),a=rider(),system=new RideSystem(h,new CollisionWorld([])),players=new Map([['a',a]]);
    system.mount('a',a,0);
    system.drive('b',{seq:1,dirX:0,dirZ:1,run:true},0);
    system.drive('a',{seq:1,dirX:NaN,dirZ:1,run:true},0);
    system.tick(1/30,players,0);expect(h.speed).toBe(0);
    system.drive('a',{seq:2,dirX:0,dirZ:1,run:true},0);
    system.drive('a',{seq:1,dirX:0,dirZ:-1,run:true},0);
    for(let i=0;i<10;i++)system.tick(1/30,players,i*33);
    expect(h.z).toBeGreaterThan(0);expect(a.z).toBe(h.z);expect(a.y).toBeCloseTo(HORSE.seatOrigin);
    for(let i=0;i<40;i++)system.tick(1/30,players,1000+i*33);
    expect(h.speed).toBe(0);expect(h.inputSeq).toBe(2);
  });
  it('stops for reconnect while retaining ownership, and releases a departing rider',()=>{
    const h=horse(),a=rider(),system=new RideSystem(h,new CollisionWorld([]));
    system.mount('a',a,0);h.speed=8;system.stop();
    expect(h.speed).toBe(0);expect(h.occupant).toBe('a');
    system.release('a');expect(h.occupant).toBe('');
    expect(system.mount('b',rider(),500)).toBe('');
  });
  it('finds another dismount side and refuses fully obstructed exits',()=>{
    const wall={minX:1,minY:0,minZ:-3,maxX:2,maxY:4,maxZ:3};
    expect(dismountSpot(horse(),new CollisionWorld([wall]))?.x).toBeLessThan(0);
    const blocked=new CollisionWorld([{minX:-5,minY:0,minZ:-5,maxX:5,maxY:4,maxZ:5}]);
    const h=horse(),a=rider(),system=new RideSystem(h,blocked);system.mount('a',a,0);
    expect(system.dismount('a',a,400)).toContain('No safe');expect(h.occupant).toBe('a');
    expect(a.rideId).toBe(HORSE.id);expect(h.speed).toBe(0);
  });
  it('returns the player to ground on dismount',()=>{
    const h=horse(),a=rider(),system=new RideSystem(h,new CollisionWorld([]));system.mount('a',a,0);
    expect(system.dismount('a',a,400)).toBe('');expect(a.y).toBe(0);expect(a.rideId).toBe('');
    expect(Math.hypot(a.x-h.x,a.z-h.z)).toBeGreaterThan(1);expect(h.occupant).toBe('');
  });
  it('cannot tunnel through a thin fence, enter water or exceed the trot limit',()=>{
    const world=new CollisionWorld([{minX:-5,minY:0,minZ:3,maxX:5,maxY:2,maxZ:3.05}]);
    let h=horse();for(let i=0;i<300;i++)h={...h,...stepRide(h,{dirX:0,dirZ:1,run:true},1/30,world)};
    expect(h.z+HORSE.halfLength+HORSE.radius).toBeLessThanOrEqual(3.01);
    expect(rideSupport(horse(),new CollisionWorld([],-1))).toBe(null);
    h=horse();for(let i=0;i<120;i++)h={...h,...stepRide(h,{dirX:0,dirZ:1,run:true},1/30,new CollisionWorld([]))};
    expect(h.speed).toBeLessThanOrEqual(HORSE.trotSpeed);
    for(let i=0;i<60;i++)h={...h,...stepRide(h,STOP,1/30,new CollisionWorld([]))};
    expect(h.speed).toBe(0);
  });
  it('places the real stable horse on clear ground with a safe dismount and exit',()=>{
    let h:Ride={...horse(),x:HORSE.x,z:HORSE.z,y:rideWorld.groundAt(HORSE.x,HORSE.z),heading:0};
    expect(rideSupport(h,rideWorld)).not.toBe(null);expect(dismountSpot(h,rideWorld)).not.toBe(null);
    for(let i=0;i<60;i++)h={...h,...stepRide(h,{dirX:0,dirZ:1,run:false},1/30,rideWorld)};
    expect(h.z).toBeGreaterThan(HORSE.z+3);
  });
});
