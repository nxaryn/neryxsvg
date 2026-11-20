# Project Format (`.nsvg`)

`.nsvg` is NeryxSVG's native project format — a JSON file, versioned, that
round-trips everything the editor's own model can represent (unlike plain
`.svg` export, which is standard SVG and necessarily loses anything this
app can express that SVG can't as cleanly — see
[svg-compatibility.md](./svg-compatibility.md)).

Source of truth: `js/document/Project.js` (the envelope) and
`js/document/Document.js`/`js/document/Element.js` (what it wraps). This
file describes that code; if they disagree, the code is correct and this
file is stale.

## Envelope

```json
{
  "format": "nsvg",
  "projectVersion": 1,
  "savedAt": "2026-09-27T12:00:00.000Z",
  "document": { "...": "see Document below" },
  "view": { "x": 0, "y": 0, "zoom": 1 },
  "gridVisible": true,
  "snap": true
}
```

- `format` — always the literal string `"nsvg"`. A file missing this, or
  with a different value, is rejected as "not a NeryxSVG project" without
  attempting to read further.
- `projectVersion` — the **envelope's** version, tracked separately from
  the document's own `version` field below. They can evolve
  independently — a future envelope version might add multiple documents
  per file, or app-level settings, without needing to touch the document
  schema at all. A file whose `projectVersion` is newer than the running
  app understands is rejected with an explicit "saved by a newer version"
  error rather than guessed at.
- `savedAt` — ISO 8601 timestamp, informational only (not read back for
  anything besides display).
- `document` — required. The full document object (below).
- `view`, `gridVisible`, `snap` — all optional. Convenience state
  (current pan/zoom, whether the grid/snap toggles were on) restored on
  open if present; a file that omits them still opens fine with default
  view state.

## Document

```json
{
  "id": "doc-abc123",
  "version": 1,
  "name": "Untitled",
  "width": 800,
  "height": 600,
  "viewBox": { "x": 0, "y": 0, "width": 800, "height": 600 },
  "elements": [ "...": "flat array, see Elements below" ],
  "defs": [ "...": "gradients, see Defs below" ],
  "metadata": {},
  "settings": { "gridSize": 10, "autoFitViewBox": true }
}
```

- `version` — the document schema's own version (currently `1`), guarded
  by `migrateDocument()` in `document/Document.js` the same way the
  envelope's `projectVersion` is guarded — a document from a newer schema
  version is rejected, never silently misread.
- `elements` — a **flat array**, not a nested tree. Parent/child
  relationships (including group membership) are expressed by each
  element's `parentId` pointing at another element's `id`, not by JSON
  nesting. This is deliberate (see `document/Groups.js`) — it's what
  makes arbitrary-depth nesting, reordering, and the command-based
  undo/redo system tractable without deep-cloning subtrees.
- `defs` — gradients only, as of v1.0 (see Gradients below). Not a
  general-purpose defs bucket.
- `settings.autoFitViewBox` — when `true` (fresh documents), export
  recomputes the page/viewBox from current content every time. Import
  sets this to `false` whenever the source SVG declared an explicit
  `viewBox`, so re-exporting an imported file doesn't silently produce a
  different page size than the one it came in with. "Fit Page" also sets
  it to `false` after a one-time snap-to-content.

## Elements

Every element (except `group`) shares this shape:

```json
{
  "id": "el-xyz789",
  "type": "rect",
  "name": null,
  "parentId": null,
  "attrs": { "...": "per-type, see table below" },
  "style": { "...": "see Style below" },
  "rotation": 0,
  "flipX": false,
  "flipY": false,
  "visible": true,
  "locked": false
}
```

A `group` element is a distinct shape — no `attrs`/`style`
(`style: null`), and a `transform` (a 2×3 matrix — see
`utils/Matrix.js`) instead of the `rotation`/`flipX`/`flipY` triple:

```json
{ "id": "grp-1", "type": "group", "name": null, "parentId": null,
  "transform": [1,0,0,1,0,0], "visible": true, "locked": false }
```

This split is deliberate, not an inconsistency: an ordinary shape uses
the live-pivoted rotation/flip model (needed for correct drag behavior
while rotated), while a group needs a fully general, freely-composable
matrix — both share the same underlying `Matrix` library. See
`document/Element.js`'s header comment for the full rationale.

### `attrs` by type

| `type` | `attrs` fields |
|---|---|
| `rect` | `x, y, width, height` |
| `rrect` | `x, y, width, height, rx, ry` |
| `circle` | `cx, cy, r` |
| `ellipse` | `cx, cy, rx, ry` |
| `line` | `x1, y1, x2, y2` |
| `polygon` / `polyline` | `points: [{x,y}, ...]` |
| `path` | `commands: [{type, x, y, ...}, ...]` — one entry per path command (`M`/`L`/`H`/`V`/`C`/`S`/`Q`/`T`/`A`/`Z`), fields vary by command type; see `svg/PathParser.js` |
| `text` | `x, y, fontSize, fontFamily, content`, plus (v0.95+) `fontWeight, fontStyle, textAnchor, letterSpacing` — all four optional, falling back to SVG's own defaults (`normal`/`normal`/`start`/`0`) when absent |
| `raw` | `html` — sanitized markup for anything imported that has no shape mapping yet; see `svg/Sanitizer.js` |

### `style`

```json
{
  "fill": "#4fd1c5", "stroke": "#0b0d10", "strokeWidth": 1.5,
  "fillOpacity": 0.85, "strokeOpacity": 1,
  "strokeLinecap": "butt", "strokeLinejoin": "miter",
  "strokeDasharray": "", "strokeDashoffset": 0
}
```

`fill`/`stroke` are either a color string or `"url(#gradientId)"`
referencing an entry in the document's `defs`.

## Gradients (`defs`)

```json
{ "id": "grad-1", "kind": "linear", "x1": 0, "y1": 0, "x2": 1, "y2": 0,
  "stops": [ { "offset": 0, "color": "#000000", "opacity": 1 } ] }
```

`kind` is `"linear"` (`x1,y1,x2,y2`) or `"radial"` (`cx,cy,r`), all in
`objectBoundingBox` units (0–1) — `userSpaceOnUse`, `gradientTransform`,
and `spreadMethod` aren't represented, matching plain-SVG export/import's
own gradient limitations (see svg-compatibility.md).

## Versioning & compatibility

Two independent version numbers, both enforced the same way (reject
outright rather than guess):

- `projectVersion` (envelope) — currently `1`.
- `document.version` (document schema) — currently `1`.

A file from a **newer** app version than the one opening it is rejected
with an explicit error naming both versions. A file from an **older**
version opens normally — `migrateDocument()` is where a future version
bump would add real migration steps; there's nothing to migrate yet since
only one document version has ever existed.

## Where to look in the code

- `js/document/Project.js` — the envelope: `serializeProject()` /
  `parseProject()`.
- `js/document/Document.js` — `createDocument()`, `migrateDocument()`.
- `js/document/Element.js` — `createElement()`, `createGroup()`,
  `defaultStyle()`, and the bounds/geometry helpers.
- `js/document/Gradients.js` — gradient shape and helpers.
- `js/app/ProjectIO.js` / `js/app/Autosave.js` — where this format
  actually gets read and written (Open/Save/Save As, autosave).
