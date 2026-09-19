import config from '@colyseus/tools';
import { WorldRoom } from './WorldRoom';

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define('world', WorldRoom);
  },
});
