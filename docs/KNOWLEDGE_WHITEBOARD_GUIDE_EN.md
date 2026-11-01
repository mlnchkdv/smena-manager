# Knowledge, whiteboards and graph: everyday workflows

Updated on 1 November 2026 after R01–R31. In-app guidance is available under **Settings → Help & resources**. [Changes and verification limits](UI_UX_DELIVERY_2026-11-01_THIRTY_ONE.md).

## New after N01–N24

- Note search opens the reader with highlighted body matches and previous/next controls. A title, tag or metadata match may have no body highlight.
- Contents has its own list button; history, source download and offline actions live in the ellipsis menu.
- Wrap lines changes source display while preserving text and caret. It is personal to this device and workspace.
- Use arrows, Home/End and Left/Right in folders; Enter opens the focused folder. Shift+click or Shift+Space selects a note range on the current page.
- Outline can collapse/expand every frame. More tools contains an optional minimap: arrows pan the camera; Enter fits the board. These actions do not edit cards.
- Graph List uses arrows/Home/End for focus and Enter to select a material. Nested overlays own the keyboard above diagram Focus.
- On phones the header status icon opens the account menu and data-save details. It does not certify email/push delivery.

[Deployment status and verification limits](UI_UX_DELIVERY_2026-11-01_TWENTY_FOUR.md): three final corrections await the Vercel daily allowance.

## Notes

1. Open the arrow next to New note to choose a type or template. The main button creates a regular note.
2. Import TXT/MD using Import notes or drop them into the catalog; review before applying. Library tools contains ZIP, templates, types and the offline library.
3. Type and properties in the reader header edits metadata without opening the full editor and returns to the same reading position.
4. Display → Card details chooses type visibility and up to three fields for each type. Empty values are hidden. This setting is personal and synced within the workspace.
5. On phones, tap the folder name above the catalog. Pin frequent folders, use recent folders and Parent folder. The move dialog retains query and list position when returning.
6. Check the explicit search scope. Switching to the whole library keeps the query. Expand conditions to remove one; all conditions must match (AND). A saved collection indicates when its query has been modified.

## Display, reading and tools

Display controls grid/compact list, folders and card details. Mobile import, ZIP, offline notes, templates, tags and saved searches are available through Library tools. New note retains its label on phones. A first mobile visit uses the compact list when no view has been saved; existing choices are retained.

On desktop, Display can hide the folder pane, adjust its width or reset it. This is personal to the account/workspace on this device; phones keep the separate folder panel. Card density inherits the interface appearance until explicitly overridden; choosing the interface setting removes the local override.

The path above an open note navigates to its folder. Wait for unsaved text to finish saving first. The reader actions menu includes Version history and Download source. Blocks shows move tools for the active block, with unavailable directions disabled. Source formatting belongs to Editor mode.

A saved search on this device is a personal shortcut. Use smart collections for shared selection rules; these mechanisms have different persistence scopes.

The reader hides empty sections and a first Markdown heading that exactly repeats the title. Source, TXT and history are unchanged. A clean reader can apply an app update and return to its reading position; editors, conflicts and transfers block the update.

## Three different tools

- **Board** groups project tasks by status.
- **Whiteboard** arranges cards, materials and frames in an independent workspace document. Its connectors do not create global material relations.
- **Graph** explores relationships across workspace materials.

Every project view is available from the phone view selector. Desktop tabs reveal the selected view horizontally.

## Whiteboards

Open Whiteboards in the workspace menu. Create a document without a project for workspace collaboration, or choose a project to inherit its access. Existing project boards and old links are preserved. The catalog offers search, grid/list, sort and recoverable archive. On phones, secondary controls are under Filters. Editing retains the original project association to avoid expanding access.

Focus fits the canvas to the available window. Exit focus or Escape returns to the normal screen. Access badges show workspace or inherited project scope; Copy link does not grant additional access. Catalog view, filters, sort and return position are retained for your account and workspace on this device.

Enable Select cards and tick several cards to align, distribute, copy or remove them. A frame includes cards contained within it. Ctrl/Cmd+A, C, V and Z work when the canvas has focus. Outline is useful for reading and editing on narrow screens.

A click/tap selects a card without changing the document. A linked material has Open material in the screen-space selection panel, independent of canvas zoom. On phones, Scroll page / Move canvas chooses the gesture mode; a new mobile session starts with page scrolling. Outline searches card content and frame titles; matching frames show their contained cards. Find on canvas returns to the chosen result.

History shows the author and compares the selected version with the current state before restoration. It loads on demand and requires current whiteboard read access. Up to five previous versions per whiteboard are retained within a shared 700,000-character budget. Restoring keeps the current board as a recovery version. If the board changes during review, reopen history. Local undo retains 12 commands and complements durable history.

Layouts saves personal board camera and outline mode. Graph layouts also retain filters, positions and pins. Limits: 12 layouts per user/workspace, including three graph layouts, up to 250 positions each, and a 180,000-character preference document. Saved / Changed describes the selected personal layout. They do not change colleagues’ layouts. Reset keeps named layouts. Manual graph zoom and semantic center survive window resizing; Fit graph explicitly returns to content fitting. The compact graph legend explains colors and connection directions.

### Interchange

- **Smena JSON** preserves native card fields. Material references contain identities only; current access is checked again.
- **JSON Canvas 1.0** transfers text, frames and connections. It is not an Obsidian vault importer. External paths/URLs become text pointers; attachments are not uploaded. Review lists omitted backgrounds, fixed connection sides, two-ended arrows and unsupported colors. Use Smena JSON to preserve frame text; JSON Canvas transfers its label.
- File limit: 1 MiB. Board limits: 200 cards, 400 connections, 350,000 JSON characters. Integer coordinates ±50,000, width 160–2,000, height 100–2,000. Invalid values are rejected rather than silently truncating text.
- Import adds cards with fresh identities by default. Replacement asks for confirmation, checkpoints the previous board and checks its current server hash. A concurrent change rejects replacement.

## Real-device acceptance — pending

The user currently has no available iPhone/iPad or Android device. Browser emulation cannot verify system keyboard behavior, background suspension, screen locking or actual touch gestures.

For each future device, record model, OS, browser/version, language, viewport/orientation and result. Use a separate test project and disposable notes only.

1. Sign in, refresh and rotate. Confirm session persistence and menu access.
2. Open a deep folder, pin it, search and open the keyboard. Check visible fields/actions, return navigation and stable list position.
3. Open reader properties, edit a disposable field, dismiss the keyboard/properties. Verify reading position and Saved after refresh.
4. Check canvas pan/zoom, multiple selection and Outline, then history, named layout and refresh persistence. Test shortcuts only with a hardware keyboard.
5. Prepare a disposable note for offline reading. Disconnect, open it and make a test edit; reconnect and wait for Saved, then refresh. Do not use team materials for this test.
6. Separately background/lock the device, resume and reconnect. Record delays, errors and duplicate actions. Repeat RU/EN and portrait/landscape.

Acceptance: refreshed data persists, keyboard leaves actions reachable, gestures avoid accidental edits, and resume preserves pending changes. Record unavailable or failed scenarios explicitly.
