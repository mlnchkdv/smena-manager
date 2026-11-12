import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadDriveChunks } from '../../src/core/drive-upload.js';

const MB = 1024 ** 2,
  url = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic';
test('a 5 GiB virtual video resumes past 32-bit offsets after a lost partially accepted chunk; all slices stay bounded', async () => {
  const size = 5 * 1024 ** 3 + 123;
  let accepted = 4 * 1024 ** 3 - 2 * MB,
    lost = false,
    probes = 0,
    slices = 0,
    requests = 0;
  const initial = accepted;
  const file = {
    size,
    type: 'video/mp4',
    slice(start, end) {
      assert.equal(start, accepted, 'never resend accepted bytes or leave a gap');
      assert.ok(end > start && end - start <= 8 * MB);
      slices++;
      return { start, end, size: end - start }; // Deliberately allocates no media buffer.
    },
  };
  const result = await uploadDriveChunks(url, file, 8 * MB, {
    resume: true,
    wait: async () => {},
    xhrFactory: () => ({
      headers: {},
      upload: {},
      response: {},
      open() {},
      setRequestHeader(key, value) {
        this.headers[key] = value;
      },
      getResponseHeader() {
        return accepted ? `bytes=0-${accepted - 1}` : null;
      },
      send(body) {
        requests++;
        queueMicrotask(() => {
          if (!body) {
            probes++;
            this.status = 308;
            this.onload();
          } else if (!lost && body.start > 4 * 1024 ** 3) {
            lost = true;
            accepted += 3 * MB;
            this.onerror();
          } else {
            accepted = body.end;
            this.status = accepted === size ? 201 : 308;
            this.response = accepted === size ? { id: 'verified-video' } : {};
            this.onload();
          }
          this.onloadend();
        });
      },
    }),
  });
  assert.equal(result.id, 'verified-video');
  assert.equal(accepted, size);
  assert.ok(initial > 2 ** 31 && lost && probes === 2 && slices > 120 && requests < 150);
});
test('restored upload sessions reject userinfo, nonstandard ports, fragments and invalid file sizes before sending', async () => {
  const options = { xhrFactory: () => assert.fail('Invalid upload must not create a request') };
  for (const target of [url.replace('https://', 'https://user:pass@'), url.replace('.com/', '.com:444/'), url + '#fragment'])
    await assert.rejects(uploadDriveChunks(target, { size: 1 }, MB, options), /destination/);
  for (const size of [0, -1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(uploadDriveChunks(url, { size }, MB, options), /size/);
});
