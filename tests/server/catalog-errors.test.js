import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogLoadError } from '../../src/shared/catalog-errors.js';

test('catalog recovery messages are stable and never echo arbitrary provider details', () => {
  assert.equal(catalogLoadError({ code: 'REVISION_CONFLICT', message: 'internal-id' }), 'The workspace changed. Retry loading files.');
  assert.equal(catalogLoadError({ status: 401 }), 'Sign in again to load files.');
  assert.equal(catalogLoadError({ status: 403 }), 'Access to these files is unavailable.');
  assert.equal(catalogLoadError({ status: 413 }), 'The file catalog is too large to load.');
  assert.equal(catalogLoadError({ message: 'Save changes before loading another file page.' }), 'Save changes before loading another file page.');
  assert.equal(catalogLoadError({ message: 'private-provider-token', status: 503 }), 'Unable to load files. Check connection and retry.');
});
