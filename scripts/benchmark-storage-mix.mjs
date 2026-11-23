import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { setInterval, clearInterval } from 'node:timers';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { LocalStorageProvider } from '../src/server/storage/local-storage.js';
import { fileCatalogPage } from '../src/shared/file-catalog.js';
import { saveBookmarkSnapshot, readBookmarkSnapshot } from '../src/server/bookmark-snapshots.js';

const mib = Number(process.argv[2] || 128),
  delay = Number(process.argv[3] || 0);
if (!Number.isInteger(mib) || mib < 1 || mib > 5120 || !Number.isInteger(delay) || delay < 0 || delay > 2000)
  throw Error('Usage: node scripts/benchmark-storage-mix.mjs [MiB 1–5120] [read delay ms 0–2000]');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-storage-mix-'));
const disk = await fs.statfs(root);
const storage = new LocalStorageProvider(path.join(root, 'workspace.json'), {
  uploadsPath: path.join(root, 'uploads'),
  backupsPath: path.join(root, 'backups'),
});
const ms = () => performance.now();
const samples = { catalog: [], archive: [], upload: [] };
let errors = 0,
  rss = process.memoryUsage.rss();
const timer = setInterval(() => {
  rss = Math.max(rss, process.memoryUsage.rss());
}, 25);
try {
  if (disk.bavail * disk.bsize < (2 * mib + 256) * 1048576) throw Error('Insufficient temporary disk space.');
  const catalog = { revision: 1, files: Array.from({ length: 2500 }, (_, i) => ({ id: 'f' + i, project: 'p', name: 'Test ' + i })) };
  await fs.writeFile(storage.databasePath, JSON.stringify(catalog));
  const bookmark = { id: 'link', url: 'https://example.test/' };
  bookmark.pageSnapshots = [
    await saveBookmarkSnapshot(storage, 'default', bookmark, {
      url: bookmark.url,
      capturedAt: new Date().toISOString(),
      html: '<p>Archived sample</p>',
      format: 'html',
      document: '<p>Archived sample</p>',
    }),
  ];
  async function measure(name, task) {
    const start = ms();
    try {
      await task();
    } catch (error) {
      errors++;
      console.error(name, error.message);
    } finally {
      samples[name].push(Math.round(ms() - start));
    }
  }
  async function reader(name, task) {
    for (let i = 0; i < 20; i++)
      await measure(name, async () => {
        if (delay) await wait(delay);
        await task(i);
      });
  }

  const block = Buffer.alloc(1048576, 42);
  async function* chunks() {
    for (let i = 0; i < mib; i++) yield block;
  }
  const source = path.join(root, 'source.bin');
  await pipeline(Readable.from(chunks()), createWriteStream(source));
  const started = ms();
  await Promise.all([
    measure('upload', async () => {
      const result = await storage.uploadFile('sample.bin', { path: source });
      if (result.size !== mib * block.length) throw Error('Size mismatch');
    }),
    reader('catalog', async i => {
      const data = await storage.loadDatabase();
      if (!fileCatalogPage(data, { revision: 1, offset: i * 100 }).files.length) throw Error('Empty page');
    }),
    reader('archive', async () => {
      const page = await readBookmarkSnapshot(storage, 'default', bookmark, bookmark.pageSnapshots[0].id);
      if (!page.document.includes('Archived sample')) throw Error('Invalid archive');
    }),
  ]);
  const summary = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => {
      values.sort((a, b) => a - b);
      return [name, { count: values.length, p50ms: values[Math.ceil(values.length * 0.5) - 1], p95ms: values[Math.ceil(values.length * 0.95) - 1] }];
    }),
  );
  const storedBytes = (await fs.readdir(storage.uploadsPath, { withFileTypes: true })).filter(e => e.isFile());
  let fileBytes = 0;
  for (const entry of storedBytes) fileBytes += (await fs.stat(path.join(storage.uploadsPath, entry.name))).size;
  console.log(
    JSON.stringify({
      mib,
      simulatedReadDelayMs: delay,
      durationMs: Math.round(ms() - started),
      errors,
      peakRssMiB: Math.ceil(rss / 1048576),
      storedBytes: fileBytes,
      operations: summary,
    }),
  );
  if (errors) process.exitCode = 1;
} finally {
  clearInterval(timer);
  await fs.rm(root, { recursive: true, force: true });
}
