# Media uploads / Загрузка медиа — 5 November 2026

Status / Статус: implemented, pushed and verified on production `1ed360c` at [Smena Manager](https://smena-manager.vercel.app/). The queue is shared by the existing file-upload entry points; access rules and storage identities remain server-controlled.

## RU — Как пользоваться

1. Откройте «Файлы», выберите проект и нужную папку. Нажмите «Загрузить файлы» или перетащите несколько файлов в существующую область загрузки.
2. Можно поставить в очередь до **500 незавершённых файлов**. Прямая загрузка в Google Drive по умолчанию допускает **20 GiB на файл**: 21 474 836 480 байт. В интерфейсе это обозначено как `20.0 GB`. Серверная настройка `SHARED_FILE_MAX_BYTES` может уменьшать этот предел; фактический предел показывает интерфейс.
3. Очередь отправляет два файла одновременно. Для каждого доступны пауза, продолжение, отмена и повтор после ошибки. После передачи байтов отдельно выполняются проверка и запись в каталог. Файл считается готовым только после регистрации.
4. Не закрывайте вкладку во время передачи. Для управляемого обновления откройте «Инструменты загрузки» → «Сохранить очередь и обновить». Приложение приостановит передачу и проверит сохранение изменений рабочего пространства.
5. После обновления нажмите «Выбрать исходные файлы» и укажите те же файлы. Браузер не сохраняет их содержимое: повторный выбор необходим. При действующем сеансе загрузка продолжится с позиции, подтверждённой Google. Если сеанс истёк, интерфейс явно предложит начать этот файл заново.
6. Завершённая очередь сворачивается автоматически и показывает одно итоговое уведомление. Кнопка «Убрать завершённые» убирает историю очереди, не удаляя загруженные файлы. В длинной очереди отображается по 20 строк на странице.

У фотографий, видео и аудио есть соответствующие типы и значки, включая HEIC/HEIF, AVIF и распространённые видеоформаты. Поддержка загрузки формата не означает, что браузер сможет показать его встроенный предпросмотр. Сейчас неподдерживаемое видео предлагается скачать; новый видеоплеер этим изменением не добавлялся.

### Ограничения и сохранность

- Отправка идёт порциями не больше **8 MiB**, без чтения всего длинного видео в память. Размер порции согласован с требованиями resumable upload Google Drive.
- Сведения о незавершённой очереди хранятся в `sessionStorage` текущей вкладки, отдельно для аккаунта и пространства, до **24 часов**. Там есть временный адрес загрузки и подписанный ticket, поэтому эти данные нельзя включать в логи или публиковать. При выходе из аккаунта checkpoint удаляется; при смене аккаунта/пространства текущая передача останавливается.
- Повторный выбор проверяется по имени, размеру, времени изменения и SHA-256 выборки из начала и конца файла — максимум **128 KiB**. Это защита от случайной подмены исходника, **не полный checksum всего файла**. Права повторно проверяются сервером перед продолжением и регистрацией.
- При потере сети очередь приостанавливается. Фоновая передача после закрытия вкладки, блокировки телефона или выгрузки браузера операционной системой не гарантируется. Постоянная очередь между разными вкладками/устройствами не реализована.
- Для конфигурации без прямой загрузки остаётся proxy-путь: **4 MiB на Vercel**, **100 MiB локально**, один файл одновременно. Он не получает возможность передачи 20 GiB через serverless-функцию.
- Ошибки сети, ограничение частоты и временные серверные ответы повторяются ограниченно; отозванный доступ и истёкшие сеансы не маскируются бесконечным повтором. Передача байтов может быть параллельной, регистрация файлов в каталоге сериализована, чтобы не применять ревизии в обратном порядке.
- **Резервная копия метаданных не является независимой копией всех видео.** Существующий recovery bundle сохраняет лимит **100 MiB суммарных бинарных вложений** (`src/server/recovery-bundle.js`). Большие оригиналы требуют отдельной стратегии копирования/экспорта. Лимиты ZIP и готовых экспортов не увеличивались автоматически вместе с лимитом загрузки.

## EN — Usage

1. Open Files, choose the destination project/folder and select or drop multiple files through the existing upload entry points.
2. The queue accepts up to **500 unfinished files**. Direct Google Drive uploads default to **20 GiB per file** (21,474,836,480 bytes, displayed as `20.0 GB`). `SHARED_FILE_MAX_BYTES` can override this; use the limit reported by the server/UI.
3. Two direct uploads run concurrently. Pause, resume, cancel and retry are available per file. Byte transfer is followed by validation and catalog registration; transfer progress alone does not establish a saved file.
4. Keep the tab open. To reload safely, use Upload tools → Save queue and reload. The app pauses transfers and checks workspace synchronization before reloading.
5. Choose original files again after reload. Only metadata/checkpoints are retained, not file contents. A valid resumable session uses Google's confirmed offset. An expired session explicitly requires restarting that file.
6. Finished queues collapse automatically, announce one completion message and can be cleared without deleting stored files. Long queues show 20 rows per page.

Image, video and audio classification includes HEIC/HEIF, AVIF and common video formats. Upload acceptance does not imply browser codec/preview support; unsupported video still offers Download.

### Limits and integrity

- At most **8 MiB per chunk**; no whole-video buffering. Temporary network/rate-limit/server failures use bounded retries and confirmed ranges.
- Checkpoints are scoped to the current tab/account/workspace in `sessionStorage`, retained for **24 hours**. They contain a temporary upload URL and signed ticket: never log/publish them. Sign-out clears checkpoints; identity/workspace changes abort the old scope.
- Reselection uses name, size, modification time and a **sampled SHA-256** over up to 128 KiB from the file's ends. This is not a full-file checksum. Current server ACLs are checked again on resume and registration.
- Offline state pauses the queue. Uploading after tab closure, OS suspension or screen locking is not guaranteed; cross-tab/device persistence is not implemented.
- Proxy fallback retains **4 MiB on Vercel / 100 MiB locally**, with one worker. Catalog registration/application is serialized even while direct byte transfers run concurrently.
- Standalone metadata backups continue to reference separate binary objects. The existing recovery bundle retains a **100 MiB total binary attachment limit**. Large originals need a separate backup/export strategy; ZIP/export limits are unchanged.

## Implementation and verification / Реализация и проверка

| Commit    | Change / Изменение                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------- |
| `4586940` | Direct-upload policy, trusted resumable transport, bounded retries, current-ACL resume validation. |
| `9a767fa` | Bounded queue, pause/resume, scoped checkpoints, reselection and media classification.             |
| `8dffec2` | Safe queue reload and an attached original-file picker; production acceptance follow-up.           |
| `a7aca6a` | Compact completed queues and one batch completion message.                                         |
| `1ed360c` | Graph canvas height correction discovered during the accompanying audit.                           |

Full server/shared run: **661/661 passed**, no failed/skipped/cancelled tests. Lint, UI tokens and final production build passed; initial JavaScript **581.1 KiB / 600 KiB budget**. Existing mixed-import/chunk-size build warnings remain. A stale-session test fixture was updated from an untrusted test upload host to the allowed Google upload URL; its assertion remains intact.

Tests cover chunk bounds/ranges, a virtual 20 GiB source, retries/abort/expired sessions, 500 jobs with two workers, fast pause/resume, cancellation, batched notifications, checkpoint restoration, sampled fingerprints, current project ACLs and other-owner rejection. Virtual large-file coverage is not a real 20 GiB network transfer.

Local browser acceptance used an isolated provider without cloud credentials: 60 real small TXT uploads, 60 completions, 20-row paging; a subsequent two-file queue collapsed to about 101 CSS px at 1280×720.

With explicit user approval, production uploaded **three synthetic 320×180 PNGs and one synthetic 12-second MP4 (11,903,346 bytes)** under the prefix `ТЕСТ МЕДИА 05.11`. Pause → safe reload → original-file reselection → **4/4 registered files** passed. Downloading the MP4 produced the same SHA-256 as the source:

```text
46004849411159F5C7FEFE8C591CAE3A834A9332917824FABE3DB9ADF886D464
```

All four test media files were moved to recoverable Trash. The three pre-existing TXT files, retained folders and prepared export remain intact. No permanent deletion, restore, cron, mail/push delivery or permission changes were performed. An earlier paused attempt was cancelled before registration; pending-session cleanup remains subject to the existing retention policy, not a manual purge.

Not verified here / Не проверено: physical iOS/Android background or lock-screen behavior, multi-gigabyte production throughput, a production upload under another member's account, full large-binary backup/restore. These are explicit acceptance boundaries, not passed checks.

Technical basis: [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Vercel function limits](https://vercel.com/docs/functions/limitations). Application limits above are this project's policy, not the advertised maximum of either platform.

Next UX backlog / Следующие задачи: [Deep audit, 5 November](UI_UX_DEEP_AUDIT_MEDIA_2026-11-05.md).
