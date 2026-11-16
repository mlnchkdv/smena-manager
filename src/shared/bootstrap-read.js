// Bound bootstrap reads only. Never time out/replay a write or draft recovery.
export function bootstrapRead(read, { timeoutMs = 45000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimer(() => {
      reject(Object.assign(new Error('Workspace connection timed out.'), { code: 'BOOTSTRAP_READ_TIMEOUT', status: 0 }));
      controller.abort();
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(() => read(controller.signal)), deadline]).finally(() => clearTimer(timer));
}

export function bootstrapCopy(stage, language = 'en') {
  const ru = language === 'ru';
  const copy = {
    config: ['Connecting securely…', 'Подключаемся к серверу…'],
    session: ['Checking your sign-in…', 'Проверяем вход…'],
    directory: ['Signed in. Finding your workspace…', 'Вход подтверждён. Находим пространство…'],
    workspace: ['Signed in. Opening your workspace…', 'Вход подтверждён. Открываем пространство…'],
    drafts: ['Restoring your saved drafts…', 'Восстанавливаем сохранённые черновики…'],
  };
  return (copy[stage] || copy.config)[ru ? 1 : 0];
}
