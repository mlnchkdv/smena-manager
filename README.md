# Smena Manager

## Кратко / Short description

**RU:** Smena Manager — совместное рабочее пространство команды: задачи, проекты, календарь, входящие, уведомления, файлы, база знаний, закладки и граф связей между материалами. Приложение поддерживает русский и английский языки, Google Sign-In, хранение JSON-документов в Google Drive и Web Push/Gmail-уведомления без PostgreSQL. Подробный двуязычный контекст для передачи другим моделям находится в [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).

**EN:** Smena Manager is a shared team workspace for tasks, projects, calendar, inbox, notifications, files, knowledge notes, bookmarks, and a graph connecting materials. It supports Russian and English, Google Sign-In, Drive-backed JSON documents, and Web Push/Gmail notifications without PostgreSQL. The detailed bilingual handoff context is available in [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).

A team task manager with dashboards, inbox, projects, boards, lists, tables, calendars, timelines,
files, members, teams, activity and settings. The interface is being adapted into the Smena team's
own workspace, with knowledge notes, project files, bookmarks and material connections already available.

The interface supports English and Russian. Change the language in **Settings → Language**;
the preference is synchronized with the user's account and cached locally. It also updates localized dates and accessibility labels.

Built with plain JavaScript ES modules and CSS, bundled by [Vite](https://vite.dev). There is no
UI framework. The Express server uses runtime dependencies for Drive, authentication and notifications;
graph and PDF libraries are loaded on demand in the browser.

Current audit findings, delivered fixes and verification limits / Текущий аудит, исправления и границы проверок:
[`docs/IMPROVEMENT_STATUS.md`](docs/IMPROVEMENT_STATUS.md).

![Smena Manager home dashboard](docs/preview.png)

## Getting started

Requires Node.js 22 (`.nvmrc` pins the same major version).

```bash
npm install
npm run dev       # frontend on :5173 and local API on :3001
npm run build     # production build in dist/
npm run preview   # serve the production build locally
npm run test:server
npm run check:deploy # validate production variables without printing secrets
npm run lint      # ESLint
npm run format    # Prettier
```

## Server and storage

The browser UI uses an Express API. Vercel serves it through `api/index.js`; local development starts
the same API alongside Vite and proxies `/api` requests to it. Authentication uses Google Sign-In
for whitelisted team emails. Local development can also use Access IDs; both issue signed seven-day sessions.
Browser sessions use HttpOnly cookies; the browser cache stores only a session marker. The
client keeps owner-scoped recovery drafts, serializes writes and uses optimistic revisions so a stale browser cannot
silently replace newer team data.

- `GET /api/health` checks the API runtime.
- `GET /api/auth/config` reports whether deployment credentials are complete.
- `POST /api/auth/google` verifies a Google Identity Services ID token and matches its confirmed email
  to an active team profile.
- `POST /api/auth/validate` exchanges a team Access ID for a signed seven-day session when the fallback is enabled.
- `GET /api/auth/me` returns the signed-in profile.
- `GET /api/storage/status` initializes the workspace database and reports its storage state after authentication.
- `GET /api/workspace` returns the current versioned JSON snapshot.
- `PUT /api/workspace` validates and updates the snapshot for editors and administrators when its revision still matches. Omitted top-level collections are preserved.
- Local development stores the JSON database in `.data/smena-manager-data.json`.
- Production stores a versioned `smena-manager-data.json` root and immutable project catalog parts in Google Drive.
- Redis stores no workspace content; it is used only as a short distributed write lock between
  concurrent Vercel Functions.
- The browser's `localStorage` is an offline cache, not the shared source of truth.
- Vercel never falls back to its ephemeral filesystem.

Copy `.env.example` to `.env` for local configuration. OAuth2 credentials can use a dedicated
personal or Workspace account. A service account must also receive `GOOGLE_DRIVE_FOLDER_ID` for a
folder or Shared Drive that has been shared with it. Secrets belong in Vercel Environment Variables
and must not be committed.

Bootstrap team profiles are supplied through `ACCESS_IDS_JSON` on Vercel. For local development, copy
`access-ids.example.json` to `.data/access-ids.json` and replace the example credentials. Access IDs
are passwords; never commit real values. Their login form is enabled locally and disabled on Vercel by
default. Set `ACCESS_ID_LOGIN_ENABLED=true` only when a temporary production recovery channel is
required. Production also requires a stable `SESSION_SECRET`.
Workspace writes on Vercel can use `REDIS_URL` for a renewable distributed lock, or
`WORKSPACE_WRITE_MODE=drive` for direct Drive persistence with revision and ETag conflict protection.
The direct mode suits a small team without a separate database; Redis remains preferable for high
write concurrency. The account menu reports the active write-protection mode and whether the shared
lock is reachable, without exposing connection credentials.

The API exposes three independently revisioned documents: workspace core, knowledge and bookmarks.
Each has a 4 MiB transport budget; the file catalog has its own 32 MiB logical budget. Storage schema 3
keeps core/knowledge/bookmarks and a compact catalog manifest in the root, with complete file records
in immutable project parts. Parts are checksum-verified and the root is published last with one
ETag-protected write. Initial bootstrap does not fetch full catalog records; file browsing resolves
bounded pages on demand. Unchanged parts are reused, including after global reordering.
Cold search/graph reads use immutable compact search parts when available, without file histories or
storage identities. Legacy catalogs fall back to canonical parts until the next normal save publishes
the derived index. ZIP status/download validation and streamed archives read only selected identities;
full workspace writes and backups still require canonical records. Detailed capacity uses a
revision-bound root summary (with exact canonical fallback for older roots), not file-part downloads.
Save preparation and pre-restore/import checkpoints now reuse the atomic mutation's canonical
snapshot instead of preloading the full catalog again. Standalone backups read a fresh root and may
reuse a complete worker snapshot only after exact ETag confirmation; cold/changed sources still
materialize and verify all parts. Backup JSON is streamed record by record, preserving standalone
complete metadata/history rather than references to catalog parts.
Document-only saves and demand-mode personal preferences now use a narrowly scoped root patch:
they validate the manifest, ownership/allowed fields, size budgets and snapshot-bound ETag without
downloading unchanged file parts. Part pointers and physical accounting are preserved; the exact
catalog byte budget accounts for revision digit growth. Legacy/migration cases fall back to the
canonical path. Demand-mode renames and folder moves of up to 500 existing files now read and
rewrite only affected immutable parts, after checking the latest member/project permissions and
every other incoming core field. Physical metadata, ACLs, relations, registry and retention stay
unchanged; only matching attachment folder pointers may change. Snapshot-specific CAS, checksums,
global order and exact byte accounting remain enforced. Mixed/core changes, additions, removals,
physical changes and recovery still require complete canonical validation.
Legacy aggregate/separate-document layouts remain readable. Binary files remain separate Drive
objects. Graphs and connection pickers now use revision-fenced server queries (250/50 nodes),
without hydrating all file records in the browser; only explicit JSON export returns the full graph.
General whole-workspace writes and cold/changed backups still materialize records; this is not independent per-project transaction storage. See the context document for
rollback, retention and concurrency limitations.

Roles are enforced on both sides: `admin` can manage all data and configuration, `editor` can update
projects/tasks/files but not membership or workspace settings, and `viewer` cannot change shared content.
All roles can save their own profile, preferences and notification read state through `/api/preferences`. Only an
administrator can complete onboarding after the Drive storage identities have been initialized.

## Vercel production setup

1. Create a long random `SESSION_SECRET` (at least 32 characters).
2. Add `ACCESS_IDS_JSON` as a JSON array. Include the Google email each bootstrap profile will use and
   include at least one `admin`. If emergency Access ID login will be enabled, use a unique random ID of
   at least 16 characters for every person. Start
   from `access-ids.example.json`, but never commit real IDs. Google Sign-In is a whitelist: a verified
   Google email must match an active profile exactly. A profile is linked to its workspace member by
   `authProfileId`, matching `id`, or matching email. The first administrator is linked automatically
   when the database is created.
3. Configure Google Drive using one of these options:
   - OAuth2: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. Local storage setup
     creates its `Smena-Manager-Storage` folder in that account if necessary.
   - Service account: `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or the full
     `GOOGLE_SERVICE_ACCOUNT_KEY` JSON. Create a Drive folder, share it with the service account and
     set `GOOGLE_DRIVE_FOLDER_ID`.
4. In Google Cloud Console, configure `GOOGLE_CLIENT_ID` as a **Web application** OAuth client and add
   `https://smena-manager.vercel.app` to **Authorized JavaScript origins**. The popup flow does not need
   a production redirect URI. If local Google login is required, also add the exact Vite origin and set
   `GOOGLE_LOCALHOST_ENABLED=true` locally.
5. For a small team without a separate database, set `WORKSPACE_WRITE_MODE=drive`. For concurrent
   team editing, add a managed Redis connection as `REDIS_URL` (for example Vercel Marketplace/Upstash).
   Use a TLS `rediss://` URL in Production. Once connected, the account status panel must show
   `Distributed lock`; `Lock unavailable` means writes should be investigated before team use.
6. From one local maintenance process, with the intended Google credentials in `.env` and no `VERCEL`
   variable, run `npm run setup:storage`. It creates only missing storage metadata and does not replace
   an existing workspace. Copy the printed file/folder IDs into the corresponding Vercel variables.
   Existing installations can run the same command to discover IDs and initialize missing private files.
   Do not run setup concurrently from another machine. Vercel requests fail with `DRIVE_BOOTSTRAP_REQUIRED`
   rather than creating duplicate metadata; ambiguous name lookups fail with `DRIVE_STORAGE_AMBIGUOUS`.
   Resolve duplicates by pinning the intended IDs; do not delete files to guess which is current.
   Add the variables to every Vercel environment that should work (Production and, if desired,
   Preview), then redeploy. Run `npm run check:deploy` against an equivalent local `.env` before the
   deployment.
7. Open `/api/auth/config`. `deploymentReady` and `googleAuthEnabled` must both be `true`, while
   `configurationIssues` must be empty. Sign in with the administrator Google account;
   the administrator can then finish workspace onboarding. `/api/readiness` must confirm storage and
   operational health after signing in; public configuration alone does not verify Drive access.

### Separate Gmail consent for email notifications

Email delivery uses a dedicated refresh token so granting or revoking Gmail access cannot replace the
token that stores workspace data in Drive. Enable the Gmail API in the same Google Cloud project, add
`https://www.googleapis.com/auth/gmail.send` to the OAuth consent screen and add
`http://127.0.0.1:53682/oauth2/callback` to the web client's authorized redirect URIs. For an External
app in Testing, add `avdeevandry1999@gmail.com` as a test user; note that Google expires Testing grants
after seven days, so a durable production sender should use the appropriate Production/verification
status for the project.

With `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `EMAIL_FROM` available in the local environment,
run `npm run setup:gmail`. The helper opens Google's consent page, requests only identity plus
`gmail.send`, verifies that the confirmed account matches `EMAIL_FROM`, and saves the refresh token to
the ignored `.data/gmail-oauth.env` file. Copy that value to the Vercel secret
`GMAIL_OAUTH_REFRESH_TOKEN` for Production (and the desired Preview/Development environments), then
redeploy. A separate OAuth client can instead be supplied through `GMAIL_OAUTH_CLIENT_ID` and
`GMAIL_OAUTH_CLIENT_SECRET`.

The current storage model deliberately avoids PostgreSQL and suits a small team. Each change writes
the complete JSON snapshot, so it should be reconsidered when the database becomes large, edits become
very frequent, or the product needs record-level querying. Project and task uploads are stored in the
dedicated Drive `uploads` folder while their names, ownership and Drive IDs remain in the JSON database.
Each synchronized API document is capped at 4 MiB to stay below the Vercel Function request limit;
oversized knowledge imports are rejected before local data changes. Files default to a 100 MiB limit.
On Vercel, the server creates a short-lived signed Google Drive resumable session and the browser uploads
8 MiB chunks directly to Drive; the server verifies the resulting file before registering it in the
workspace. This keeps file bodies outside the Vercel Function request limit. `SHARED_FILE_MAX_BYTES` can
lower or raise the application limit if the team needs a different policy.

File previews download actual authorized file content: bounded raster images (20 MiB), plain text
(1 MiB), and PDF pages (20 MiB). PDF.js is loaded only when needed, runs its worker locally and renders
one page at a time without document scripts, forms or interactive links. Rendering is cancelled on
close/account change and times out after 15 seconds. Font/CMap assets and third-party notices are
self-hosted. Visible small raster thumbnails are lazy-loaded, with two concurrent downloads and a
32-entry cache; SVG, animated GIF and large-image thumbnails are excluded. Unsupported files remain
downloadable rather than using a misleading mock preview.

## Recovery and operations

Settings → Data transfer provides an independent recovery download containing workspace data and
binary attachments, including referenced trash entries. The streaming export deduplicates physical
files and includes SHA-256 checksums for the data and each attachment. The current export limit is
100 MiB of attachment content; export larger files separately. Treat the bundle as confidential team
data and keep it outside the Google Drive account used by the application.

Restore into a new empty local directory without Google credentials:

```powershell
node scripts/restore-recovery.js ./smena-recovery-YYYY-MM-DD.json ./.data/recovery-drill-YYYY-MM-DD
```

The command verifies checksums before writing, remaps storage references, preserves alias links and
refuses to overwrite an existing database or non-empty target directory. It does not modify the live
workspace. The resulting `workspace.json` and `uploads/` are self-contained. If recovery fails, preserve
the target for diagnosis and use another empty directory for a retry. Do not point a running app at
the drill until its Google storage credentials have been explicitly disabled and local database and
upload paths configured.

The automated recovery test removes its synthetic source storage before restoring projects, tasks,
knowledge, bookmarks and an attachment with two references. Repeat a controlled drill with approved
team files before treating this as a production recovery SLA. A working daily Drive backup targets
up to 24 hours of data loss for an application failure. Loss of the entire Google account is covered
only up to the most recent independent export. Set an export interval with the team; a two-hour
recovery objective should be measured during the drill, not assumed.

Physical attachment deletion is delayed for at least 30 days and then requires the absence of live,
trash and retained-backup references. An unreadable backup prevents garbage collection. Manual
backups retain their referenced files until those backups are removed.

Direct-upload sessions are journaled before Drive creates an upload. A bounded daily sweep checks
abandoned sessions after 48 hours, verifies their unique marker, folder and size, and queues eligible
unreferenced files for the same delayed garbage collection. It does not immediately delete them.
Missing or unverifiable legacy uploads require manual inventory; no broad Drive folder purge runs.

Unsaved workspace/document drafts use an account-scoped IndexedDB journal and recover after reload.
If browser storage is unavailable or full, saving to the server still works, but unsaved changes only
remain in the open tab. The warning provides a JSON draft download; this is not a binary recovery
bundle and should not be treated as a substitute for one.

Personal display preferences have their own account/workspace-scoped journal and retry queue. They
recover after reload, send only fields changed locally, and stop on a session change. Defaults reset
when another account signs in. Spellcheck and deletion confirmation are persisted booleans; disabling
spellcheck is inherited by the app's text editors. Notification read changes are serialized and bulk
read operations use at most 500 IDs per request, stop on failure, and roll back unsaved UI marks.

The browser binds authenticated API requests to its loaded account with `X-Smena-Account`; the server
compares this context with the verified session, not with a client-selected permission. A cookie
changed in another tab causes a mismatch rather than writing under the new account. The old tab stops
its queues without clearing the new account's shared session. Recovery download links carry the same
expected account as a query parameter. Reload existing tabs after deployment to adopt the new client
guard; legacy requests remain subject to the normal server session/ACL checks.

The current JSON transport ceiling is 4 MiB per logical document, independent of binary uploads.
Pagination bounds displayed task/file rows but does not raise that ceiling. A representative local
fixture with descriptions and one comment per task measured 831,389 bytes for 1,000 tasks and
8,373,390 bytes for 10,000. These are fixtures, not a guaranteed task count: real text and history
change the capacity. Large-workspace support still needs entity-oriented mutations and paginated data
transport; do not promise 10,000 fully populated tasks on the current snapshot API.

Browsers with Web Locks, BroadcastChannel and storage elect a short-lived polling coordinator per
account. Other tabs refresh when document revisions change. An expired lease can be taken over by
another tab; unsupported or blocked facilities retain independent polling and exponential backoff.

`GET /api/health` is public liveness. Administrator-only `GET /api/readiness` checks storage,
coordination, automation and backup freshness. API failures include an `X-Request-ID` header and a
`requestId` field for correlation. Provider logs contain error codes and statuses, not authorization
headers, refresh tokens or request bodies. When Drive is unavailable, keep unsaved browser tabs
open, avoid destructive retries, and check the request ID and readiness before restoring anything.

The hosting account designated for Google resources is `avdeevandry1999@gmail.com`. Keep ownership
and recovery access for Google, GitHub and Vercel available to the responsible administrator. Before
production acceptance, check the Google consent publishing state and authorized scopes, the dedicated
Gmail refresh token, domain and redirect configuration, real-device push delivery and an independent
recovery drill. Rotate credentials through ignored local files and Vercel secrets, never Git.

Read-only Google Console acceptance on 18 October 2026 confirmed that `kms-brain-storage` is External
and In production, but the configured restricted `drive` scope is still unverified. The registered
scope list currently shows only `drive`; this does not prove the actual Gmail refresh token's grants.
The shared OAuth client is named KMS-Brain Web Client. No consent settings, scopes, clients or secrets
were changed during this check. Before submitting verification, review the least-privilege `drive.file`
option against isolated existing-file/folder access, confirm the Gmail grant separately, and prepare
the required demonstration/justification. Do not narrow or revoke shared grants without checking
their effect on KMS-brain and obtaining explicit approval.

## Project structure

```
index.html              HTML entry; loads src/main.js
public/favicon.svg      brand mark
vite.config.js          Vite config, including the Lucide icon-subset plugin
eslint.config.js        lint rules (ESLint flat config); formatting by Prettier (.prettierrc.json)
.github/workflows/      CI: lint, format check, build
docs/preview.png        README screenshot
src/
  main.js               entry: imports styles and modules, then boots the app
  styles/
    index.css           imports every stylesheet in cascade order
    tokens.css          colours, spacing, type, radius, the shared --gutter
    base.css  components.css  shell.css  panels.css  overlays.css  states.css  motion.css  responsive.css
    views/              list, board, table, calendar, timeline, projects & files
    pages/              settings, auth & onboarding
  core/                 utilities, constants, icons, store (state + lookups), theme
  server/               Express API, sessions, Google Drive storage, Redis coordination
  shared/               access rules, schema validation and transport limits used by browser and server
  data/seed.js          demo workspace data
  ui/                   shared render helpers, toasts, the select dropdown
  shell/                render loop and router, sidebar/topbar layout, skeletons, view engine
  components/           task list renderer
  pages/                one module per route
  views/                project views: board, table, calendar, timeline, files, overview
  overlays/             task drawer, modals, popovers, context menu, command palette
  features/             teams, subtasks, archive (rendering)
  actions/              user actions, event wiring, keyboard shortcuts, drag and drop
scripts/                 production configuration checks
```

### Layers

Dependencies point downward:

1. `core/` and `data/` depend on nothing else in the app.
2. `ui/`, `shell/`, `components/`, `pages/`, `views/`, `overlays/` and `features/` render HTML from state.
3. `actions/` change state and re-render. Each action module registers its handlers on the
   shared action table (`A`) when it loads, so `main.js` imports them after `actions/actions.js`.

## Conventions

- **Rendering:** each page or view is a function that returns an HTML string from the store
  (`S`). `render()` rebuilds the shell and keeps focus and scroll positions.
- **Interactions:** elements declare `data-a="actionName"`. `actions/events.js` delegates the
  click to `A.actionName`. Inputs use `data-in`, blur handlers use `data-blur`.
- **Layout:** every page edge uses `var(--gutter)`, so the breadcrumb, page header, toolbar,
  list, table and board start on the same line.
- **Dropdowns:** write a normal `<select class="select">`. `ui/select.js` renders it as the
  design-system menu and keeps the native element as the source of truth.
- **Icons:** call `ic('name')` with any [Lucide](https://lucide.dev) icon name. The
  `virtual:icons` plugin bundles only the icons the source uses.

## Continuous integration

Every push and pull request runs lint, the format check, server tests and a production build
(`.github/workflows/ci.yml`).

The default browser suite covers Chromium workflows plus Firefox/WebKit smoke checks. For the extended
workspace/PDF scenarios on all three engines, run in PowerShell:

```powershell
$env:E2E_EXTENDED_BROWSERS = 'true'
npm run test:e2e
Remove-Item Env:E2E_EXTENDED_BROWSERS
```

Tests use isolated local storage, ports and build artifacts with external delivery credentials disabled.
Desktop emulation does not replace Google popup, mobile keyboard or installed-PWA push acceptance on
real iOS/Android devices.

Personal mutation handlers and file-thumbnail code load only when first needed. A failed optional
thumbnail load keeps the normal placeholder and file actions. Deferred personal actions check the
account/session context again before running; a late module load cannot apply a previous account's
action to the new session.

`.github/workflows/deployment-smoke.yml` runs public, read-only smoke checks after production
`vercel.deployment.success` events and supports manual runs. It checks the frontend module entry,
API health, usable sign-in configuration and HTTP 401 for unauthenticated workspace access. The
automatic run targets the public production alias: immutable Vercel URLs can redirect to SSO even
when the public app is available. Checks never follow redirects, send credentials, bypass protection,
or perform workspace writes. They are a post-deployment check, not a pre-promotion staging gate or
proof of Drive/Gmail readiness. Event integration follows the
[Vercel GitHub documentation](https://vercel.com/docs/git/vercel-for-github#repository-dispatch-events).

Run the same checks manually without local Google credentials:

```powershell
npm run check:live
```

### Responsive follow-up (2026-10-18)

Bulk task actions wrap within the viewport and sit above mobile navigation. Dialog bodies scroll
independently of their wrapping action footers; dynamic viewport heights and bottom safe-area
insets keep the controls usable on short screens. Enhanced selects use the visual viewport when
positioning and sizing their menus. Recovery banners wrap their text and actions on phones, and
member settings wrap directory actions and long email addresses instead of clipping them.

Verification: 10 Chromium scenarios plus the Firefox and WebKit core smoke scenarios passed.
Additional RU/EN checks covered task dialogs and bulk actions at 320×568, 640×320, 768×540 and
1440×900. A 31-route Russian sweep at 320×568 and 640×320 found the member-settings overflow
addressed above; a simulated preferences-write outage verified that both recovery buttons remain
visible and that retry succeeds. These are browser-emulation results, not real-device acceptance.
The production build succeeds, with a remaining initial-chunk size warning (about 500 kB minified).

### Production audit (2026-10-18)

Read-only checks against `https://smena-manager.vercel.app` found and addressed four issues:

- Long OAuth scope URLs overflowed the privacy page at 320 px; legal content now wraps them.
- Google-only deployments still displayed the disabled Access ID form; it now follows server configuration.
- GIS injected a stylesheet blocked by CSP. Its observed SHA-256 hash is explicitly allowed in both
  static and API headers, without permitting arbitrary inline style elements or scripts. Re-audit this
  hash if Google's stylesheet changes; it is not a promise of compatibility with future SDK versions.
- The Google iframe's own padding was incorrectly included in a `max-width: 100%` restriction,
  clipping the button. Only the host wrapper is now constrained.

The public frontend, API health and auth configuration returned HTTP 200; anonymous workspace access
returned HTTP 401. Public RU/EN documents were checked at 320, 390, 768 and 1440 px. Authenticated
production sections, Drive writes, Gmail/Web Push delivery and multi-user conflict recovery still
require a signed-in session and controlled acceptance checks; public liveness cannot verify them.
`DRIVE_WRITE_CONCURRENCY` remains a documented warning about revision/ETag protection without a shared
lock, not an observed production data-loss incident. No team content was modified during this audit.

### Drive sign-in incident (2026-10-18)

Production read-only probes confirmed that V3 JSON media and metadata responses omitted ETag;
V2 metadata provided a validator and rejected a deliberately wrong conditional GET with HTTP 412.
Versioned JSON reads now bind the V2 resource ETag to the downloaded V3 bytes using Drive's MD5
checksum. A mismatch retries the read, then fails closed. Existing JSON files are updated with V2
`files.update` and the matching `If-Match`; private revision properties are translated to V2's
`PRIVATE` properties. General file operations remain on V3. No data migration or reset is involved.

Tests cover missing validators, racing downloads, stale writes, private-property mapping, and all
five JSON stores. Public auth configuration now reports `workspaceStorageAvailable`, and deployment
smoke requires a successful actual workspace read instead of treating credential configuration alone
as storage readiness. This still does not prove successful login, write delivery or notifications.
Temporary read-only probes were removed. The temporary ignored environment file was deleted; Vercel
had returned sensitive-value placeholders, not usable production credentials.

### Authenticated production audit (2026-10-18)

After sign-in recovery, the authenticated workspace was inspected without changing team content.
Home, inbox, notifications, project tasks, calendar, timeline, knowledge, bookmarks, team membership,
account sessions and settings loaded. The team displayed five members and its linked project.
At an actual 320 CSS-pixel viewport, inspected files, knowledge, bookmarks, team and inbox pages
had no horizontal root overflow. The empty file library did not permit verification of real uploads.

Fixes include task-dialog focus restoration after closing the assignee picker, localized active
filters and current-user labels, localized default team descriptions, explicit notification-health
explanations, and distinguishing Gmail authorization from proven successful delivery. Backup errors
now remain visible with actionable setup guidance instead of only a transient toast.

With user approval, Gmail API was enabled in the existing Google Cloud project. No test email or
manual delivery retry was sent. The missing `backups` folder was created inside the existing Drive
storage root without modifying existing files or permissions. The production backup list then
loaded successfully and reported no copies. This verifies listing, not backup creation or restore.
The interface no longer claims that daily copies already exist merely because scheduling is supported.

### Controlled delivery and recovery acceptance (2026-10-18)

With explicit user approval, two real manual Drive backups were created (HTTP 201). The newest
copy was restored without intentional intervening content changes (HTTP 200); the additional
pre-restore safety copy appeared and the authenticated workspace loaded afterward. This is a
same-state recovery rehearsal, not evidence of a disaster recovery SLA or attachment restoration.
The copies remain available in storage; no backup was deleted.

Self-only diagnostic buttons now send one selected channel to the authenticated administrator,
resolving the recipient server-side. They do not drain the team outbox, create task events or change
saved notification preferences. A per-instance one-minute cooldown limits repeat clicks; it is not
a distributed rate limiter. RU/EN labels distinguish provider acceptance from device receipt.
The real Gmail test to `mlnchkdv@gmail.com` and push test to one subscribed device each returned
one attempted, one accepted and zero failed deliveries. Actual inbox placement and OS presentation
still require the recipient's confirmation. Test results are session-local diagnostics, not a
replacement for the normal delivery history or evidence that previously failed messages were resent.

Remaining acceptance checks: the next successful scheduled run, recipient confirmation of Gmail
and push receipt, file upload/download, attachment recovery and controlled concurrent edits.
Earlier delivery failures remain historical evidence; tests do not rewrite that history.

### Attachment recovery and scheduled-run check (2026-10-18)

The recipient confirmed the Gmail test arrived in the inbox and the OS push notification appeared.
Today's genuine scheduled `/api/cron/reminders` invocation at 04:44:56 UTC (08:44:56 Saratov)
returned HTTP 503 before storage recovery. No manual cron invocation was used to claim scheduling
success. The next genuine morning run remains pending; a user-approved, one-time read-only follow-up
was scheduled for 2026-10-19 at 09:15 Europe/Saratov.

A synthetic 296-byte TXT attachment initially failed direct browser upload. Resumable Drive session
initialization now forwards the validated browser Origin so subsequent browser requests have the
proper CORS context. After deployment, the same fixture uploaded successfully and rendered in the
production file preview. No browser security protections or Drive sharing permissions were relaxed.

The production independent recovery export was downloaded through its normal authenticated link.
It contained one real asset. `scripts/restore-recovery.js` restored it to a new empty local directory,
alongside two tasks and one project, without writing to the production workspace or reading Drive
during restoration. The recovered attachment matched the original byte-for-byte:
SHA-256 `9ed52eec377fbc51df4e4736d4d4ed14b5241c4aa47261e0e9e093001af4c8fd`.
The private bundle and recovered workspace stay outside Git. At the user's request, the synthetic
fixture was subsequently moved from the production file library to application Trash; the empty
library persisted after reload. No permanent purge or physical Drive deletion was performed.
The separate ordinary-file browser download event could
not be verified because browser automation stalled; authenticated preview and bundle download worked.

This validates independent recovery for the tested small TXT asset, not every MIME type, the 100 MB
limit, Drive-to-Drive disaster recovery, or attachment recreation from ordinary JSON-only backups.
Ordinary backups retain file references and protect referenced uploads from garbage collection;
independent exports include the actual bytes. A stale open tab also encountered an old lazy-loaded
asset after deployment; the failure screen now has localized refresh guidance, without automatic
reloads that could interrupt unsaved work.

### File lifecycle follow-up audit (2026-10-18)

Deleting a library file previously removed task attachments by filename as well as ID. Two different
uploads named alike could therefore lose the wrong task reference. Both UI and API now use the same
stable-identity matcher: explicit IDs take precedence, storage identities support legacy references,
and display names never establish identity. The confirmation callback also re-resolves the current
record by ID instead of relying on an object that a background refresh may have replaced.

The file deletion toast and Undo action are localized, with a browser assertion for their Russian
text. Permanent-trash confirmation now explains that stored bytes are retained for at least 30 days
and while referenced by backups; it no longer promises immediate deletion from Google Drive.
The updated production confirmation was inspected and cancelled, not executed.

Validation: 241 server tests passed, including three new identity regressions; four selected existing
browser scenarios passed across Chromium, Firefox and WebKit, covering core RU/EN flows and shared
content/file/trash persistence. Lint and formatting checks passed. This is a focused lifecycle audit,
not a claim that all production concurrency and recovery scenarios have been accepted.

### Teams and calendar follow-up audit (2026-10-18)

Saving a team now preserves archived project relations hidden by the editor. Inactive members are
not reassigned by stale picker selections, and a team removed while its edit dialog is open no longer
causes a missing-object error. Team deletion resolves IDs instead of stale object references.

Calendar overflow lists now share the cell's date/project selection and current filtered task set;
they no longer reintroduce tasks or events from unrelated projects. User-authored event/task titles,
team names, member names and dynamic breadcrumbs are protected from UI translation. Team names in
member views and duplicate-name validation errors are escaped rather than interpreted as HTML.
The team deletion explanation and duplicate-name validation are localized.

A 320 px dialog check exposed a small horizontal overflow. Team picker fieldsets can now shrink,
and long related-team names are truncated within their column instead of pushing member names out.
Stale team IDs no longer render an untranslated fallback label in the picker.

Validation: 246 server tests passed; the shared-content workflow passed with a literal
`<strong>Review</strong>` team name, duplicate-name rejection and a 320 px picker check. Core flows
and 320 px RU/EN team dialogs passed in Chromium, Firefox and WebKit; screenshots were inspected.
The full Russian section sweep passed at 390, 768, 1024 and 1440 px. Build, lint and formatting passed.
All writes in these acceptance tests used isolated local data, not the team's production workspace.

### Search, knowledge and bookmarks follow-up audit (2026-10-18)

Search now distinguishes an empty selected category from matches elsewhere. Workspace-level file
results open the file preview rather than a missing project, and unknown file types, missing authors
and absent project descriptions no longer break the result renderer. Query matching ignores outer
spaces without removing spaces while the user types a multiword phrase. Populated section headings
and empty-category guidance are localized.

User-authored result titles, note summaries, wiki-link labels, bookmark descriptions, tags and folder
names are protected from UI translation. Literal `Review` and `Done` were checked in Russian and
English. Knowledge filters now select only matching notes; an empty selection cannot leave an
unrelated note editable. Following a wiki connection clears restrictive filters. Editor blur refreshes
wait for the focus transition and do not replace controls while focus stays inside the editor.

Saving a bookmark clears a stale search and reconciles its folder filter. Editing an archived
bookmark keeps the archived list selected. A concurrently removed bookmark is rejected rather than
silently recreated by a stale edit form. Four new unit regressions cover knowledge selection and
bookmark visibility, bringing the passing server suite to 250 tests.

Focused Playwright CLI checks exercised these sections in RU/EN at 320, 390, 768 and 1440 px, including
bookmark forms, archive editing, wiki navigation, empty categories and sequential editor input.
The measured page/editor/card/form overflow was zero; mobile screenshots were inspected. Existing
core browser scenarios passed in Chromium, Firefox and WebKit, and the Chromium shared-content
scenario passed. Lint, formatting, production build and public production smoke endpoints passed.
The existing approximately 508 kB initial-bundle warning remains a performance follow-up. Acceptance
writes used isolated local storage with Google, Gmail and push credentials disabled; this was not a
new end-to-end test of concurrent production Drive writes or outbound notification delivery.

### Material connections and workspace graph (2026-10-18)

The workspace sidebar now includes **Graph**. Notes, bookmarks, files, tasks and projects share stable
typed keys (`note:<id>`, `file:<id>`, etc.). Manual connections are stored in the existing aggregate's
`relations` collection with their own IDs, types and deletion tombstones; no new database or Google
scope is required. Project/task/file associations are computed rather than duplicated. Archived
objects can be included explicitly; trashed objects disappear from the graph, while retained
relations become visible again if their original IDs are restored.

Connection panels support outgoing links, backlinks, typed cross-resource search, manual removal
and local-graph navigation. Panels are available in the note editor, bookmark cards, file previews,
task cards and project overview. Search can pass its query to the graph, and the command palette
includes graph navigation. Only editors with edit access to both endpoints can create/remove a
manual connection; private endpoints and their edges are filtered server-side and in the graph.

Unambiguous legacy wiki references acquire stable target IDs. Renaming a target does not break the
link, including saves from older document clients that omit wiki metadata. Ambiguous/missing targets
are not guessed: select the unresolved link in a note's Connections panel to choose the target.
Removing its wiki token from the note removes the computed connection. Automatic associations and
wiki links are changed at their source rather than through the manual Remove connection button.

The lazy-loaded Cytoscape view supports node selection/dragging, pan/zoom, fit controls, filters,
one/two-hop local neighborhoods and an accessible list alternative. Stable local graph URLs survive
reloads. The canvas displays at most 250 matching nodes; it does not silently discard stored data.
Graph JSON export includes the entire permitted filtered selection, not just the visual window.
Portable format v2 includes note/bookmark connections and remaps IDs across import conflicts and
duplicate URLs. It intentionally does not export files/tasks/projects or their connections: use a
full backup/recovery export for those. v1 and KMS imports remain supported.

Acceptance checks used isolated local storage with Google/Gmail/push credentials disabled. RU/EN
graph and picker layouts were exercised at 320, 390, 768 and 1440 px; screenshots exposed and helped
fix an off-canvas viewport after desktop/mobile resizing. Browser checks covered connection creation
and deletion across reloads, file-to-note links, direct file URL navigation, JSON download, explicit
wiki target selection and target renaming. Local backup creation/restoration preserved manual file
references and wiki bindings. Regression tests also cover private endpoints, view-only permissions,
concurrent tombstones/additions, portable-ID remapping and a 10,000-task graph. These checks do not
claim a new production-team mutation, byte-level attachment recovery or multi-device push test.

Final validation: all 262 server tests passed, plus the four existing Chromium/Firefox/WebKit core
and shared-content scenarios. The new graph-specific browser checks were performed in Chromium.
Lint, formatting and production build passed. Public production smoke checks passed and the deployed
graph chunk returned HTTP 200. The graph engine is a separate approximately 452 kB lazy chunk;
the approximately 525 kB initial-bundle warning remains an optimization follow-up.

### Production graph follow-up, 18 October 2026

With explicit approval, two uniquely named `ТЕСТ ГРАФА` notes were created in production.
A manual connection survived a full reload and appeared in the local graph; deleting it also
survived reload. Both temporary notes were then moved to recoverable Trash. The original note,
bookmark, project and tasks were left unchanged. Production returned to 5 graph nodes and 2 edges.
The account language was temporarily changed to English and restored to Russian.

The graph now has a compact collapsible filter panel, a type legend, colored shape/icon nodes,
deterministic component packing and an optional closable details panel. Topology changes reset
stale viewports while selection changes preserve them. Browser geometry checks covered widths
320, 390, 768 and 1440 in both languages, including expanded filters and mobile material details;
no horizontal page overflow was observed. Production UI checks used its actual 320 px viewport.

The production Trash test also exposed recovery racing sibling document writes against the shared
Drive aggregate. Recovery now waits for those writes before fetching/merging revisions. The two
production deletions were completed with the safe synchronization action, not a forced overwrite.
This timing fix has not been re-tested with another production deletion.

Validation: 264 server tests, three existing Chromium/Firefox/WebKit core smoke scenarios, lint,
formatting, build and public deployment smoke checks passed. Graph-specific visual checks used
Chromium. The approximately 525 kB initial-bundle warning remains a performance follow-up.

## Deploy

`vercel.json` builds with Vite, serves `dist/` and routes `/api/*` to the Express Vercel Function.

`npm ci` also builds `.generated/sanitizer.mjs` in `postinstall`. Do not disable lifecycle scripts for
deployment: Vercel's CommonJS instrumentation cannot load the ESM-only HTML parser via `require()`.
The build bundles the current patched sanitizer as ESM rather than downgrading it. A bootstrap test
explicitly disables CommonJS `require(ESM)` to catch this production-only failure before release.
