# Knowledge, whiteboards and graph: everyday workflows

Updated for the 31 October 2026 audit implementation. In-app guidance is available under **Settings → Help & resources**.

## Notes

1. Open the arrow next to New note to choose a type or template. The main button creates a regular note.
2. Import TXT/MD using Import notes or drop them into the catalog; review before applying. Library tools contains ZIP, templates, types and the offline library.
3. Type and properties in the reader header edits metadata without opening the full editor and returns to the same reading position.
4. Display → Card details chooses type visibility and up to three fields for each type. Empty values are hidden. This setting is personal and synced within the workspace.
5. On phones, tap the folder name above the catalog. Pin frequent folders, use recent folders and Parent folder. The move dialog retains query and list position when returning.
6. Check the explicit search scope. Switching to the whole library keeps the query. Expand conditions to remove one; all conditions must match (AND). A saved collection indicates when its query has been modified.

## Three different tools

- **Board** groups project tasks by status.
- **Whiteboard** arranges cards, materials and frames in an independent workspace document. Its connectors do not create global material relations.
- **Graph** explores relationships across workspace materials.

Every project view is available from the phone view selector. Desktop tabs reveal the selected view horizontally.

## Whiteboards

Open Whiteboards in the workspace menu. Create a document without a project for workspace collaboration, or choose a project to inherit its access. Existing project boards and old links are preserved. The catalog offers search, grid/list, sort and recoverable archive. On phones, secondary controls are under Filters. Editing retains the original project association to avoid expanding access.

Enable Select cards and tick several cards to align, distribute, copy or remove them. A frame includes cards contained within it. Ctrl/Cmd+A, C, V and Z work when the canvas has focus. Outline is useful for reading and editing on narrow screens.

History loads on demand and requires current whiteboard read access. Up to five previous versions per whiteboard are retained within a shared 700,000-character budget. Restoring keeps the current board as a recovery version. If the board changes during review, reopen history. Local undo retains 12 commands and complements durable history.

Layouts saves personal board camera and outline mode. Graph layouts also retain filters, positions and pins. Limits: 12 layouts per user/workspace, including three graph layouts, up to 250 positions each, and a 180,000-character preference document. They do not change colleagues’ layouts. Reset keeps named layouts. On a different screen size, Graph fits the saved positions to the viewport.

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
