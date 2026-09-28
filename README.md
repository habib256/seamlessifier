# Seamlessifier

[**Live demo**](https://habib256.github.io/seamlessifier/) · [Source on GitHub](https://github.com/habib256/seamlessifier)

A zero-install reimplementation of *Puck's Seamlessifier + Ripper* — an all-in-one
tool that **rips textures out of photos taken from any angle** and **makes them
seamless / tileable**, then **packs them into a texture atlas**.

It runs entirely in the browser (HTML5 Canvas + vanilla JS, no build step, no
dependencies). Open `index.html` and go — or use the hosted copy:

**Try it live: [habib256.github.io/seamlessifier](https://habib256.github.io/seamlessifier/)**

## Features

### 1. Ripper — perspective texture extraction
Load a photo of a flat surface shot from any angle, drag the **4 corner handles**
over the surface (order TL → TR → BR → BL), and the ripper computes the
**homography** that maps a clean output rectangle onto that quad, then
inverse-warps the photo with **bicubic** sampling (bilinear optional) into a
fronto-parallel texture.

- Custom output width/height (square lock), or **Suggest size from quad**.
- Live preview that follows the output aspect ratio; a **projective** guide
  grid (true homography, not bilinear lerp) is overlaid on the photo.
- Optional **Lighting fix** flattens large-scale illumination on the photo
  *before* it lands in the library.
- **Rip** adds the result to the shared library.

### 2. Seamlessifier — make it tileable
Four genuinely-seamless methods plus post-processing:

| Method | What it does |
| --- | --- |
| **Smoothed** | Toroidal half-offset blend (`sin²` window, independent X/Y). Always seamless, soft. |
| **Offset + Feather** | Half-offset, then heals the interior cross-seam with a feathered reflection blend. Keeps more detail. |
| **Collage** | Half-offset, then a min-error cut through the cross (scattered seam). Keeps the most structure. |
| **Mirror** | 2×2 mirror, downscaled. Bullet-proof, kaleidoscopic. |

Sliders: **Seam blend X/Y**, **Detail restore** (re-injects high-freq detail away
from the edges), **Match histogram** (pulls the result toward the source colour
distribution without breaking edges), **Contrast**, **Lighting fix** (toroidal
flatten of large-scale illumination so seams stop showing). A **3×3 tiled
preview** lets you check the seams instantly.

### 3. Atlas — pack & export
Select textures, **Pack** them into one image (shelf packer), **Shift+drag** to
reposition tiles, and **Export atlas PNG**. Also export the **selected** or
**all** textures individually.

### Library
- **Drop** images onto the Ripper, Seamless preview, or the library pane.
- **Double-click** a thumbnail name to rename.
- Seamless can **replace** the source texture instead of adding a copy.
- **Undo** (`Z` or `Ctrl`/`⌘Z`): quad edits, add/replace/delete, photo load.
- The library is stored in **IndexedDB** (the live HTTPS site remembers it;
  `file://` often cannot).

## Hotkeys
- `S` — apply Seamless to the active texture (add or replace, per the checkbox)
- `Z` or `Ctrl`/`⌘Z` — undo
- `1` / `2` / `3` — switch to Ripper / Seamless / Atlas
- `Shift+drag` — move (whole quad in Ripper, tile in Atlas)
- **Scroll wheel** (over the Ripper photo) — grow / shrink the selection quad

## Running

- **Online:** [https://habib256.github.io/seamlessifier/](https://habib256.github.io/seamlessifier/)
- **Local:**
```
open index.html          # macOS — or just double-click it
```
Works straight from `file://` in Chrome, Firefox and Safari. GitHub Pages serves
the same files from the `main` branch.

## Project layout
```
index.html        UI shell
css/styles.css    dark studio theme
js/util.js        homography, bilinear/bicubic sampling, wrap-or-clamp blur, math
js/ripper.js      perspective extraction
js/seamless.js    seamless methods + post-processing
js/atlas.js       packing + PNG export
js/app.js         UI glue, library, previews, hotkeys
test/test.js      headless Node tests for the core math
```

## Tests
```
node test/test.js
```
Verifies the homography solver, the ripper round-trip (bilinear and bicubic),
toroidal blur / lighting, and that the seamless output actually tiles (seam
discontinuity reduced to interior-noise levels), including Collage and
histogram matching.

## How it differs from the original
The original is a 47 MB native desktop app. This reimplementation reproduces the
core workflow (rip → seamless → atlas → export) as a portable web app. The
"Smoothed Collage / Scattered Edges" experimental methods are covered by
Smoothed / Offset+Feather / Collage / Mirror above.
