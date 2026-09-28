/*
 * ripper.js — extract a flat texture from a photo using a 4-corner polygon.
 *
 * The user drags 4 handles over a flat surface seen in perspective; the ripper
 * computes the homography that maps the output rectangle onto that quad and
 * inverse-warps (bicubic by default, bilinear optional) the photo into a
 * clean, fronto-parallel texture.
 *
 * Ripper.rip(sourceImageData, corners, outW, outH, sampleFn) -> ImageData
 *   corners: [[x,y] x4] in source-image pixel coords, ordered
 *            top-left, top-right, bottom-right, bottom-left.
 *   sampleFn: optional (img, x, y, out) sampler; defaults to SF.sampleBicubic.
 */
(function (SF) {
  "use strict";

  var Ripper = {};

  var UNIT_RECT = [[0, 0], [1, 0], [1, 1], [0, 1]];

  Ripper.unitRect = UNIT_RECT;

  // Homography that maps a normalised [0,1]×[0,1] rectangle onto `corners`.
  Ripper.homography = function (corners) {
    return SF.computeHomography(UNIT_RECT, corners);
  };

  Ripper.rip = function (source, corners, outW, outH, sampleFn) {
    outW = Math.max(1, outW | 0);
    outH = Math.max(1, outH | 0);
    sampleFn = sampleFn || SF.sampleBicubic;
    var H = Ripper.homography(corners);
    var out = SF.newImage(outW, outH);
    var od = out.data;
    var px = [0, 0, 0, 0];
    for (var y = 0; y < outH; y++) {
      var v = (y + 0.5) / outH;
      for (var x = 0; x < outW; x++) {
        var u = (x + 0.5) / outW;
        var sp = SF.applyHomography(H, u, v);
        sampleFn(source, sp[0], sp[1], px);
        var i = (y * outW + x) * 4;
        od[i] = px[0]; od[i + 1] = px[1]; od[i + 2] = px[2]; od[i + 3] = 255;
      }
    }
    return out;
  };

  // Default corner layout: an inset rectangle, given source size.
  Ripper.defaultCorners = function (w, h) {
    var mx = w * 0.2, my = h * 0.2;
    return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
  };

  // Suggest an output size that roughly matches the quad's average edge
  // lengths, rounded to a sensible power-of-two-ish texture size.
  Ripper.suggestSize = function (corners) {
    function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
    var top = dist(corners[0], corners[1]);
    var bot = dist(corners[3], corners[2]);
    var left = dist(corners[0], corners[3]);
    var right = dist(corners[1], corners[2]);
    var w = (top + bot) / 2, h = (left + right) / 2;
    function snap(v) {
      var sizes = [128, 256, 512, 1024, 2048];
      var best = sizes[0];
      for (var i = 0; i < sizes.length; i++) {
        if (Math.abs(sizes[i] - v) < Math.abs(best - v)) best = sizes[i];
      }
      return best;
    }
    return { w: snap(w), h: snap(h) };
  };

  SF.Ripper = Ripper;
})(window.SF = window.SF || {});
