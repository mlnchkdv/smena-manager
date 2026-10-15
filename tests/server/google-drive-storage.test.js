import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

test('Google Drive storage keeps uploads separate and supports ranged streams', async () => {
  const calls = [];
  const provider = new GoogleDriveStorageProvider();
  provider.initialized = true;
  provider.rootFolderId = 'root-folder';
  provider.uploadsFolderId = 'uploads-folder';
  provider.client = {
    files: {
      create: async options => {
        calls.push({ type: 'create', options });
        return { data: { id: 'drive-file', name: options.requestBody.name, size: '10', mimeType: options.media.mimeType } };
      },
      get: async (options, requestOptions) => {
        calls.push({ type: 'get', options, requestOptions });
        if (options.alt === 'media') return { data: Readable.from([Buffer.from('2345')]), headers: { 'content-length': '4' } };
        return { data: { id: 'drive-file', name: 'asset.txt', size: '10', mimeType: 'text/plain', trashed: false } };
      },
      delete: async options => {
        calls.push({ type: 'delete', options });
      },
    },
  };

  const uploaded = await provider.uploadFile('asset.txt', Buffer.from('0123456789'), 'text/plain');
  assert.deepEqual(uploaded, { fileId: 'drive-file', filename: 'asset.txt', size: 10, mimeType: 'text/plain', webViewLink: undefined });
  assert.deepEqual(calls[0].options.requestBody.parents, ['uploads-folder']);

  const ranged = await provider.openDownloadStream('asset.txt', 'drive-file', { start: 2, end: 5 });
  const chunks = [];
  for await (const chunk of ranged.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString('utf8'), '2345');
  assert.equal(calls.at(-1).requestOptions.headers.Range, 'bytes=2-5');

  assert.equal(await provider.deleteFile('asset.txt', 'drive-file'), true);
  assert.equal(calls.at(-1).options.fileId, 'drive-file');
});
