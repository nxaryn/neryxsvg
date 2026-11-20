# SVG Compatibility Notes

NeryxSVG reads and writes plain, standard SVG (via Import SVG / Export
SVG), as well as its own native `.nsvg` project format (see
[project-format.md](./project-format.md), which round-trips more than
plain SVG can). This file is about the plain-SVG path specifically: what
it accepts on import, what it produces on export, and where the two are
deliberately not symmetric.

Source of truth: `js/svg/Sanitizer.js` (import allowlist),
`js/ui/CodeEditor.js` (import conversion), `js/svg/Serializer.js`
(export). If this file and the code disagree, the code is correct.

## Import: what's accepted

Import runs every file through an **allowlist** sanitizer — tags and
attributes both — before anything is converted into this app's document
model. Nothing outside the allowlist is an error; it's silently dropped
(bottom-up, so a disallowed parent's children don't survive as orphans
either), consistent with this app's general policy of not corrupting or
refusing a file over content it can't represent.

**Allowed tags:** `svg`, `g`, `defs`, `symbol`, `use`, `rect`, `circle`,
`ellipse`, `line`, `polygon`, `polyline`, `path`, `text`, `tspan`,
`linearGradient`, `radialGradient`, `stop`, `title`, `desc`.

Notably **not** allowed, and always stripped: `script`, `style` (the
element) and any bare `style="..."` attribute, `image`, `foreignObject`,
`a`, and anything SMIL-animation-related (`animate`, `animateTransform`,
`set`, etc.). This isn't a partial gap to be filled in later — it's a
deliberate security boundary (see the Security section below) as much as
a feature-scope one.

**Allowed attributes** are similarly allowlisted by name (geometry,
`fill`/`stroke` and their opacity/width/cap/join/dasharray, `font-*` and
`text-anchor`/`letter-spacing`, gradient stop attributes, `transform`,
`viewBox`/`width`/`height`, `id`/`class`, `href`/`xlink:href`). Two of
these get an extra **value** check on top of the name check, because an
allowed attribute name can still carry a dangerous value:
`href`/`xlink:href` must be a same-document fragment reference
(`#somewhere`) — no scheme, no absolute/relative URL, no `data:` URI —
and (as of v0.95) `fill`/`stroke` get the same treatment when their value
is a `url(...)` paint-server reference, since that's just as capable of
making the browser fetch an external resource as `href` is. A plain color
value (`#fff`, `red`, `currentColor`, `none`) is untouched either way.

### `<use>` / `<symbol>`

`<use>` is resolved and **inlined** at import time — there's no live
`<use>` reference left in the document model afterward, and no visible
`<symbol>` either (a `<symbol>` only ever manifests wherever something
actually references it; one that's never `<use>`d contributes nothing).
Resolution has both a depth cap and true cycle detection (an id that's
already an ancestor in the current resolution chain is refused, not just
counted) — see `js/ui/CodeEditor.js`'s `convertUse`/`walk` for the
mechanism, and its header comment for a real bug this caught in v1.0 (a
mutually-referencing `<symbol>` pair used to hang the importer with a
stack overflow before that fix).

### `<tspan>`

Allowed by the sanitizer, but not given any special handling by the
importer — a `<text>` element's content is read via `.textContent`, which
flattens any nested `<tspan>`s into a single plain string. The text
itself survives; per-span positioning, styling, or line breaks encoded as
separate `<tspan>` elements do not. This app's text elements are always a
single flat string (see project-format.md) — there's no multi-span text
model to import into.

## Export: conventions

- **Clean by default.** A property still at SVG's own default value is
  **not** emitted as an explicit attribute — `stroke-opacity="1"`,
  `font-weight="normal"`, `letter-spacing="0"`, etc. are all left out
  unless the document actually differs from that default. A document
  that never touches a given control exports exactly as it would have
  before that control existed; this is deliberate and checked by
  `test/text-styling.mjs`'s "exports as cleanly as before" case.
- **Page vs. content.** The exported `viewBox`/`width`/`height` reflect
  either the document's own declared page size (if `autoFitViewBox` is
  `false` — e.g. after importing a file that had an explicit `viewBox`,
  or after using "Fit Page") or the current content's bounds (if
  `autoFitViewBox` is `true` — the default for a new document). See
  project-format.md's note on `settings.autoFitViewBox`.
- **Gradients** export as standard `<linearGradient>`/`<radialGradient>`
  with `<stop>` children, `objectBoundingBox` units (SVG's own default,
  so no explicit `gradientUnits` attribute is needed).

## Known gaps (not round-trip safe)

These aren't bugs to be silently working around — each is either an
explicit scope boundary or a documented limitation:

- **Gradients**: `objectBoundingBox` units only. No `userSpaceOnUse`, no
  `gradientTransform`, no `spreadMethod`. A gradient using any of these,
  imported from elsewhere, will render differently (or be approximated)
  rather than round-tripping exactly.
- **Shear/arbitrary transforms on a single (non-group) shape**: this
  app's shape model represents rotation/flip but not general shear. An
  imported shape whose transform can't be decomposed into that model
  gets wrapped in a synthetic group carrying the leftover transform
  instead — exact, not lossy, but the document structure gains a group
  that wasn't in the source. See `document/Element.js`'s header comment.
- **Everything explicitly out of scope through v1.0** per the project
  roadmap: boolean path operations, masks, clipping, patterns, mesh
  gradients, filters, SMIL animation. None of these import (their tags
  aren't in the allowlist) or export.
- **`<tspan>` structure**, as above — content survives, per-span
  structure doesn't.

## Security

The import allowlist exists as much for safety as for scope — a
maliciously crafted SVG is not a theoretical concern for an importer that
runs arbitrary files a person drags in. `test/sanitizer.mjs` runs it
against a 23-case adversarial matrix (script injection, event-handler
attributes, `javascript:` URLs and an obfuscation variant, external
`<image>`, `<foreignObject>`, CSS-based exfiltration via `<style>` and
bare `style=`, SMIL `onbegin`/`<set>`, mixed-case tag/attribute bypass
attempts, and a DOCTYPE/entity-expansion payload rejected before parsing
even starts) plus a "legitimate content survives untouched" control case.
That matrix is hand-built, not drawn from a published corpus — see
v0.95-status-report.md for that caveat, and treat it as a floor, not a
certification.
