import { Schema, MapSchema, type } from '@colyseus/schema';
import { SPAWN } from './constants';

export class PlayerState extends Schema {
  @type('string') name = 'Guest';
  @type('uint8') colorIndex = 0;
  @type('float32') x = SPAWN.x;
  @type('float32') y = SPAWN.y;
  @type('float32') z = SPAWN.z;
  @type('float32') heading = 0;
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
