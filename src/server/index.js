import 'dotenv/config';
import { app } from './app.js';
import { initWorkspaceStore } from './workspace-store.js';

const port = Number(process.env.PORT || 3001);

await initWorkspaceStore();
app.listen(port, '127.0.0.1', () => {
  console.log(`Smena Manager API is running at http://127.0.0.1:${port}`);
});
