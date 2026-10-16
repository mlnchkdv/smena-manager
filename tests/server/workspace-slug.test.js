import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceSlug } from '../../src/shared/workspace-slug.js';

test('workspace addresses transliterate Russian names', () => {
  assert.equal(workspaceSlug('СМЕНА Команда'), 'smena-komanda');
  assert.equal(workspaceSlug('Ёж и щука'), 'ezh-i-schuka');
  assert.equal(workspaceSlug('  Product & Дизайн  '), 'product-dizayn');
});
