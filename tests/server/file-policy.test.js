import assert from 'node:assert/strict';
import test from 'node:test';
import { filePresentationType, getFileResponsePolicy, getFileUploadPolicy, validateFileUpload } from '../../src/server/file-policy.js';

test('file policy adapts its default limit to Vercel and blocks executable files', () => {
  assert.equal(getFileUploadPolicy({ VERCEL: '1' }).maxFileSizeBytes, 4 * 1024 * 1024);
  assert.equal(getFileUploadPolicy({}).maxFileSizeBytes, 100 * 1024 * 1024);
  assert.throws(() => validateFileUpload({ originalname: 'payload.exe', mimetype: 'application/octet-stream', size: 10 }, {}), /not allowed/);
  assert.throws(() => validateFileUpload({ originalname: 'empty.txt', mimetype: 'text/plain', size: 0 }, {}), /Empty files/);
});

test('file presentation type matches the existing Files interface', () => {
  assert.equal(filePresentationType('plan.pdf'), 'pdf');
  assert.equal(filePresentationType('budget.xlsx'), 'sheet');
  assert.equal(filePresentationType('photo.webp'), 'img');
  assert.equal(filePresentationType('vector.svg'), 'other');
  assert.equal(filePresentationType('unknown.bin'), 'other');
});

test('file response policy forces active and unknown content to download safely', () => {
  assert.deepEqual(getFileResponsePolicy('photo.webp', 'image/webp'), {
    attachment: false,
    contentType: 'image/webp',
    activeContent: false,
  });
  assert.deepEqual(getFileResponsePolicy('vector.svg', 'image/svg+xml'), {
    attachment: true,
    contentType: 'application/octet-stream',
    activeContent: true,
  });
  assert.deepEqual(getFileResponsePolicy('page.html', 'text/plain'), {
    attachment: true,
    contentType: 'application/octet-stream',
    activeContent: true,
  });
  assert.equal(getFileResponsePolicy('photo.webp', 'image/webp', true).attachment, true);
});
