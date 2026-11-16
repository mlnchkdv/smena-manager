import 'dotenv/config';
import { app } from './app.js';
import { initWorkspaceStore } from './workspace-store.js';
import { createGracefulShutdown } from './graceful-shutdown.js';
import { apiListenOptions } from './socket-listener.js';

const port = Number(process.env.PORT || 3001);

await initWorkspaceStore();
const server = app.listen(apiListenOptions(), () => {
  console.log(`Smena Manager API is running at http://127.0.0.1:${port}`);
});
const shutdown = createGracefulShutdown(server);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
