/*
 * Headless tests for the core math. Polyfills the few browser globals the
 * pure-math code paths touch (window + ImageData), loads the modules, and
 * checks: homography solve, ripper round-trip, and real seamless tiling.
 *
 *   node test/test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// --- minimal browser polyfills ----------------------------------------
class ImageData {
  constructor(a, b, c) {
    if (typeof a === "number") { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.data = a; this.width = b; this.height = c; }
  }
}
const sandbox = { window: {}, ImageData, Math, console, Uint8ClampedArray, Float32Array, isFinite };
sandbox.window.SF = {};
vm.createContext(sandbox);

["util.js", "ripper.js", "seamless.js"].forEach(f => {
  const code = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
  vm.runInContext(code, sandbox, { filename: f });
});
const SF = sandbox.window.SF;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ` (got ${a.toFixed(3)}, want ~${b}, tol ${tol})`); }

// ---------------------------------------------------------------- 1. homography
(function () {
  const from = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const to = [[10, 12], [90, 20], [82, 95], [18, 80]];
  const H = SF.computeHomography(from, to);
  for (let i = 0; i < 4; i++) {
    const p = SF.applyHomography(H, from[i][0], from[i][1]);
    approx(p[0], to[i][0], 1e-6, "homography maps corner " + i + " x");
    approx(p[1], to[i][1], 1e-6, "homography maps corner " + i + " y");
  }
})();

// --------------------------------------------------------------- 2. ripper round-trip
(function () {
  // source where pixel colour encodes its coordinates
  const W = 100, H = 100;
  const src = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    src.data[i] = x * 2; src.data[i + 1] = y * 2; src.data[i + 2] = 128; src.data[i + 3] = 255;
  }
  function at(img, x, y, c) { return img.data[(y * img.width + x) * 4 + c]; }

  // integer bicubic sample is the pixel itself (Catmull-Rom at t=0 returns p1)
  const px = [0, 0, 0, 0];
  SF.sampleBicubic(src, 20, 80, px);
  approx(px[0], 40, 0.51, "bicubic integer sample R");
  approx(px[1], 160, 0.51, "bicubic integer sample G");

  ["bilinear", "bicubic"].forEach(kind => {
    const sample = kind === "bilinear" ? SF.sampleBilinear : SF.sampleBicubic;
    const corners = [[0, 0], [W, 0], [W, H], [0, H]];
    const out = SF.Ripper.rip(src, corners, W, H, sample);
    approx(at(out, 50, 50, 0), at(src, 50, 50, 0), 3, `ripper ${kind} identity centre R`);
    approx(at(out, 50, 50, 1), at(src, 50, 50, 1), 3, `ripper ${kind} identity centre G`);
    approx(at(out, 20, 80, 0), 20 * 2, 3, `ripper ${kind} identity sample R encodes x`);
    approx(at(out, 20, 80, 1), 80 * 2, 3, `ripper ${kind} identity sample G encodes y`);
  });

  // default sampler is bicubic
  const skew = [[10, 8], [88, 18], [80, 92], [16, 78]];
  const out2 = SF.Ripper.rip(src, skew, 64, 64);
  let okRange = true;
  for (let k = 0; k < out2.data.length; k++) if (out2.data[k] < 0 || out2.data[k] > 255) okRange = false;
  ok(okRange, "ripper skewed bicubic output in range");
  ok(out2.width === 64 && out2.height === 64, "ripper output size honoured");

  const Hgrid = SF.Ripper.homography(skew);
  const mapped = SF.applyHomography(Hgrid, 0, 0);
  approx(mapped[0], skew[0][0], 1e-6, "Ripper.homography maps UV origin to TL x");
  approx(mapped[1], skew[0][1], 1e-6, "Ripper.homography maps UV origin to TL y");
})();

// --------------------------------------------------------------- 2b. wrap vs clamp blur
(function () {
  const W = 16, H = 16;
  const src = new ImageData(W, H);
  src.data[0] = 255; src.data[1] = 255; src.data[2] = 255; src.data[3] = 255;
  function lum(img, x, y) { return img.data[(y * img.width + x) * 4]; }
  const wrapped = SF.boxBlur(src, 1, 1, true);
  const clamped = SF.boxBlur(src, 1, 1, false);
  ok(lum(wrapped, W - 1, 0) > 1, "wrap blur leaks across left/right");
  ok(lum(wrapped, 0, H - 1) > 1, "wrap blur leaks across top/bottom");
  ok(lum(clamped, W - 1, 0) < 1, "clamp blur does not wrap horizontally");
  ok(lum(clamped, 0, H - 1) < 1, "clamp blur does not wrap vertically");

  // lighting on an already-tiling image: wrap keeps edges matched, clamp does not
  const ramp = new ImageData(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const v = 40 + 6 * x + 6 * y;
    ramp.data[i] = ramp.data[i + 1] = ramp.data[i + 2] = v; ramp.data[i + 3] = 255;
  }
  const tiled = SF.Seamless.apply(ramp, { method: "smoothed", blend: 0.5, detail: 0, lighting: 0, match: 0 });
  function seamE(img) {
    const w = img.width, h = img.height, d = img.data;
    let s = 0;
    for (let y = 0; y < h; y++) {
      s += Math.abs(d[(y * w) * 4] - d[(y * w + w - 1) * 4]);
      s += Math.abs(d[y * 4] - d[((h - 1) * w + y) * 4]);
    }
    return s / (2 * h);
  }
  const wrapLit = SF.flattenLighting(SF.cloneImage(tiled), 1, true);
  const clampLit = SF.flattenLighting(SF.cloneImage(tiled), 1, false);
  ok(seamE(wrapLit) < 4, "wrap lighting preserves a tile (seam " + seamE(wrapLit).toFixed(2) + ")");
  ok(seamE(clampLit) > seamE(wrapLit) + 1, "clamp lighting splits a tile's edges (wrap " + seamE(wrapLit).toFixed(2) + " vs clamp " + seamE(clampLit).toFixed(2) + ")");
})();

// --------------------------------------------------------------- 3. seamless tiling
(function () {
  // Continuous-ish texture with a strong ramp across X and Y so the RAW edges
  // mismatch badly. A correct seamless result removes that mismatch.
  const W = 64, H = 64;
  const src = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const base = 90
      + 25 * Math.sin(2 * Math.PI * x / W * 2.0)
      + 25 * Math.sin(2 * Math.PI * y / H * 2.0)
      + 110 * (x / W)   // horizontal ramp -> left/right edges differ a lot
      + 110 * (y / H);  // vertical ramp   -> top/bottom edges differ a lot
    const v = Math.max(0, Math.min(255, base));
    src.data[i] = v; src.data[i + 1] = v; src.data[i + 2] = v; src.data[i + 3] = 255;
  }

  function seamEnergy(img) {
    const w = img.width, h = img.height, d = img.data;
    let s = 0;
    for (let y = 0; y < h; y++) {
      const l = (y * w + 0) * 4, r = (y * w + (w - 1)) * 4;
      s += Math.abs(d[l] - d[r]);
      const t = (0 * w + y) * 4, b = ((h - 1) * w + y) * 4;
      s += Math.abs(d[t] - d[b]);
    }
    return s / (2 * h);
  }
  function interiorEnergy(img) {
    const w = img.width, h = img.height, d = img.data;
    let s = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) {
      s += Math.abs(d[(y * w + x) * 4] - d[(y * w + x - 1) * 4]); n++;
    }
    return s / n;
  }

  const rawSeam = seamEnergy(src);
  const interior = interiorEnergy(src);
  ok(rawSeam > interior * 5, "raw texture has an obvious seam (raw " + rawSeam.toFixed(1) + " >> interior " + interior.toFixed(1) + ")");

  ["smoothed", "offset", "collage"].forEach(method => {
    const out = SF.Seamless.apply(src, { method, blend: 0.5, detail: 0.4, contrast: 0, lighting: 0 });
    const seam = seamEnergy(out);
    const inter = interiorEnergy(out);
    // After seamlessing, the seam should be no worse than ~3x interior noise
    // and dramatically smaller than the raw seam.
    ok(seam < inter * 3 + 4, `[${method}] seam reduced to interior level (seam ${seam.toFixed(2)}, interior ${inter.toFixed(2)})`);
    ok(seam < rawSeam * 0.25, `[${method}] seam << raw seam (${seam.toFixed(2)} vs ${rawSeam.toFixed(1)})`);
  });

  const collage = SF.Seamless.apply(src, { method: "collage", blend: 0.5, detail: 0, lighting: 0 });
  const feathered = SF.Seamless.apply(src, { method: "offset", blend: 0.5, detail: 0, lighting: 0 });
  let cutDiff = 0;
  for (let i = 0; i < collage.data.length; i += 4) cutDiff += Math.abs(collage.data[i] - feathered.data[i]);
  ok(cutDiff > 50, "collage min-cut is not the same as offset feather (diff " + cutDiff + ")");

  const lit = SF.Seamless.apply(src, { method: "smoothed", blend: 0.5, detail: 0.4, lighting: 0.8, match: 0.6, blendX: 0.3, blendY: 0.7 });
  const litSeam = seamEnergy(lit);
  ok(litSeam < rawSeam * 0.25, "lighting+histogram+aniso blend still tiles (seam " + litSeam.toFixed(2) + ")");
})();

// ---------------------------------------------------------------- summary
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
