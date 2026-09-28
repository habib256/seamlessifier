/*
 * seamless.js — make a texture tileable.
 *
 * All methods take an ImageData and return a NEW ImageData of the same size
 * that tiles seamlessly (left edge matches right, top matches bottom).
 *
 * Methods:
 *   smoothed  — toroidal half-offset blend. Always seamless, soft.
 *   offset    — half-offset, then heal the interior cross seam by a feathered
 *               reflection blend. Keeps more detail.
 *   collage   — half-offset, then a min-error cut through the cross (scattered
 *               seam). Keeps the most structure; still edge-zero.
 *   mirror    — 2x2 mirror, downscaled. Kaleidoscopic but bullet-proof.
 *
 * Post-process options (applied to every method): seam blend width (X/Y),
 * detail restoration, histogram match, contrast enhancement, lighting
 * (illumination) correction.
 */
(function (SF) {
  "use strict";

  var Seamless = {};

  function axisBlend(opts) {
    var b = opts.blend == null ? 0.5 : opts.blend;
    return {
      x: opts.blendX == null ? b : opts.blendX,
      y: opts.blendY == null ? b : opts.blendY
    };
  }

  // Half-offset copy on the torus: O(x,y) = src((x+W/2)%W, (y+H/2)%H).
  function halfOffset(img) {
    var w = img.width, h = img.height;
    var ox = (w / 2) | 0, oy = (h / 2) | 0;
    var out = SF.newImage(w, h);
    var s = img.data, o = out.data;
    for (var y = 0; y < h; y++) {
      var sy = (y + oy) % h;
      for (var x = 0; x < w; x++) {
        var sx = (x + ox) % w;
        var si = (sy * w + sx) * 4, oi = (y * w + x) * 4;
        o[oi] = s[si]; o[oi + 1] = s[si + 1]; o[oi + 2] = s[si + 2]; o[oi + 3] = 255;
      }
    }
    return out;
  }

  function bandWidth(blend, dim) {
    return Math.max(2, Math.round(SF.lerp(0.04, 0.42, blend) * dim * 0.5));
  }

  // -- SMOOTHED -----------------------------------------------------------
  // out = (1-m)*O + m*src, with m = sin²(πx/W)^px * sin²(πy/H)^py.
  // m is exactly 0 on every edge => result always tiles. px/py (from blend
  // X/Y) control how much of the original (sharp, but seam-prone) detail shows
  // on each axis.
  Seamless.smoothed = function (img, opts) {
    var w = img.width, h = img.height;
    var O = halfOffset(img);
    var out = SF.newImage(w, h);
    var s = img.data, o = O.data, r = out.data;
    var ax = axisBlend(opts);
    var px = SF.lerp(0.45, 2.6, ax.x);
    var py = SF.lerp(0.45, 2.6, ax.y);
    var sinx = new Float32Array(w), siny = new Float32Array(h);
    for (var x = 0; x < w; x++) { var sx = Math.sin(Math.PI * (x + 0.5) / w); sinx[x] = sx * sx; }
    for (var y = 0; y < h; y++) { var sy = Math.sin(Math.PI * (y + 0.5) / h); siny[y] = sy * sy; }
    for (var yy = 0; yy < h; yy++) {
      var my = Math.pow(siny[yy], py);
      for (var xx = 0; xx < w; xx++) {
        var m = Math.pow(sinx[xx], px) * my;
        var i = (yy * w + xx) * 4;
        r[i] = SF.lerp(o[i], s[i], m);
        r[i + 1] = SF.lerp(o[i + 1], s[i + 1], m);
        r[i + 2] = SF.lerp(o[i + 2], s[i + 2], m);
        r[i + 3] = 255;
      }
    }
    return out;
  };

  // -- OFFSET + FEATHER ---------------------------------------------------
  // Start from the half-offset O (which already tiles, but has a visible
  // cross seam through the middle). Heal the cross by blending O toward a
  // reflection of itself about the seam lines, inside a feather band.
  // The reflection is symmetric about the seam, so the blended result is
  // continuous across it. Outer edges are untouched => tiling preserved.
  Seamless.offset = function (img, opts) {
    var w = img.width, h = img.height;
    var O = halfOffset(img);
    var d = O.data;
    var cx = (w / 2) | 0, cy = (h / 2) | 0;
    var ax = axisBlend(opts);
    var bandX = bandWidth(ax.x, Math.min(w, h));
    var bandY = bandWidth(ax.y, Math.min(w, h));

    var pass1 = SF.cloneImage(O), p1 = pass1.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dist = Math.abs(x - cx);
        if (dist >= bandX) continue;
        var rx = SF.clamp(2 * cx - x, 0, w - 1);
        var t = 0.5 * (1 - SF.smoothstep(dist / bandX));
        var i = (y * w + x) * 4, j = (y * w + rx) * 4;
        p1[i] = SF.lerp(d[i], d[j], t);
        p1[i + 1] = SF.lerp(d[i + 1], d[j + 1], t);
        p1[i + 2] = SF.lerp(d[i + 2], d[j + 2], t);
      }
    }
    var out = SF.cloneImage(pass1), r = out.data, q = pass1.data;
    for (var x2 = 0; x2 < w; x2++) {
      for (var y2 = 0; y2 < h; y2++) {
        var dy = Math.abs(y2 - cy);
        if (dy >= bandY) continue;
        var ry = SF.clamp(2 * cy - y2, 0, h - 1);
        var t2 = 0.5 * (1 - SF.smoothstep(dy / bandY));
        var i2 = (y2 * w + x2) * 4, j2 = (ry * w + x2) * 4;
        r[i2] = SF.lerp(q[i2], q[j2], t2);
        r[i2 + 1] = SF.lerp(q[i2 + 1], q[j2 + 1], t2);
        r[i2 + 2] = SF.lerp(q[i2 + 2], q[j2 + 2], t2);
      }
    }
    return out;
  };

  // -- COLLAGE (min-error cut) --------------------------------------------
  // Same half-offset start as `offset`, but the interior cross is healed by
  // a dynamic-programming min-error path (image quilting) instead of a
  // straight feather. The path is eased back to the centre on the outer
  // rows/cols so left/right and top/bottom edges stay equal (tiling).
  function minCutHealV(img, cx, band) {
    var w = img.width, h = img.height, d = img.data;
    var xMin = Math.max(1, cx - band);
    var xMax = Math.min(w - 2, cx + band);
    var n = xMax - xMin + 1;
    if (n < 3) return;
    var err = new Float32Array(h * n);
    var y, i, x, xr, ia, ib, dr, dg, db;
    for (y = 0; y < h; y++) {
      for (i = 0; i < n; i++) {
        x = xMin + i;
        xr = SF.clamp(2 * cx - x, 0, w - 1);
        ia = (y * w + x) * 4; ib = (y * w + xr) * 4;
        dr = d[ia] - d[ib]; dg = d[ia + 1] - d[ib + 1]; db = d[ia + 2] - d[ib + 2];
        err[y * n + i] = dr * dr + dg * dg + db * db;
      }
    }
    var cost = new Float32Array(h * n);
    var pred = new Int8Array(h * n);
    for (i = 0; i < n; i++) cost[i] = err[i];
    for (y = 1; y < h; y++) {
      for (i = 0; i < n; i++) {
        var best = cost[(y - 1) * n + i], from = 0;
        if (i > 0 && cost[(y - 1) * n + i - 1] < best) { best = cost[(y - 1) * n + i - 1]; from = -1; }
        if (i < n - 1 && cost[(y - 1) * n + i + 1] < best) { best = cost[(y - 1) * n + i + 1]; from = 1; }
        cost[y * n + i] = err[y * n + i] + best;
        pred[y * n + i] = from;
      }
    }
    var col = 0;
    for (i = 1; i < n; i++) if (cost[(h - 1) * n + i] < cost[(h - 1) * n + col]) col = i;
    var path = new Int16Array(h);
    for (y = h - 1; y >= 0; y--) {
      path[y] = xMin + col;
      if (y) col = SF.clamp(col + pred[y * n + col], 0, n - 1);
    }
    var fade = Math.max(4, (band / 2) | 0);
    for (y = 0; y < h; y++) {
      var e = Math.min(y, h - 1 - y) / fade;
      path[y] = Math.round(SF.lerp(cx, path[y], SF.smoothstep(e)));
    }
    var src = new Uint8ClampedArray(d);
    var feather = Math.max(1, (band / 8) | 0);
    for (y = 0; y < h; y++) {
      var cut = path[y];
      for (x = xMin; x <= xMax; x++) {
        xr = SF.clamp(2 * cx - x, 0, w - 1);
        var u = (x - cut) / feather;
        var t = SF.smoothstep((u + 1) / 2);
        var ii = (y * w + x) * 4, jj = (y * w + xr) * 4;
        d[ii] = SF.lerp(src[ii], src[jj], t);
        d[ii + 1] = SF.lerp(src[ii + 1], src[jj + 1], t);
        d[ii + 2] = SF.lerp(src[ii + 2], src[jj + 2], t);
      }
    }
  }

  function minCutHealH(img, cy, band) {
    var w = img.width, h = img.height, d = img.data;
    var yMin = Math.max(1, cy - band);
    var yMax = Math.min(h - 2, cy + band);
    var n = yMax - yMin + 1;
    if (n < 3) return;
    var err = new Float32Array(w * n);
    var x, i, y, yr, ia, ib, dr, dg, db;
    for (x = 0; x < w; x++) {
      for (i = 0; i < n; i++) {
        y = yMin + i;
        yr = SF.clamp(2 * cy - y, 0, h - 1);
        ia = (y * w + x) * 4; ib = (yr * w + x) * 4;
        dr = d[ia] - d[ib]; dg = d[ia + 1] - d[ib + 1]; db = d[ia + 2] - d[ib + 2];
        err[x * n + i] = dr * dr + dg * dg + db * db;
      }
    }
    var cost = new Float32Array(w * n);
    var pred = new Int8Array(w * n);
    for (i = 0; i < n; i++) cost[i] = err[i];
    for (x = 1; x < w; x++) {
      for (i = 0; i < n; i++) {
        var best = cost[(x - 1) * n + i], from = 0;
        if (i > 0 && cost[(x - 1) * n + i - 1] < best) { best = cost[(x - 1) * n + i - 1]; from = -1; }
        if (i < n - 1 && cost[(x - 1) * n + i + 1] < best) { best = cost[(x - 1) * n + i + 1]; from = 1; }
        cost[x * n + i] = err[x * n + i] + best;
        pred[x * n + i] = from;
      }
    }
    var row = 0;
    for (i = 1; i < n; i++) if (cost[(w - 1) * n + i] < cost[(w - 1) * n + row]) row = i;
    var path = new Int16Array(w);
    for (x = w - 1; x >= 0; x--) {
      path[x] = yMin + row;
      if (x) row = SF.clamp(row + pred[x * n + row], 0, n - 1);
    }
    var fade = Math.max(4, (band / 2) | 0);
    for (x = 0; x < w; x++) {
      var e = Math.min(x, w - 1 - x) / fade;
      path[x] = Math.round(SF.lerp(cy, path[x], SF.smoothstep(e)));
    }
    var src = new Uint8ClampedArray(d);
    var feather = Math.max(1, (band / 8) | 0);
    for (x = 0; x < w; x++) {
      var cut = path[x];
      for (y = yMin; y <= yMax; y++) {
        yr = SF.clamp(2 * cy - y, 0, h - 1);
        var u = (y - cut) / feather;
        var t = SF.smoothstep((u + 1) / 2);
        var ii = (y * w + x) * 4, jj = (yr * w + x) * 4;
        d[ii] = SF.lerp(src[ii], src[jj], t);
        d[ii + 1] = SF.lerp(src[ii + 1], src[jj + 1], t);
        d[ii + 2] = SF.lerp(src[ii + 2], src[jj + 2], t);
      }
    }
  }

  Seamless.collage = function (img, opts) {
    var w = img.width, h = img.height;
    var O = halfOffset(img);
    var ax = axisBlend(opts);
    var bandX = bandWidth(ax.x, Math.min(w, h));
    var bandY = bandWidth(ax.y, Math.min(w, h));
    minCutHealV(O, (w / 2) | 0, bandX);
    minCutHealH(O, (h / 2) | 0, bandY);
    return O;
  };

  // -- MIRROR -------------------------------------------------------------
  // Build a 2x2 mirror tile (which is inherently seamless) and downscale it
  // back to the original size.
  Seamless.mirror = function (img, opts) {
    var w = img.width, h = img.height;
    var src = SF.imageToCanvas(img);
    var big = document.createElement("canvas");
    big.width = w * 2; big.height = h * 2;
    var bg = big.getContext("2d");
    bg.drawImage(src, 0, 0);
    bg.save(); bg.translate(w * 2, 0); bg.scale(-1, 1); bg.drawImage(src, 0, 0); bg.restore();
    bg.save(); bg.translate(0, h * 2); bg.scale(1, -1); bg.drawImage(src, 0, 0); bg.restore();
    bg.save(); bg.translate(w * 2, h * 2); bg.scale(-1, -1); bg.drawImage(src, 0, 0); bg.restore();
    var small = document.createElement("canvas");
    small.width = w; small.height = h;
    var sg = small.getContext("2d");
    sg.imageSmoothingQuality = "high";
    sg.drawImage(big, 0, 0, w * 2, h * 2, 0, 0, w, h);
    return sg.getImageData(0, 0, w, h);
  };

  // ----------------------------------------------------------------------
  // Post-processing (works on any seamless result; preserves tileability
  // because every operation is per-pixel, a global LUT, or torus-safe).
  // ----------------------------------------------------------------------

  // Detail restoration: add high-frequency detail back from the source,
  // masked away from the edges so seams stay intact.
  function restoreDetail(result, source, amount) {
    if (amount <= 0) return result;
    var w = result.width, h = result.height;
    var blur = SF.boxBlur(source, Math.max(1, Math.round(Math.min(w, h) / 120)), 2, false);
    var r = result.data, s = source.data, b = blur.data;
    for (var y = 0; y < h; y++) {
      var my = Math.sin(Math.PI * (y + 0.5) / h); my *= my;
      for (var x = 0; x < w; x++) {
        var mx = Math.sin(Math.PI * (x + 0.5) / w); mx *= mx;
        var m = mx * my * amount;
        var i = (y * w + x) * 4;
        r[i] = SF.clamp(r[i] + (s[i] - b[i]) * m, 0, 255);
        r[i + 1] = SF.clamp(r[i + 1] + (s[i + 1] - b[i + 1]) * m, 0, 255);
        r[i + 2] = SF.clamp(r[i + 2] + (s[i + 2] - b[i + 2]) * m, 0, 255);
      }
    }
    return result;
  }

  // Match each channel of `result` toward the histogram of `source` via a
  // global LUT (same input value → same output), so equal edges stay equal.
  function matchHistogram(result, source, amount) {
    if (amount <= 0) return result;
    var rd = result.data, sd = source.data;
    var n = result.width * result.height;
    for (var c = 0; c < 3; c++) {
      var hR = new Float32Array(256), hS = new Float32Array(256);
      for (var i = c; i < rd.length; i += 4) {
        hR[rd[i]]++;
        hS[sd[i]]++;
      }
      var cdfR = new Float32Array(256), cdfS = new Float32Array(256);
      cdfR[0] = hR[0] / n; cdfS[0] = hS[0] / n;
      for (var v = 1; v < 256; v++) {
        cdfR[v] = cdfR[v - 1] + hR[v] / n;
        cdfS[v] = cdfS[v - 1] + hS[v] / n;
      }
      var lut = new Uint8Array(256);
      var u = 0;
      for (v = 0; v < 256; v++) {
        while (u < 255 && cdfS[u] < cdfR[v]) u++;
        lut[v] = u;
      }
      for (i = c; i < rd.length; i += 4) {
        rd[i] = SF.lerp(rd[i], lut[rd[i]], amount);
      }
    }
    return result;
  }

  // Contrast enhancement around mid-grey. amount in [0..1] -> factor [1..2].
  function enhanceContrast(img, amount) {
    if (amount <= 0) return img;
    var f = SF.lerp(1, 2, amount), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      d[i] = SF.clamp((d[i] - 128) * f + 128, 0, 255);
      d[i + 1] = SF.clamp((d[i + 1] - 128) * f + 128, 0, 255);
      d[i + 2] = SF.clamp((d[i + 2] - 128) * f + 128, 0, 255);
    }
    return img;
  }

  // ----------------------------------------------------------------------
  // Public entry point.
  //   opts = { method, blend, blendX, blendY, detail, contrast, lighting, match }
  // ----------------------------------------------------------------------
  Seamless.apply = function (img, opts) {
    opts = opts || {};
    var o = {
      method: opts.method || "smoothed",
      blend: opts.blend == null ? 0.5 : opts.blend,
      blendX: opts.blendX,
      blendY: opts.blendY,
      detail: opts.detail == null ? 0.4 : opts.detail,
      contrast: opts.contrast || 0,
      lighting: opts.lighting || 0,
      match: opts.match || 0
    };
    var src = img;
    // lighting correction is most useful BEFORE seamlessing (it removes the
    // gradients that make seams obvious), so do it on a corrected copy.
    // Toroidal blur: a photo's left/right would otherwise flatten differently
    // and the half-offset would still carry a lighting discontinuity.
    if (o.lighting > 0) {
      src = SF.flattenLighting(SF.cloneImage(img), o.lighting, true);
    }
    var fn = Seamless[o.method] || Seamless.smoothed;
    var result = fn(src, o);
    if (o.method !== "mirror") result = restoreDetail(result, src, o.detail);
    matchHistogram(result, src, o.match);
    enhanceContrast(result, o.contrast);
    return result;
  };

  Seamless.methods = [
    { id: "smoothed", label: "Smoothed (soft, always seamless)" },
    { id: "offset", label: "Offset + Feather (keeps detail)" },
    { id: "collage", label: "Collage (min-error cut)" },
    { id: "mirror", label: "Mirror (symmetric / kaleidoscope)" }
  ];

  SF.Seamless = Seamless;
})(window.SF = window.SF || {});
