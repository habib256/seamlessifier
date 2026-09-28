/*
 * util.js — core image + math utilities for Seamlessifier
 *
 * Everything is attached to the global `SF` namespace so the app can run from
 * a plain file:// URL with classic <script> tags (no bundler / module server).
 */
(function (SF) {
  "use strict";

  // ----------------------------------------------------------------------
  // Small helpers
  // ----------------------------------------------------------------------
  SF.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  SF.lerp = function (a, b, t) { return a + (b - a) * t; };
  SF.smoothstep = function (t) { t = SF.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  SF.wrapIndex = function (i, n) { return ((i % n) + n) % n; };

  // A fresh ImageData of the given size (RGBA, opaque black).
  SF.newImage = function (w, h) {
    var img = new ImageData(w, h);
    var d = img.data;
    for (var i = 3; i < d.length; i += 4) d[i] = 255;
    return img;
  };

  SF.cloneImage = function (img) {
    return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  };

  // Draw any source (image/canvas) into a new ImageData of size w x h.
  SF.toImageData = function (source, w, h) {
    w = w || source.naturalWidth || source.width;
    h = h || source.naturalHeight || source.height;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };

  // Wrap ImageData into an offscreen canvas (handy for drawing / export).
  SF.imageToCanvas = function (img) {
    var c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").putImageData(img, 0, 0);
    return c;
  };

  // Catmull-Rom cubic; t=0 returns p1, t=1 returns p2. Can overshoot.
  function cubicCatmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  // Bilinear sample of an ImageData at floating (x, y). Edges are clamped.
  // Writes [r,g,b,a] into `out` (length-4 array) to avoid allocations.
  SF.sampleBilinear = function (img, x, y, out) {
    var w = img.width, h = img.height, d = img.data;
    x = SF.clamp(x, 0, w - 1.0001);
    y = SF.clamp(y, 0, h - 1.0001);
    var x0 = x | 0, y0 = y | 0;
    var x1 = x0 + 1 < w ? x0 + 1 : x0;
    var y1 = y0 + 1 < h ? y0 + 1 : y0;
    var fx = x - x0, fy = y - y0;
    var i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4;
    var i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    var w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
    var w01 = (1 - fx) * fy, w11 = fx * fy;
    for (var k = 0; k < 4; k++) {
      out[k] = d[i00 + k] * w00 + d[i10 + k] * w10 + d[i01 + k] * w01 + d[i11 + k] * w11;
    }
    return out;
  };

  // Bicubic (Catmull-Rom) sample. Sharper than bilinear under perspective
  // warp; clamp-to-edge. Result is clamped to 0..255 (kernel can overshoot).
  SF.sampleBicubic = function (img, x, y, out) {
    var w = img.width, h = img.height, d = img.data;
    x = SF.clamp(x, 0, w - 1.0001);
    y = SF.clamp(y, 0, h - 1.0001);
    var x0 = x | 0, y0 = y | 0;
    var fx = x - x0, fy = y - y0;
    var xm1 = x0 > 0 ? x0 - 1 : 0;
    var x1 = x0 + 1 < w ? x0 + 1 : x0;
    var x2 = x0 + 2 < w ? x0 + 2 : x1;
    var ym1 = y0 > 0 ? y0 - 1 : 0;
    var y1 = y0 + 1 < h ? y0 + 1 : y0;
    var y2 = y0 + 2 < h ? y0 + 2 : y1;
    for (var k = 0; k < 4; k++) {
      var c0 = cubicCatmull(d[(ym1 * w + xm1) * 4 + k], d[(ym1 * w + x0) * 4 + k], d[(ym1 * w + x1) * 4 + k], d[(ym1 * w + x2) * 4 + k], fx);
      var c1 = cubicCatmull(d[(y0 * w + xm1) * 4 + k], d[(y0 * w + x0) * 4 + k], d[(y0 * w + x1) * 4 + k], d[(y0 * w + x2) * 4 + k], fx);
      var c2 = cubicCatmull(d[(y1 * w + xm1) * 4 + k], d[(y1 * w + x0) * 4 + k], d[(y1 * w + x1) * 4 + k], d[(y1 * w + x2) * 4 + k], fx);
      var c3 = cubicCatmull(d[(y2 * w + xm1) * 4 + k], d[(y2 * w + x0) * 4 + k], d[(y2 * w + x1) * 4 + k], d[(y2 * w + x2) * 4 + k], fx);
      out[k] = SF.clamp(cubicCatmull(c0, c1, c2, c3, fy), 0, 255);
    }
    return out;
  };

  // Toroidal (wrap-around) nearest fetch into out[4].
  SF.fetchWrap = function (img, x, y, out) {
    var w = img.width, h = img.height, d = img.data;
    x = ((x % w) + w) % w; y = ((y % h) + h) % h;
    var i = ((y | 0) * w + (x | 0)) * 4;
    out[0] = d[i]; out[1] = d[i + 1]; out[2] = d[i + 2]; out[3] = d[i + 3];
    return out;
  };

  // ----------------------------------------------------------------------
  // Separable box blur (multiple passes ≈ Gaussian). Operates on RGB, keeps
  // alpha opaque. Returns a NEW ImageData. radius is in pixels.
  // wrap=true samples toroidally (required before seamless lighting).
  // ----------------------------------------------------------------------
  SF.boxBlur = function (img, radius, passes, wrap) {
    radius = Math.max(0, radius | 0);
    passes = passes || 3;
    if (radius === 0) return SF.cloneImage(img);
    var w = img.width, h = img.height;
    var a = new Float32Array(w * h * 3);
    var b = new Float32Array(w * h * 3);
    var src = img.data;
    for (var p = 0, q = 0; p < w * h; p++, q += 4) {
      a[p * 3] = src[q]; a[p * 3 + 1] = src[q + 1]; a[p * 3 + 2] = src[q + 2];
    }
    function idxX(x) { return wrap ? SF.wrapIndex(x, w) : SF.clamp(x, 0, w - 1); }
    function idxY(y) { return wrap ? SF.wrapIndex(y, h) : SF.clamp(y, 0, h - 1); }
    function blurH(inA, outA) {
      var win = radius * 2 + 1;
      for (var y = 0; y < h; y++) {
        var row = y * w;
        for (var c = 0; c < 3; c++) {
          var sum = 0;
          for (var k = -radius; k <= radius; k++) {
            sum += inA[(row + idxX(k)) * 3 + c];
          }
          for (var x = 0; x < w; x++) {
            outA[(row + x) * 3 + c] = sum / win;
            var add = idxX(x + radius + 1);
            var sub = idxX(x - radius);
            sum += inA[(row + add) * 3 + c] - inA[(row + sub) * 3 + c];
          }
        }
      }
    }
    function blurV(inA, outA) {
      var win = radius * 2 + 1;
      for (var x = 0; x < w; x++) {
        for (var c = 0; c < 3; c++) {
          var sum = 0;
          for (var k = -radius; k <= radius; k++) {
            sum += inA[(idxY(k) * w + x) * 3 + c];
          }
          for (var y = 0; y < h; y++) {
            outA[(y * w + x) * 3 + c] = sum / win;
            var add = idxY(y + radius + 1);
            var sub = idxY(y - radius);
            sum += inA[(add * w + x) * 3 + c] - inA[(sub * w + x) * 3 + c];
          }
        }
      }
    }
    for (var pass = 0; pass < passes; pass++) {
      blurH(a, b); blurV(b, a);
    }
    var outImg = SF.newImage(w, h);
    var od = outImg.data;
    for (var pp = 0, qq = 0; pp < w * h; pp++, qq += 4) {
      od[qq] = a[pp * 3]; od[qq + 1] = a[pp * 3 + 1]; od[qq + 2] = a[pp * 3 + 2]; od[qq + 3] = 255;
    }
    return outImg;
  };

  // Flatten large-scale illumination by dividing out a heavy blur.
  // wrap=true (seamless path) keeps the correction torus-safe; wrap=false
  // is correct for a photo that is not already a tile (ripper).
  // Mutates `img` and returns it.
  SF.flattenLighting = function (img, amount, wrap) {
    if (amount <= 0) return img;
    var w = img.width, h = img.height;
    var rad = Math.max(4, Math.round(Math.min(w, h) / 8));
    var blur = SF.boxBlur(img, rad, 3, !!wrap);
    var d = img.data, b = blur.data;
    var mean = 0, n = w * h;
    for (var i = 0; i < d.length; i += 4) {
      mean += 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    }
    mean /= n;
    for (var j = 0; j < d.length; j += 4) {
      var lb = 0.299 * b[j] + 0.587 * b[j + 1] + 0.114 * b[j + 2];
      if (lb < 1) lb = 1;
      var f = SF.lerp(1, mean / lb, amount);
      d[j] = SF.clamp(d[j] * f, 0, 255);
      d[j + 1] = SF.clamp(d[j + 1] * f, 0, 255);
      d[j + 2] = SF.clamp(d[j + 2] * f, 0, 255);
    }
    return img;
  };

  // ----------------------------------------------------------------------
  // Projective transform (homography).
  //
  // computeHomography(from[4], to[4]) returns a 3x3 matrix H (row-major,
  // length 9) such that  to ≈ H * from  in homogeneous coordinates.
  // Points are [x, y] pairs given in the SAME order around the quad.
  // ----------------------------------------------------------------------
  SF.computeHomography = function (from, to) {
    // Solve A x = b for the 8 unknowns [a b c d e f g h].
    var A = [], bvec = [];
    for (var i = 0; i < 4; i++) {
      var X = from[i][0], Y = from[i][1];
      var x = to[i][0], y = to[i][1];
      A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); bvec.push(x);
      A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); bvec.push(y);
    }
    var s = solveLinear(A, bvec); // length 8
    return [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1];
  };

  // Apply 3x3 homography to a point, returns [x, y] (de-homogenised).
  SF.applyHomography = function (H, x, y) {
    var d = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
  };

  // Gaussian elimination with partial pivoting for an n×n system.
  function solveLinear(A, b) {
    var n = b.length;
    // augmented matrix
    var M = [];
    for (var i = 0; i < n; i++) M.push(A[i].slice().concat(b[i]));
    for (var col = 0; col < n; col++) {
      // pivot
      var piv = col;
      for (var r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      var pv = M[col][col];
      if (Math.abs(pv) < 1e-12) pv = 1e-12;
      for (var c = col; c <= n; c++) M[col][c] /= pv;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = M[r2][col];
        for (var c2 = col; c2 <= n; c2++) M[r2][c2] -= f * M[col][c2];
      }
    }
    var x = [];
    for (var k = 0; k < n; k++) x.push(M[k][n]);
    return x;
  }
  SF.solveLinear = solveLinear;

})(window.SF = window.SF || {});
