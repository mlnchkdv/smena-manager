# Gr8r Studio

A calm, structured project management workspace: home dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity and settings.

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
npm run lint      # ESLint
npm run format    # Prettier
```

## Server and storage

The browser UI is being migrated from local-only state to an Express API. Vercel serves the API
through `api/index.js`; local development starts the same API alongside Vite and proxies `/api`
requests to it.

- `GET /api/health` checks the API runtime.
- `GET /api/auth/config` reports whether deployment credentials are complete.
- `POST /api/auth/validate` exchanges a team Access ID for a signed seven-day session.
- `GET /api/auth/me` returns the signed-in profile.
- `GET /api/storage/status` initializes the workspace database and reports its storage state after authentication.
- `GET /api/workspace` returns the current versioned JSON snapshot.
- `PUT /api/workspace` replaces the snapshot for editors and administrators when its revision still matches.
- Local development stores the JSON database in `.data/smena-manager-data.json`.
- Vercel requires Google Drive credentials and never falls back to its ephemeral filesystem.

Copy `.env.example` to `.env` for local configuration. OAuth2 credentials can use a dedicated
personal or Workspace account. A service account must also receive `GOOGLE_DRIVE_FOLDER_ID` for a
folder or Shared Drive that has been shared with it. Secrets belong in Vercel Environment Variables
and must not be committed.

Team profiles are supplied through `ACCESS_IDS_JSON` on Vercel. For local development, copy
`access-ids.example.json` to `.data/access-ids.json` and replace the example credentials. Access IDs
are passwords; never commit real values. Production also requires a stable `SESSION_SECRET`.
Workspace writes on Vercel additionally require `REDIS_URL`; the API reloads the Drive snapshot while
holding a distributed lock and rejects stale revisions instead of overwriting another member's work.

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
  data/seed.js          demo workspace data
  ui/                   shared render helpers, toasts, the select dropdown
  shell/                render loop and router, sidebar/topbar layout, skeletons, view engine
  components/           task list renderer
  pages/                one module per route
  views/                project views: board, table, calendar, timeline, files, overview
  overlays/             task drawer, modals, popovers, context menu, command palette
  features/             teams, subtasks, archive (rendering)
  actions/              user actions, event wiring, keyboard shortcuts, drag and drop
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

Every push and pull request runs lint, the format check and a production build
(`.github/workflows/ci.yml`).

## Deploy

`vercel.json` builds with Vite and serves `dist/`.
