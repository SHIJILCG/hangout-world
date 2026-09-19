import { listen } from '@colyseus/tools';
import app from './app.config';

// Listens on process.env.PORT || 2567
listen(app);
