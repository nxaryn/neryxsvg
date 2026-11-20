# Changelog

Engineering-status detail for each phase lives in the standalone status
reports (`v0.9-status-report.md`, `v0.95-status-report.md` — v1.0's
detail is in this file plus the commit/file history, no separate v1.0
report was produced since this *is* the release). This file is the
short version.

## v1.0 — Release

- **Bug fix**: `<use>`/`<symbol>` cycle resolution during SVG import
  could hang/crash the importer (stack overflow) on a mutually-referencing
  `<symbol>` pair — the old depth counter reset to 0 every time
  resolution passed through a `<g>`/`<symbol>`, so it never actually
  bounded a cycle that went through one. Replaced with real cycle
  detection (an ancestor-id set threaded through the whole resolution
  path, not just direct `<use>`-to-`<use>` chains). Covered by
  `test/use-cycle-import.mjs`.
- **Documentation**: README, user guide, keyboard shortcut reference, SVG
  compatibility notes, and a full `.nsvg` project-format spec — all
  written from the actual code (grepped keybindings, allowlists, schemas)
  rather than from memory. See `docs/`.
- **Release packaging**: `package.json` metadata finalized,
  `package-lock.json` committed for reproducible `npm ci` in CI, this
  changelog.

## v0.95 — Stability (partial — see v0.95-status-report.md)

- Automated test suite (`test/*.mjs`) wired into CI
  (`.github/workflows/test.yml`).
- Performance testing at 100/500/1000/5000-element scale — found and
  fixed a real bug: `ui/Layers.js` was fully rebuilding every row
  (including re-attaching every listener) on every render, not just
  layer-list changes. Fixed with id-keyed node reuse + event delegation
  (mirroring `canvas/Renderer.js`'s existing pattern) plus
  `DocumentFragment` batching for bulk creation.
- Closed the v0.8 text-styling gap: font-weight, font-style, text-anchor,
  letter-spacing — Inspector controls, rendering, clean export, import.
- Sanitizer hardening: external `url(...)` paint-server references in
  `fill`/`stroke` and DOCTYPE/ENTITY payloads, both now rejected; a
  23-case adversarial test matrix (hand-built, not from a published
  corpus).
- Accessibility pass on the Layers panel, context menu, and Inspector:
  ARIA roles/labels, roving-tabindex keyboard navigation, focus
  management.
- Cross-browser: code-reviewed (not run against real browsers) — found
  and fixed an unguarded `navigator.clipboard` call.
- Not done: a real-browser test run; watching the CI workflow actually
  pass in GitHub Actions; a published (rather than hand-built) sanitizer
  test corpus.

## v0.9 — Local-first application (see v0.9-status-report.md)

- IndexedDB-backed autosave with crash recovery (a dismissible banner
  offering to restore unsaved work after an unclean exit).
- File System Access API Open/Save/Save As, with a download/`<input>`-based
  fallback on browsers without it.
- The native `.nsvg` project format.
- PWA packaging: manifest + service worker for offline use.

## v0.8 — Professional editing

- True multi-selection combined transform (resize/rotate several objects
  as one rigid unit).
- 6-way alignment, horizontal/vertical distribution.
- Bring to Front / Send to Back, right-click context menu.
- Stroke controls: opacity, line cap/join, dash pattern/offset.
- Path editing: insert-node, smooth-join toggle, open/close-path, new
  subpath.

## v0.7 — SVG compatibility

- Full elliptical arc (`A`/`a`) support, including compact flag notation.
- Gradients (linear + radial): data model, import, export, Inspector
  editor.
- Allowlist-based import sanitizer (tags and attributes both allowlisted).
- `<use>`/`<symbol>` inlining on import, with recursion guarding.
- Page-vs-content distinction on export (an imported viewBox is
  preserved rather than silently recomputed from content).

## v0.6 — Architecture rewrite

- Rewritten from a single closure-based script into 28 ES modules with a
  real dependency graph.
- Matrix transform engine shared by every transform in the app.
- Groups, with true arbitrary-depth nesting.
- Command-based undo/redo (only affected elements' before/after state,
  not whole-document snapshots).

## v0.5 — Core correctness

- Real bounding-box math (true Bézier/arc extrema, not just control-point
  boxes).
- Pointer Events with pointer capture for reliable drag/pan/resize/rotate.
- Real object/edge snapping (`Alt` to temporarily disable).
- Fixed a text-resize drift bug and a divide-by-zero risk in aspect-locked
  resize.

## v0.4 — Prototype baseline

Working prototype: canvas, shapes, selection, layers, undo/redo, SVG
import/export, in a single ~1,800-line script.
