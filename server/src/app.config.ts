import config from '@colyseus/tools';
import type { Express } from 'express';
import { WorldRoom } from './WorldRoom';

export default config({
  initializeExpress: (app: Express) => {
    app.get('/health', (_req, res) => { res.json({ ok: true }); });
  },
  initializeGameServer: (gameServer) => {
    gameServer.define('world', WorldRoom);
  },
});
