/*
 * atlas.js — pack several textures into one atlas image and handle PNG export.
 *
 * Each texture is { id, name, canvas, w, h }. The packer uses a simple shelf
 * (row) algorithm: sort by descending height, lay left-to-right, wrap to a new
 * shelf when the row is full. Returns placements + the atlas canvas.
 */
(function (SF) {
  "use strict";

  var Atlas = {};

  // Pack textures into an atlas of the given width. Height grows as needed.
  // padding is the gap (px) left between textures.
  Atlas.pack = function (textures, atlasW, padding) {
    padding = padding || 2;
    var items = textures.slice().sort(function (a, b) { return b.h - a.h; });
    var x = padding, y = padding, shelfH = 0, placements = [];
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      if (x + t.w + padding > atlasW && x > padding) {
        // new shelf
        x = padding; y += shelfH + padding; shelfH = 0;
      }
      placements.push({ tex: t, x: x, y: y });
      x += t.w + padding;
      if (t.h > shelfH) shelfH = t.h;
    }
    var atlasH = y + shelfH + padding;
    var canvas = document.createElement("canvas");
    canvas.width = atlasW; canvas.height = Math.max(1, atlasH);
    var ctx = canvas.getContext("2d");
    for (var j = 0; j < placements.length; j++) {
      var p = placements[j];
      ctx.drawImage(p.tex.canvas, p.x, p.y);
    }
    return { canvas: canvas, placements: placements, width: atlasW, height: canvas.height };
  };

  // Compose an atlas from MANUAL placements [{tex,x,y}] sized to fit content.
  Atlas.compose = function (placements, padding) {
    padding = padding || 0;
    var maxX = 1, maxY = 1;
    placements.forEach(function (p) {
      maxX = Math.max(maxX, p.x + p.tex.w);
      maxY = Math.max(maxY, p.y + p.tex.h);
    });
    var canvas = document.createElement("canvas");
    canvas.width = maxX + padding; canvas.height = maxY + padding;
    var ctx = canvas.getContext("2d");
    placements.forEach(function (p) { ctx.drawImage(p.tex.canvas, p.x, p.y); });
    return canvas;
  };

  // Trigger a PNG download of a canvas.
  Atlas.downloadCanvas = function (canvas, filename) {
    canvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  };

  SF.Atlas = Atlas;
})(window.SF = window.SF || {});
