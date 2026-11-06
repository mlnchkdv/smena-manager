import { D, S } from '../core/store.js';
import { getSessionGeneration, trashKnowledgeNotes, restoreKnowledgeTrash } from '../core/api.js';
import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { workspaceSyncIsClean } from '../core/workspace-sync.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { isRussian } from '../core/i18n.js';
export async function knowledgeTrashOperation(ids, restore = false) {
  if (S.ui.atomicOperation || !workspaceSyncIsClean(D()))
    return toast(isRussian() ? 'Дождитесь сохранения изменений.' : 'Wait until your changes are saved.', { kind: 'info' });
  const generation = getSessionGeneration();
  S.ui.atomicOperation = true;
  render();
  try {
    if (restore) await restoreKnowledgeTrash(ids, S.ui.documentRevisions.knowledge);
    else await trashKnowledgeNotes(ids, S.ui.documentRevisions.knowledge);
    if (generation !== getSessionGeneration()) return;
    await refreshWorkspaceFromServer({ force: true });
    if (!restore) {
      S.ui.knowledgeSelection = [];
      if (!D().knowledgeNotes.some(note => note.id === S.ui.knowledgeDrawer)) S.ui.knowledgeDrawer = null;
    }
    toast(isRussian() ? (restore ? 'Заметка восстановлена.' : 'Заметки перемещены в корзину.') : restore ? 'Note restored.' : 'Notes moved to trash.');
  } catch {
    if (generation === getSessionGeneration())
      toast(
        isRussian() ? 'Не удалось подтвердить операцию. Обновите данные перед повтором.' : 'Unable to confirm the operation. Refresh the data before retrying.',
        { kind: 'err' },
      );
  } finally {
    if (generation === getSessionGeneration()) {
      S.ui.atomicOperation = false;
      render();
    }
  }
}
