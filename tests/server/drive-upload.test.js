import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedUploadBytes, uploadDriveChunks } from '../../src/core/drive-upload.js';

const MB = 1024 ** 2;
const url = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test';
function fixture(size, responses) {
  const requests = [],
    slices = [];
  const file = {
    size,
    type: 'video/mp4',
    slice: (start, end) => {
      slices.push([start, end]);
      return { size: end - start };
    },
  };
  const xhrFactory = () => ({
    upload: {},
    headers: {},
    response: {},
    open(method, destination) {
      this.method = method;
      this.destination = destination;
    },
    setRequestHeader(key, value) {
      this.headers[key] = value;
    },
    getResponseHeader() {
      return this.range || null;
    },
    abort() {
      this.onabort();
      this.onloadend();
    },
    send(body) {
      requests.push({ headers: this.headers, body });
      const response = responses.shift();
      assert.ok(response, 'unexpected extra request');
      queueMicrotask(() => {
        if (typeof response === 'function') response(this);
        else if (response.network) this.onerror();
        else {
          Object.assign(this, response);
          this.onload();
        }
        this.onloadend();
      });
    },
  });
  return { file, requests, slices, options: { xhrFactory, wait: async () => {} } };
}

test('large direct transfers slice at most 8 MiB and accept only server-confirmed offsets', async () => {
  const size = 20 * 1024 ** 3;
  const f = fixture(size, [
    { status: 308, range: `bytes=0-${size - MB - 1}` },
    { status: 201, response: { id: 'done' } },
  ]);
  assert.deepEqual(await uploadDriveChunks(url, f.file, 8 * MB, f.options), { id: 'done' });
  assert.deepEqual(f.slices, [
    [0, 8 * MB],
    [size - MB, size],
  ]);
  assert.ok(f.requests.every(r => r.body.size <= 8 * MB));
});
test('lost response probes Drive and resumes from its partial accepted range', async () => {
  const f = fixture(20 * MB, [
    { status: 308, range: `bytes=0-${8 * MB - 1}` },
    { network: true },
    { status: 308, range: `bytes=0-${12 * MB - 1}` },
    { status: 201, response: { id: 'resumed' } },
  ]);
  await uploadDriveChunks(url, f.file, 8 * MB, f.options);
  assert.equal(f.requests[2].headers['Content-Range'], `bytes */${20 * MB}`);
  assert.deepEqual(f.slices.at(-1), [12 * MB, 20 * MB]);
});
test('resume probes a previously completed upload without resending bytes', async () => {
  const f = fixture(MB, [{ status: 200, response: { id: 'already-done' } }]);
  assert.equal((await uploadDriveChunks(url, f.file, MB, { ...f.options, resume: true })).id, 'already-done');
  assert.equal(f.requests[0].body, null);
  assert.deepEqual(f.slices, []);
});
test('transient HTTP failures use bounded backoff and a status probe', async () => {
  const f = fixture(MB, [{ status: 503 }, { status: 308 }, { status: 201, response: { id: 'ok' } }]);
  const waits = [];
  await uploadDriveChunks(url, f.file, MB, { ...f.options, wait: async ms => waits.push(ms) });
  assert.deepEqual(waits, [500]);
  assert.equal(f.requests[1].body, null);
});
test('expired sessions and invalid ranges fail without silently restarting', async () => {
  const f = fixture(MB, [{ status: 404 }]);
  await assert.rejects(uploadDriveChunks(url, f.file, MB, f.options), { code: 'UPLOAD_SESSION_EXPIRED' });
  assert.throws(() => acceptedUploadBytes('bytes=0-999', 100));
  assert.throws(() => acceptedUploadBytes('bytes=4-9', 100));
  assert.equal(acceptedUploadBytes(null, 100), 0);
});
test('pausing aborts an active request and a changed account stops the next chunk', async () => {
  const controller = new AbortController();
  const f = fixture(MB, [() => controller.abort()]);
  await assert.rejects(uploadDriveChunks(url, f.file, MB, { ...f.options, signal: controller.signal }), { code: 'UPLOAD_CANCELLED' });
  const g = fixture(2 * MB, [{ status: 308, range: `bytes=0-${MB - 1}` }]);
  let checks = 0;
  await assert.rejects(
    uploadDriveChunks(url, g.file, MB, {
      ...g.options,
      assertScope: () => {
        if (++checks > 3) throw new Error('account changed');
      },
    }),
    /account changed/,
  );
  assert.equal(g.requests.length, 1);
});
test('restored sessions cannot transmit file data to another host', async () => {
  const f = fixture(MB, []);
  await assert.rejects(uploadDriveChunks('https://example.com/upload/drive/x', f.file, MB, f.options), /destination/);
  assert.equal(f.requests.length, 0);
});
