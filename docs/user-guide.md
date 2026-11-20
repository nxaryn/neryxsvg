# User Guide

NeryxSVG is a local-first, browser-native SVG editor: draw, edit, and
fine-tune vector graphics visually, with an always-in-sync SVG source
view, and export clean, standard SVG. No backend, no account, nothing
leaves your browser except the files you explicitly Open/Save/Export or
Import/Export. See [keyboard-shortcuts.md](./keyboard-shortcuts.md) for
every shortcut mentioned below, and [project-format.md](./project-format.md)
/ [svg-compatibility.md](./svg-compatibility.md) for what the file formats
can and can't represent.

## Layout

- **Top bar** — project operations (Open/Save/Save As, New, Import SVG/
  Export SVG, Fit Page), undo/redo, zoom controls, grid/snap toggles and
  grid spacing, Group/Ungroup, Duplicate/Delete.
- **Left tool palette** — the drawing tools (Select, Rectangle, Rounded
  Rectangle, Circle, Ellipse, Line, Polygon, Polyline, Path, Text).
- **Canvas**, with rulers along the top and left edges and a live
  coordinate readout in the corner.
- **Right panel** — **Layers** (every element in the document, click or
  arrow-key to select, buttons per row to toggle visibility/lock,
  reorder, or delete) above **Inspector** (every property of whatever's
  currently selected — geometry, fill/stroke, transform, and — for text —
  font controls).
- **Bottom panel** ("SVG Source", collapsible) — the live, editable SVG
  markup for the current selection (or the whole document, with nothing
  selected). This is genuinely bidirectional: edit the markup by hand and
  it re-imports on blur, exactly like re-importing a file.

## Drawing

Pick a tool (click it, or its letter key — see
keyboard-shortcuts.md#tools) and drag on the canvas. A few tools have
special interaction:

- **Rectangle / Rounded Rectangle / Ellipse**: drag from corner to
  corner. Hold `Shift` while dragging to constrain a rectangle to a
  square or an ellipse to a circle.
- **Circle**: drag from center outward.
- **Line**: drag from one endpoint to the other. Hold `Shift` to snap the
  angle to the nearest 45°.
- **Polygon / Polyline**: click to place each point; `Enter` or a
  double-click finishes it (a polygon closes automatically).
- **Path**: click to place points; a dropdown next to the canvas (visible
  while drawing) picks what kind of segment the *next* click adds (line,
  horizontal/vertical, cubic/quadratic Bézier, smooth cubic). "Close" or
  "Finish" buttons — or `Enter`/`Escape` — end it.
- **Text**: click to place, then type directly into the Inspector's
  Content field (it's focused automatically). Double-clicking an
  existing text element jumps straight back into editing its content.

`Escape` cancels whatever's currently being drawn.

## Selecting & transforming

Click a shape (or its Layers row) to select it; `Shift`-click to add or
remove from the selection; drag a rubber-band on empty canvas to
select everything it touches. A selection gets resize handles (corners +
edges) and a rotate handle. Multiple selected objects resize/rotate
together as one rigid unit around their shared bounding box — this is
exact for unrotated shapes and groups, and a documented, non-corrupting
approximation for a rotated shape caught in a multi-resize (this app's
shape model can't represent shear on a single shape — see
svg-compatibility.md).

Hold `Alt` while dragging to temporarily disable snapping (both grid
snap and object/edge snap to other shapes). Hold `Shift` while dragging a
rotate handle to snap to 15° increments.

**Groups**: select multiple objects and Group (`Ctrl+G`). Double-click a
group to enter it — its children become directly selectable/editable,
and `Escape` exits back out. Groups nest to arbitrary depth. Ungroup
(`Ctrl+Shift+G`) dissolves a group back into its direct children.

**Right-click** opens a context menu: Cut/Copy/Paste/Duplicate/Delete,
Group/Ungroup, Bring to Front/Send to Back and step reordering, and (with
multiple objects selected) align (6-way) and distribute
(horizontal/vertical). The menu is fully keyboard-navigable once open —
see keyboard-shortcuts.md#context-menu-opened-via-right-click.

## Styling

The Inspector's Fill and Stroke sections cover color (solid or
gradient — switch via the Fill Type dropdown; a gradient gets an
Inspector stop-list editor, not on-canvas handles), opacity, stroke
width, line cap/join, and dash pattern/offset. Text elements additionally
get font family/size/weight/style, alignment (text-anchor), and
letter-spacing.

## Path editing

Select an existing path with the Select tool to edit its nodes directly:
drag a node to move it, use the Inspector's per-node numeric fields for
precise values, insert a node mid-segment, toggle a join to smooth or
sharp, open/close the path, or start a new subpath. Multiple subpaths in
one path element are fully supported; node selection is currently
one-at-a-time (no shift-click multi-node selection yet).

## Saving, opening, and importing

- **Save / Save As / Open** (`Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O`) work
  with the native `.nsvg` project format — the only format that round-trips
  everything this editor can represent. Where your browser supports the
  File System Access API (Chromium-based browsers), Save writes back to
  the same file silently after the first Save As; where it doesn't
  (Firefox, Safari), Save behaves like Save As every time — there's no
  browser API for writing back to an arbitrary file on disk there.
- **Import SVG / Export SVG** work with plain, standard `.svg` files —
  useful for bringing in artwork from elsewhere or handing your work to
  another tool, but not fully lossless in both directions; see
  svg-compatibility.md for exactly what doesn't round-trip.
- **The document never silently disappears.** The app autosaves to your
  browser's local storage a moment after any change. If a session ends
  without a clean close (a crash, a force-quit), the next time you open
  the app it'll offer to restore that autosaved work — you choose Restore
  or Discard, nothing is applied automatically. Autosave is separate from
  and doesn't affect explicit Save/Save As.

## Working offline

The app can be installed as a standalone PWA (your browser will offer an
"Install" option) and works fully offline once its files have been
cached by your browser once while online. Offline status has no separate
indicator in the UI beyond things simply continuing to work — autosave
and everything else keep functioning without a connection, since nothing
about editing or saving a document ever requires one.
