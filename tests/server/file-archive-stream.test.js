import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { unzipSync, strFromU8 } from 'fflate';
import { streamFileArchive } from '../../src/server/file-archive-stream.js';
import { createFileArchivePlan, STREAM_ZIP_POLICY } from '../../src/shared/file-archive-policy.js';

test('streamed archives exceed browser count limits and preserve Unicode paths', async () => {
  const data = {
    me: 'm',
    projects: [{ id: 'p', name: 'Проект' }],
    files: Array.from({ length: 130 }, (_, i) => ({ id: `${i}`, name: `текст ${i}.txt`, project: 'p', bytes: 4, storageName: `${i}` })),
  };
  const plan = createFileArchivePlan(
    data,
    data.files.map(file => file.id),
    'admin',
    STREAM_ZIP_POLICY,
  );
  const chunks = [];
  const output = new Writable({
    write(chunk, _, done) {
      chunks.push(chunk);
      done();
    },
  });
  await streamFileArchive(plan, output, async () => ({ size: 4, stream: Readable.from([Buffer.from('test')]) }));
  const files = unzipSync(Buffer.concat(chunks));
  assert.equal(Object.keys(files).length, 130);
  assert.equal(strFromU8(files['Проект/текст 0.txt']), 'test');
});

test('large ZIP streaming honors backpressure without buffering whole input files', async () => {
  const amount = 51 * 1024 * 1024;
  let written = 0,
    peak = 0;
  const output = new Writable({
    highWaterMark: 1024,
    write(chunk, _, done) {
      written += chunk.length;
      peak = Math.max(peak, this.writableLength);
      setImmediate(done);
    },
  });
  await streamFileArchive([{ file: { id: 'large' }, path: 'large.bin' }], output, async () => ({
    size: amount,
    stream: Readable.from(
      (async function* () {
        for (let i = 0; i < 51; i++) yield Buffer.alloc(1024 * 1024);
      })(),
    ),
  }));
  assert.ok(written > amount);
  assert.ok(peak < 128 * 1024, `Buffered ${peak} bytes`);
});

test('streaming fails on actual byte overflow, truncated source, ACL changes and disconnect', async () => {
  const plan = [{ file: { id: 'one' }, path: 'one' }];
  const sink = () =>
    new Writable({
      write(_chunk, _, done) {
        done();
      },
    });
  const read = async () => ({ size: 4, stream: Readable.from([Buffer.from('test')]) });
  await assert.rejects(streamFileArchive(plan, sink(), read, { maxBytes: 3 }));
  await assert.rejects(
    streamFileArchive(plan, sink(), async () => ({ size: 5, stream: Readable.from(['test']) })),
    /incomplete/,
  );
  await assert.rejects(
    streamFileArchive(plan, sink(), read, {
      validate: async () => {
        throw Error('Permission revoked');
      },
    }),
    /revoked/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(streamFileArchive(plan, sink(), read, { signal: controller.signal }), { name: 'AbortError' });
});
