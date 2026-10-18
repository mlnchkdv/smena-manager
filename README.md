# Smena Manager

A team task manager with dashboards, inbox, projects, boards, lists, tables, calendars, timelines,
files, members, teams, activity and settings. The interface is being adapted into the Smena team's
own workspace and prepared for later KMS modules such as knowledge, files and bookmarks.

The interface supports English and Russian. Change the language in **Settings → Language**;
the preference is saved locally and also updates localized dates and accessibility labels.

Built with plain JavaScript ES modules and CSS, bundled by [Vite](https://vite.dev). There is no
UI framework and no runtime dependency.

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
- Production stores one versioned `smena-manager-data.json` file in Google Drive.
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
Each has a 4 MiB transport budget. Storage schema 2 persists them together in one aggregate JSON
with a single ETag-protected write, so restore, deletion and portable imports cannot partially replace
the documents. Old separate content files are read during migration and retained as rollback sources;
they are not the source of truth after the first aggregate write. Binary files remain separate Drive
objects. This design favors consistency for a small team and does not reduce the bytes written per save.

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

## Deploy

`vercel.json` builds with Vite, serves `dist/` and routes `/api/*` to the Express Vercel Function.

`npm ci` also builds `.generated/sanitizer.mjs` in `postinstall`. Do not disable lifecycle scripts for
deployment: Vercel's CommonJS instrumentation cannot load the ESM-only HTML parser via `require()`.
The build bundles the current patched sanitizer as ESM rather than downgrading it. A bootstrap test
explicitly disables CommonJS `require(ESM)` to catch this production-only failure before release.
