import { describe, expect, it } from 'vitest';
import { CART, HORSE, STOP, dismountSpot, rideSupport, riderPose, stepRide, type RidePose } from '../../shared/rides';
import { vehicleRoutes } from '../../shared/vehicleRoutes.mjs';
import { CollisionWorld } from '../../shared/collision';
import { rideWorld } from '../src/rideWorld';
import { RideSystem } from '../src/rides';

function driveRoute(points:number[][]) {
  let p:RidePose={x:points[0][0],z:points[0][1],y:rideWorld.groundAt(...points[0] as [number,number]),heading:0,speed:0};
  for(const [x,z] of points.slice(1)) {
    let steps=0;
    while(Math.hypot(p.x-x,p.z-z)>.45 && steps++<3000){
      const distance=Math.hypot(x-p.x,z-p.z);
      p=stepRide(p,{dirX:(x-p.x)/distance,dirZ:(z-p.z)/distance,run:false},1/30,rideWorld,CART);
    }
    expect(Math.hypot(p.x-x,p.z-z),`Cart stuck at ${JSON.stringify(p)} driving to ${x},${z}`).toBeLessThanOrEqual(.45);
  }
  for(let i=0;i<60;i++)p=stepRide(p,STOP,1/30,rideWorld,CART);
  expect(p.speed).toBe(0);expect(dismountSpot(p,rideWorld,CART)).not.toBe(null);
}
describe('cart routes and driver',()=>{
  it('drives stable to village to bridge, and back',()=>{
    driveRoute(vehicleRoutes.routes[0]);driveRoute([...vehicleRoutes.routes[0]].reverse());
  });
  it('drives the orchard branch in both directions',()=>{
    driveRoute(vehicleRoutes.routes[1]);driveRoute([...vehicleRoutes.routes[1]].reverse());
  });
  it('fits the spawn, uses its bench offset, and cannot also own the horse',()=>{
    const h={x:CART.x,y:rideWorld.groundAt(CART.x,CART.z),z:CART.z,heading:0,speed:0,occupant:'',inputSeq:0};
    expect(rideSupport(h,rideWorld,CART)).not.toBe(null);
    const driver={x:h.x+2,y:h.y,z:h.z,heading:0,rideId:''};
    const cart=new RideSystem(h,rideWorld,CART);expect(cart.mount('a',driver,0)).toBe('');
    expect(driver).toMatchObject(riderPose(h,CART));
    const other=new RideSystem({...h,occupant:''},rideWorld,HORSE);
    expect(other.mount('a',driver,400)).not.toBe('');
    expect(cart.dismount('a',driver,400)).toBe('');expect(driver.rideId).toBe('');
  });
  it('checks the rear and outside wheel clearance, caps speed and rejects water',()=>{
    const p={x:0,y:0,z:0,heading:0,speed:0};
    const wall={minX:.8,maxX:1.2,minZ:-2,maxZ:-1,minY:0,maxY:3};
    expect(rideSupport(p,new CollisionWorld([wall]),CART)).toBe(null);
    expect(rideSupport(p,new CollisionWorld([],-1),CART)).toBe(null);
    let moving=p;for(let i=0;i<120;i++)moving=stepRide(moving,{dirX:0,dirZ:1,run:true},1/30,new CollisionWorld([]),CART);
    expect(moving.speed).toBe(CART.trotSpeed);
  });
});
