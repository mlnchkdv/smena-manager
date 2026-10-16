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
for whitelisted team emails. Local development can also use Access IDs; both issue signed seven-day sessions. The
client keeps a local cache, serializes writes and uses optimistic revisions so a stale browser cannot
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
Workspace writes on Vercel can use `REDIS_URL` for a distributed lock, or
`WORKSPACE_WRITE_MODE=drive` for direct Drive persistence with revision and ETag conflict protection.
The direct mode suits a small team without a separate database; Redis remains preferable for high
write concurrency.

Roles are enforced on both sides: `admin` can manage all data and configuration, `editor` can update
projects/tasks/files but not membership or workspace settings, and `viewer` is read-only. Only an
administrator can initialize an empty production database on the first sign-in.

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
   - OAuth2: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. The application will
     create its `Smena-Manager-Storage` folder in that account if necessary.
   - Service account: `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or the full
     `GOOGLE_SERVICE_ACCOUNT_KEY` JSON. Create a Drive folder, share it with the service account and
     set `GOOGLE_DRIVE_FOLDER_ID`.
4. In Google Cloud Console, configure `GOOGLE_CLIENT_ID` as a **Web application** OAuth client and add
   `https://smena-manager.vercel.app` to **Authorized JavaScript origins**. The popup flow does not need
   a production redirect URI. If local Google login is required, also add the exact Vite origin and set
   `GOOGLE_LOCALHOST_ENABLED=true` locally.
5. For a small team without a separate database, set `WORKSPACE_WRITE_MODE=drive`. For higher write
   concurrency, add a managed Redis connection as `REDIS_URL` (for example Vercel Marketplace/Upstash).
6. Add the variables to every Vercel environment that should work (Production and, if desired,
   Preview), then redeploy. Run `npm run check:deploy` against an equivalent local `.env` before the
   deployment.
7. Open `/api/auth/config`. `deploymentReady` and `googleAuthEnabled` must both be `true`, while
   `configurationIssues` must be empty. Sign in with the administrator Google account;
   the first sign-in creates the Drive database from the current workspace seed. Afterwards, copy the
   created Drive file ID into the optional
   `GOOGLE_DRIVE_DATABASE_FILE_ID` variable to reduce lookup requests.
   The uploads folder is created alongside it; its optional ID can be saved as
   `GOOGLE_DRIVE_UPLOADS_FOLDER_ID` for the same reason.

The current storage model deliberately avoids PostgreSQL and suits a small team. Each change writes
the complete JSON snapshot, so it should be reconsidered when the database becomes large, edits become
very frequent, or the product needs record-level querying. Project and task uploads are stored in the
dedicated Drive `uploads` folder while their names, ownership and Drive IDs remain in the JSON database.
The synchronized JSON snapshot is capped at 4 MiB so it remains below the Vercel Function request limit;
oversized knowledge imports are rejected before local data changes. The default per-file upload limit is
4 MiB on Vercel and 100 MiB locally. `SHARED_FILE_MAX_BYTES` can lower either limit, but cannot raise the
Vercel limit above 4 MiB.

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

## Deploy

`vercel.json` builds with Vite, serves `dist/` and routes `/api/*` to the Express Vercel Function.
