import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { isRussian, t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { entityAllowed } from '../shared/relations.js';
import { hubNotes } from '../shared/knowledge-hub.js';
import { graphReadModel } from '../core/graph-query-state.js';
import { relationGraph, graphOptions, relationsPanel, ENTITY_LABELS } from './relations.js';

export function projectMaterialHub(id) {
  const key = 'project:' + id,
    remote = graphReadModel('connections', key);
  const graph = remote ? remote.view : relationGraph();
  const connected = new Set((graph?.edges || []).filter(e => e.from === key || e.to === key).map(e => (e.from === key ? e.to : e.from)));
  const materials = new Map(hubNotes(D(), 'project', id).map(n => ['note:' + n.id, { key: 'note:' + n.id, kind: 'note', title: n.title }]));
  for (const node of graph?.nodes || []) if (connected.has(node.key)) materials.set(node.key, node);
  const counts = Object.entries(ENTITY_LABELS)
    .map(([kind, label]) => {
      const count = [...materials.values()].filter(n => n.kind === kind).length;
      return count ? '<span class="badge">' + esc(t(label)) + ' · ' + count + '</span>' : '';
    })
    .join('');
  const writable = remote?.view?.nodes.find(n => n.key === key)?.writable ?? entityAllowed(D(), key, graphOptions(), true);
  const ru = isRussian();
  return (
    '<section class="panel knowledge-hub"><div class="panel-h"><h2>' +
    (ru ? 'Материалы проекта' : 'Project materials') +
    '</h2></div><div class="panel-b">' +
    '<div class="row" style="flex-wrap:wrap;gap:8px">' +
    counts +
    '</div>' +
    (writable && S.ui.currentUser?.role !== 'viewer'
      ? '<div class="row" style="flex-wrap:wrap;gap:8px;margin-block:10px"><button class="btn btn-secondary btn-sm" data-a="addRelationPicker" data-key="' +
        esc(key) +
        '">' +
        ic('link', 14) +
        (ru ? 'Связать материал' : 'Link material') +
        '</button><button class="btn btn-secondary btn-sm" data-a="newKnowledgeNote" data-hub-source="' +
        esc(key) +
        '">' +
        ic('plus', 14) +
        (ru ? 'Связанная заметка' : 'Linked note') +
        '</button></div>'
      : '') +
    [...materials.values()]
      .slice(0, 12)
      .map(
        n =>
          '<button class="btn btn-ghost knowledge-relation" data-a="openRelatedEntity" data-key="' +
          esc(n.key) +
          '"><span translate="no">' +
          esc(n.title) +
          '</span><small class="faint">' +
          esc(t(ENTITY_LABELS[n.kind])) +
          '</small></button>',
      )
      .join('') +
    (!materials.size && !remote?.loading
      ? '<p class="hint">' +
        (ru
          ? 'Свяжите существующий материал или создайте заметку. Связи из текста и свойств также появятся здесь.'
          : 'Link an existing material or create a note. Text references and property links also appear here.') +
        '</p>'
      : '') +
    (materials.size > 12
      ? '<p class="hint">' +
        (ru ? 'Первые 12 материалов; остальные доступны в связях ниже.' : 'First 12 materials; more are available in connections below.') +
        '</p>'
      : '') +
    relationsPanel(key, true) +
    '</div></section>'
  );
}
