# Smena Manager

A team task manager with dashboards, inbox, projects, boards, lists, tables, calendars, timelines,
files, members, teams, activity and settings. The original Gr8r interface is being adapted into the
Smena team's own workspace and prepared for later KMS modules such as knowledge, files and bookmarks.

The interface supports English and Russian. Change the language in **Settings → Language**;
the preference is saved locally and also updates localized dates and accessibility labels.

Built with plain JavaScript ES modules and CSS, bundled by [Vite](https://vite.dev). There is no
UI framework and no runtime dependency.

![Gr8r Studio home dashboard](docs/preview.png)

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
the same API alongside Vite and proxies `/api` requests to it. Authentication uses team Access IDs
and signed seven-day sessions. The client keeps a local cache, serializes writes and uses optimistic
revisions so a stale browser cannot silently replace newer team data.

- `GET /api/health` checks the API runtime.
- `GET /api/auth/config` reports whether deployment credentials are complete.
- `POST /api/auth/validate` exchanges a team Access ID for a signed seven-day session.
- `GET /api/auth/me` returns the signed-in profile.
- `GET /api/storage/status` initializes the workspace database and reports its storage state after authentication.
- `GET /api/workspace` returns the current versioned JSON snapshot.
- `PUT /api/workspace` replaces the snapshot for editors and administrators when its revision still matches.
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

Team profiles are supplied through `ACCESS_IDS_JSON` on Vercel. For local development, copy
`access-ids.example.json` to `.data/access-ids.json` and replace the example credentials. Access IDs
are passwords; never commit real values. Production also requires a stable `SESSION_SECRET`.
Workspace writes on Vercel additionally require `REDIS_URL`; the API reloads the Drive snapshot while
holding a distributed lock and rejects stale revisions instead of overwriting another member's work.

Roles are enforced on both sides: `admin` can manage all data and configuration, `editor` can update
projects/tasks/files but not membership or workspace settings, and `viewer` is read-only. Only an
administrator can initialize an empty production database on the first sign-in.

## Vercel production setup

1. Create a long random `SESSION_SECRET` (at least 32 characters).
2. Add `ACCESS_IDS_JSON` as a JSON array. Use a unique random Access ID of at least 16 characters for
   every person and include at least one `admin`. Start from `access-ids.example.json`, but never
   commit real IDs. A profile is linked to its workspace member by `authProfileId`, matching `id`, or
   matching email. The first administrator is linked automatically when the database is created.
3. Configure Google Drive using one of these options:
   - OAuth2: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. The application will
     create its `Smena-Manager-Storage` folder in that account if necessary.
   - Service account: `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or the full
     `GOOGLE_SERVICE_ACCOUNT_KEY` JSON. Create a Drive folder, share it with the service account and
     set `GOOGLE_DRIVE_FOLDER_ID`.
4. Add a managed Redis connection as `REDIS_URL` (for example Vercel Marketplace/Upstash). It is
   required because separate Functions can write concurrently.
5. Add the variables to every Vercel environment that should work (Production and, if desired,
   Preview), then redeploy. Run `npm run check:deploy` against an equivalent local `.env` before the
   deployment.
6. Open `/api/auth/config`. `deploymentReady` must be `true` and `configurationIssues` empty. Sign in
   with the administrator Access ID; the first sign-in creates the Drive database from the current
   workspace seed. Afterwards, copy the created Drive file ID into the optional
   `GOOGLE_DRIVE_DATABASE_FILE_ID` variable to reduce lookup requests.
   The uploads folder is created alongside it; its optional ID can be saved as
   `GOOGLE_DRIVE_UPLOADS_FOLDER_ID` for the same reason.

The current storage model deliberately avoids PostgreSQL and suits a small team. Each change writes
the complete JSON snapshot, so it should be reconsidered when the database becomes large, edits become
very frequent, or the product needs record-level querying. Project and task uploads are stored in the
dedicated Drive `uploads` folder while their names, ownership and Drive IDs remain in the JSON database.
Vercel request limits still apply; the default per-file limit is 4 MB on Vercel and 100 MB locally and
can be lowered with `SHARED_FILE_MAX_BYTES`.

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
  shared/               access rules used by both browser and server
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
