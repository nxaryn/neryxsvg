# Keyboard Shortcuts

This list was compiled directly from the app's own keyboard-handling code
(`js/canvas/Interaction.js`, `js/app/ProjectIO.js`, `js/ui/Layers.js`,
`js/ui/ContextMenu.js`), not written from memory — if a shortcut changes,
this file and the code can drift, so treat a mismatch as a documentation
bug to report, not a hidden feature.

`Ctrl` means `Cmd` on macOS throughout (the app checks `ctrlKey ||
metaKey`).

## File

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open a project (`.nsvg`) or an SVG file |
| `Ctrl+S` | Save the current project (writes back to the open file if one exists; otherwise behaves like Save As) |
| `Ctrl+Shift+S` | Save As — always prompts for a location/file |

Import SVG / Export SVG (plain `.svg`, not the native project format) and
New have toolbar buttons but no dedicated shortcut.

## Edit

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `Ctrl+C` | Copy selection |
| `Ctrl+X` | Cut selection |
| `Ctrl+V` | Paste |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+A` | Select all |
| `Delete` / `Backspace` | Delete selection — or cancel the shape currently being drawn, if one is in progress |
| `Escape` | Cancel the shape being drawn; otherwise exit the active group (if you've double-clicked into one); otherwise clear selection |

## Grouping

| Shortcut | Action |
|---|---|
| `Ctrl+G` | Group selection |
| `Ctrl+Shift+G` | Ungroup selection |

## Tools

Pressing a tool's letter switches to it (not while typing in a text
field). These are single keypresses, no modifier:

| Key | Tool |
|---|---|
| `V` | Select |
| `R` | Rectangle |
| `O` | Rounded Rectangle |
| `C` | Circle |
| `E` | Ellipse |
| `L` | Line |
| `G` | Polygon |
| `Y` | Polyline |
| `P` | Path |
| `T` | Text |

Note `G` here (plain keypress → Polygon tool) is unrelated to `Ctrl+G`
(Group) above — no conflict, since one requires a modifier and the other
doesn't, but worth knowing they share a letter for different reasons.

## While drawing or editing a shape

| Shortcut | Action |
|---|---|
| `Enter` | Finish the current polygon/polyline/path |
| Double-click | Also finishes a polygon/polyline/path in progress |
| `Escape` | Cancel the shape in progress |
| Hold `Shift` while dragging out a rectangle | Constrain to a square |
| Hold `Shift` while dragging out an ellipse | Constrain to a circle |
| Hold `Shift` while dragging a line's endpoint | Snap the angle to the nearest 45° |
| Hold `Shift` while dragging a rotate handle | Snap rotation to the nearest 15° |
| Hold `Alt` while dragging | Temporarily disable snapping (object/edge snap and grid snap) |

## Selection & moving

| Shortcut | Action |
|---|---|
| Arrow keys | Nudge selection by 1 unit |
| `Shift` + Arrow keys | Nudge selection by one grid step |
| `Shift`-click a shape (or a Layers row) | Add/remove it from the selection |
| Double-click a group | Enter it for editing (its children become directly selectable) |
| Double-click a text element | Select it and jump straight into editing its content |
| `Escape` (with a group entered) | Exit the group |

## Canvas navigation

| Shortcut | Action |
|---|---|
| Mouse wheel | Zoom in/out, centered on the cursor |
| `Shift` + mouse wheel | Pan horizontally |
| Middle-click drag, right-click drag, or `Space`+drag | Pan |
| Right-click (no drag) | Open the context menu |

## Layers panel (keyboard-navigable list)

| Shortcut | Action |
|---|---|
| `Tab` into the panel, then `Arrow Up`/`Arrow Down` | Move selection between layers |
| `Home` / `End` | Jump to the first / last layer |

## Context menu (opened via right-click)

| Shortcut | Action |
|---|---|
| `Arrow Up` / `Arrow Down` | Move between menu items (wraps around; skips disabled items) |
| `Home` / `End` | Jump to the first / last item |
| `Escape` | Close the menu and return focus to whatever opened it |

The context menu itself (Cut/Copy/Paste/Duplicate/Delete/Group/Ungroup,
reorder, align, distribute) has no additional shortcuts beyond the Edit
and Grouping ones above — align/distribute are context-menu/toolbar-only
for now.
