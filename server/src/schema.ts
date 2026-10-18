import { Schema, MapSchema, type } from '@colyseus/schema';
import { SPAWN } from './constants';

export class PlayerState extends Schema {
  @type('string') name = 'Guest';
  @type('uint8') colorIndex = 0;
  @type('float32') x = SPAWN.x;
  @type('float32') y = SPAWN.y;
  @type('float32') z = SPAWN.z;
  @type('float32') heading = 0;
  @type('string') rideId = '';
}

export class RideState extends Schema {
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') heading = 0;
  @type('float32') speed = 0;
  @type('string') occupant = '';
  @type('uint32') inputSeq = 0;
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type('uint8') ridesVersion = 1;
  @type('uint8') cartsVersion = 1;
  @type({ map: RideState }) rides = new MapSchema<RideState>();
}
