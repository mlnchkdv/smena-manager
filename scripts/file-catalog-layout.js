import 'dotenv/config';
import { getStorageProvider } from '../src/server/storage/index.js';

// Operator-only maintenance utility. Never print credentials, Drive IDs, ETags
// or file contents. Read-only unless all write arguments are explicit.
const args = process.argv.slice(2);
const storage = getStorageProvider();
if (storage.name !== 'google-drive') throw new Error('This operation requires the configured Google Drive provider.');
if (args.length === 1 && args[0] === '--inspect') {
  const data = await storage.loadDatabaseCore();
  console.log(
    JSON.stringify({
      revision: data?.revision,
      schemaVersion: data?.schemaVersion,
      layout: storage.catalogRoot?._fileCatalog ? 'project-shards' : 'aggregate',
      parts: storage.catalogRoot?._fileCatalog?.shards?.length || 0,
      files: data?.files?.length || 0,
    }),
  );
} else {
  const layout = args.find(arg => arg.startsWith('--layout='))?.slice(9);
  const revision = args.find(arg => arg.startsWith('--revision='))?.slice(11);
  if (args.length !== 3 || !args.includes('--confirm') || !['aggregate', 'project-shards'].includes(layout) || !/^\d+$/.test(revision || ''))
    throw new Error('Use --inspect, or --layout=aggregate|project-shards --revision=N --confirm during an approved maintenance window.');
  const result = await storage.setFileCatalogLayout(layout, Number(revision));
  console.log(JSON.stringify({ layout: result.layout, revision: result.revision, backupCreated: Boolean(result.backupId) }));
}
