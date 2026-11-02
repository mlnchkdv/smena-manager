import test from 'node:test';
import assert from 'node:assert/strict';
import { memberMatches } from '../../src/shared/member-search.js';
test('directory searches professional title and team without confusing access roles', () => {
  const member = { name: 'Artem Blohin', email: 'artem@example.test', title: 'Fullstack', role: 'Member' };
  assert.equal(memberMatches(member, 'fullstack продукт', 'Продукт'), true);
  assert.equal(memberMatches(member, 'member', 'Продукт'), false);
  assert.equal(memberMatches({ name: 'Полина' }, 'полина'), true);
  assert.equal(memberMatches(member, 'missing'), false);
});
