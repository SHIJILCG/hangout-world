import { CollisionWorld } from '../../shared/collision';
import { HORSE, STOP, dismountSpot, stepRide, riderPose, type RideDefinition, type RidePose } from '../../shared/rides';

export interface Rider {x:number;y:number;z:number;heading:number;rideId:string}
export interface Ride extends RidePose {occupant:string;inputSeq:number}
export class RideSystem {
  private input = STOP;
  private inputAt = -Infinity;
  private lastAction = new Map<string,number>();
  constructor(readonly ride:Ride,private world:CollisionWorld, readonly definition:RideDefinition = HORSE) {}
  mount(id:string,player:Rider,now:number):string {
    if (!this.allowAction(id,now)) return 'Please wait a moment.';
    if (player.rideId || this.ride.occupant) return `${this.definition.name} already has a rider.`;
    if (Math.hypot(player.x-this.ride.x,player.z-this.ride.z)>this.definition.interactDistance || Math.abs(player.y-this.ride.y)>1.2) return `Move closer to ${this.definition.name}.`;
    this.stop();this.ride.occupant=id;this.ride.inputSeq=0;player.rideId=this.definition.id;this.attach(player);
    return '';
  }
  dismount(id:string,player:Rider,now:number):string {
    if (!this.allowAction(id,now)) return 'Please wait a moment.';
    if (this.ride.occupant!==id || player.rideId!==this.definition.id) return 'You are not driving this ride.';
    this.stop();
    const spot=dismountSpot(this.ride,this.world,this.definition);
    if (!spot) return 'No safe place to dismount. Move to an open area.';
    Object.assign(player,spot);player.rideId='';this.ride.occupant='';return '';
  }
  drive(id:string,message:unknown,now:number):void {
    if (this.ride.occupant!==id || !message || typeof message!=='object') return;
    const m=message as Record<string,unknown>;
    if (!Number.isSafeInteger(m.seq) || (m.seq as number)<=this.ride.inputSeq || (m.seq as number)>0xffffffff || typeof m.dirX!=='number' || typeof m.dirZ!=='number' || !Number.isFinite(m.dirX) || !Number.isFinite(m.dirZ) || Math.abs(m.dirX)>1.01 || Math.abs(m.dirZ)>1.01 || typeof m.run!=='boolean') return;
    this.input={dirX:m.dirX,dirZ:m.dirZ,run:m.run};this.inputAt=now;this.ride.inputSeq=m.seq as number;
  }
  tick(dt:number,players:{get(id:string):Rider|undefined},now:number):void {
    if (!this.ride.occupant) return;
    const player=players.get(this.ride.occupant);
    if (!player) {this.release(this.ride.occupant);return;}
    const input=now-this.inputAt>this.definition.inputTimeout ? STOP : this.input;
    Object.assign(this.ride,stepRide(this.ride,input,dt,this.world,this.definition));this.attach(player);
  }
  stop():void {this.input=STOP;this.inputAt=-Infinity;this.ride.speed=0;}
  release(id:string):void {this.lastAction.delete(id);if(this.ride.occupant===id){this.stop();this.ride.occupant='';}}
  private attach(p:Rider):void {Object.assign(p,riderPose(this.ride,this.definition));}
  private allowAction(id:string,now:number):boolean {if(now-(this.lastAction.get(id)??-Infinity)<300)return false;this.lastAction.set(id,now);return true;}
}
