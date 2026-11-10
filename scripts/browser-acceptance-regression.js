import { inspectGeometry, inspectTaskCapabilities, waitForContent } from './browser-acceptance.js';

// Negative controls for the two confirmed audit failures. Only a disposable
// about:blank document and mock read responses are changed; no app API writes.
export async function checkAcceptanceRegression(page) {
  const isolated = await page.context().newPage();
  try {
    await isolated.setViewportSize({ width: 320, height: 567 });
    await isolated.setContent(
      '<style>body{margin:0}.modal{width:300px;margin:10px}.modal-b{overflow:hidden}.alert{width:900px}</style><div id="main-content"></div><section class="modal"><div class="modal-b"><div class="alert">Narrow discard confirmation</div></div><footer class="modal-f"><button>Continue editing</button><button>Discard</button></footer></section>',
    );
    const clipped = await inspectGeometry(isolated);
    if (clipped.passed || !clipped.failures.some(f => f.kind === 'nested-overflow') || clipped.failures.some(f => f.kind === 'root-overflow'))
      throw Error('Nested overflow negative control failed');
    await isolated.addStyleTag({ content: '.alert{width:auto;overflow-wrap:anywhere}' });
    if (!(await inspectGeometry(isolated)).passed) throw Error('Corrected dialog rejected');
    await isolated.setContent('<main id="main-content"><section class="files-page"><section aria-busy="true"></section></section></main>');
    const loading = await waitForContent(isolated, { timeout: 650, quiet: 100 });
    if (loading.ready || loading.state !== 'loading') throw Error('Skeleton accepted');
    await isolated.setContent('<form data-submit="doLogin"></form>');
    if ((await waitForContent(isolated, { timeout: 650, quiet: 100 })).state !== 'signed-out') throw Error('Logout not classified');
    await isolated.setContent(
      '<aside class="drawer"><textarea id="d-title" data-id="task"></textarea><div id="d-desc" contenteditable="true"></div><div class="task-properties"><button>Assignee</button></div><textarea id="d-cmt"></textarea><label>Upload<input type="file"></label></aside>',
    );
    const data = {
      me: 'owner',
      members: [{ id: 'reader', authProfileId: 'profile', role: 'Member' }],
      tasks: [{ id: 'task', project: 'project' }],
      projects: [{ id: 'project', members: ['reader'], perms: { reader: 'Can view' } }],
    };
    const proxy = new Proxy(isolated, {
      get(target, property) {
        if (property === 'url') return () => 'https://isolated.example.test/';
        if (property === 'request')
          return { get: async url => ({ ok: () => true, json: async () => (url.endsWith('/me') ? { user: { id: 'profile', role: 'editor' } } : { data }) }) };
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    if ((await inspectTaskCapabilities(proxy)).passed) throw Error('Misleading readonly actions accepted');
    return {
      passed: true,
      nestedClippingCaught: true,
      fixedDialogAccepted: true,
      skeletonRejected: true,
      logoutClassified: true,
      canonicalReadonlyMismatchCaught: true,
    };
  } finally {
    await isolated.close();
  }
}
