# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A zero-dependency, no-build browser app that reimplements *Puck's Seamlessifier + Ripper*:
rip a flat texture out of a photo shot at an angle (perspective correction), make textures
seamless/tileable, and pack them into an atlas. See `README.md` for the user-facing feature list.

**Live site:** https://habib256.github.io/seamlessifier/ (GitHub Pages, `main` branch)
**Repo:** https://github.com/habib256/seamlessifier

## Commands

- **Run the app:** `open index.html` — there is no build step or dev server; it runs straight from `file://`. Same files are served at https://habib256.github.io/seamlessifier/.
- **Run tests:** `node test/test.js` — headless tests of the core math (exit code 0/1, prints `N passed, M failed`).
- **Syntax-check:** `node --check js/*.js`

There is no test framework, linter, or package manager. `test/test.js` is a single script
containing three independent IIFE blocks (homography, ripper round-trip, seamless tiling); to
run a subset, comment out the others. It polyfills `window` + `ImageData` and `vm`-evals the
math modules — so it can only cover canvas-free code paths (the `mirror` seamless method and
anything using `document.createElement('canvas')` cannot be tested here).

## Architecture

### Module/loading convention (do not "modernize" this)
Every `js/*.js` file is an IIFE that attaches its exports to a single global `window.SF`
namespace. They are loaded as **classic `<script>` tags** (not ES modules) in `index.html` —
this is deliberate so the app works over `file://` without a server. **Do not convert to
`import`/`export`.** Load order matters: `util.js` first (others depend on `SF.clamp`,
`SF.lerp`, `SF.newImage`, etc.), then `seamless.js` / `ripper.js` / `atlas.js`, then `app.js` last.

### Data flow
- Image processing passes around `ImageData` (RGBA `Uint8ClampedArray`). `util.js` is the only
  place with the math primitives: homography solve/apply, `sampleBilinear`, `boxBlur`
  (separable, multi-pass ≈ Gaussian), and `imageToCanvas`/`toImageData` bridges.
- The shared **library** (in `app.js` `state.library`) stores each texture as
  `{ id, name, canvas, w, h, selected }` where `canvas` is an offscreen `<canvas>` — convenient
  for thumbnails, atlas drawing, and PNG export. Convert to `ImageData` via `SF.toImageData(t.canvas)`
  only when a pixel operation needs it. `state.activeId` is the last single-selected texture and
  is the implicit source for the Seamless tab and the `S` hotkey.

### Ripper (`js/ripper.js` + ripper section of `app.js`)
`Ripper.rip` iterates **output** pixels, maps each through the homography to a **source** location,
and samples with **bicubic** (Catmull-Rom) by default, or bilinear if passed. The homography maps a
`[0,1]×[0,1]` rectangle (normalized for numerical conditioning) onto the 4 user corners, ordered
**TL, TR, BR, BL**. `Ripper.homography(corners)` is the same matrix the overlay grid uses, so the
guide matches the warp. In `app.js`, corners are stored in source-image pixel coordinates;
canvas/mouse coordinates convert through `ripper.scale` (= canvas bitmap width / image natural width)
and `getBoundingClientRect` to stay correct under any CSS scaling. Optional lighting on rip uses
`SF.flattenLighting(..., wrap=false)` — a photo is not a torus.

### Seamless (`js/seamless.js`)
**The tiling invariant is the whole point:** a result tiles iff its left edge matches its right
and top matches bottom. The `smoothed`/`offset`/`collage` methods are built on a toroidal half-offset
copy plus either a `sin²(πx/W)·sin²(πy/H)` window that is *exactly 0 on every edge*, a feathered
reflection, or a min-error cut eased back to the centre on the outer rows/cols — that edge treatment
is what guarantees seamlessness. Any new method or post-processing step **must preserve edges**: keep
operations either per-pixel, a global LUT (`matchHistogram`), or torus-safe (`SF.boxBlur(..., wrap)`
/ `SF.flattenLighting(..., wrap=true)`). `restoreDetail` re-adds source high-frequency masked by the
same edge-zero window so it can't reintroduce a seam. `Seamless.apply(img, opts)` is the single entry
point; `Seamless.methods` drives the UI dropdown. `lighting` correction runs on a copy *before*
seamlessing and **must** use wrap blur.

### Atlas (`js/atlas.js`) and export
`Atlas.pack` is a shelf/row packer returning placements + a composed canvas; Shift+drag in the UI
mutates placement `x/y` and re-composes via `Atlas.compose`. All PNG export goes through
`Atlas.downloadCanvas` (canvas → blob → `<a download>`).

### app.js wiring notes
Single IIFE, no framework. Tabs toggle `.hidden` on `#panel-*`. Canvas-heavy previews (ripper,
seamless, atlas) are recomputed on a short `setTimeout` debounce and re-fit on window resize and
tab switch. Hotkeys (`S`, `1/2/3`, Shift+drag, wheel) are ignored while focus is in an input/select.
