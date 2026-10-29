import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProjectColor, projectImageData, PROJECT_IMAGE_LIMIT } from '../../src/shared/project-appearance.js';
import { validateWorkspaceData } from '../../src/shared/workspace-schema.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPWQAAAAASUVORK5CYII=';

test('project colors normalize portable HEX values without allowing CSS injection', () => {
  assert.equal(normalizeProjectColor(' #aBc '), '#AABBCC');
  assert.equal(normalizeProjectColor('#245678'), '#245678');
  for (const value of ['red', '#12', 'url(https://example.test)', '#123456;display:none', null, {}]) assert.equal(normalizeProjectColor(value), null);
});

test('project logos accept bounded raster data and reject remote, SVG, forged and oversized content', () => {
  assert.equal(projectImageData(png), png);
  for (const value of [
    '',
    null,
    {},
    'https://example.test/logo.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    png.replace('image/png', 'image/jpeg'),
    'data:image/png;base64,PHN2Zy8+',
    png + 'A'.repeat(PROJECT_IMAGE_LIMIT),
  ])
    assert.equal(projectImageData(value), '');
});

test('workspace validation preserves logos and legacy icons but rejects invalid project image fields', () => {
  const data = createEmptyDatabase();
  data.projects = [{ id: 'p', icon: 'folder', color: 'indigo', members: [] }];
  assert.doesNotThrow(() => validateWorkspaceData(data));
  data.projects[0].iconImage = png;
  assert.doesNotThrow(() => validateWorkspaceData(data));
  assert.equal(data.projects[0].iconImage, png);
  data.projects[0].iconImage = 'https://example.test/private.png';
  assert.throws(() => validateWorkspaceData(data), { fields: ['projects.iconImage'] });
});

test('project logos inherit project read and edit permissions', () => {
  const data = createEmptyDatabase();
  data.me = 'owner';
  data.members = [{ id: 'owner' }, { id: 'editor' }];
  data.projects = [
    { id: 'open', members: ['editor'], perms: { editor: 'Can view' }, iconImage: png },
    { id: 'secret', access: 'private', members: ['owner'], iconImage: png },
  ];
  const visible = projectWorkspace(data, { id: 'editor', role: 'editor' });
  assert.deepEqual(
    visible.projects.map(project => project.id),
    ['open'],
  );
  visible.projects[0].iconImage = null;
  assert.throws(() => mergeClientWorkspace(data, visible, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
});
