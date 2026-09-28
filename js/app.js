/*
 * app.js — UI glue for Seamlessifier.
 * Ties the Ripper, Seamless and Atlas modules to the DOM, manages the shared
 * texture library, previews, exporting and hotkeys.
 */
(function (SF) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var status = function (msg) { $("status").textContent = msg; };

  // -------------------------------------------------------- shared state
  var state = {
    tab: "ripper",
    library: [],          // {id,name,canvas,w,h,selected}
    activeId: null,       // last single-selected texture (seamless source)
    nextId: 1
  };

  function makeTexture(imageData, name) {
    var canvas = SF.imageToCanvas(imageData);
    var t = {
      id: state.nextId++, name: name || ("tex_" + state.nextId),
      canvas: canvas, w: imageData.width, h: imageData.height, selected: false
    };
    state.library.push(t);
    return t;
  }

  function getActive() {
    return state.library.filter(function (t) { return t.id === state.activeId; })[0] || null;
  }
  function getSelected() { return state.library.filter(function (t) { return t.selected; }); }

  // ------------------------------------------------------------- library UI
  function renderLibrary() {
    var grid = $("libGrid");
    grid.innerHTML = "";
    state.library.forEach(function (t) {
      var item = document.createElement("div");
      item.className = "lib-item" + (t.selected ? " selected" : "");
      if (t.id === state.activeId) item.style.outline = "1px solid var(--good)";
      var thumb = document.createElement("canvas");
      thumb.width = 96; thumb.height = 96;
      var g = thumb.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(t.canvas, 0, 0, 96, 96);
      var name = document.createElement("div");
      name.className = "name"; name.textContent = t.name + " · " + t.w + "×" + t.h;
      item.appendChild(thumb); item.appendChild(name);
      item.addEventListener("click", function (e) {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          t.selected = !t.selected;
        } else {
          state.library.forEach(function (o) { o.selected = false; });
          t.selected = true;
        }
        state.activeId = t.id;
        renderLibrary();
        if (state.tab === "seamless") refreshSeamlessSource();
      });
      grid.appendChild(item);
    });
    $("libCount").textContent = state.library.length;
  }

  // ------------------------------------------------------------- tabs
  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    ["ripper", "seamless", "atlas"].forEach(function (t) {
      $("panel-" + t).classList.toggle("hidden", t !== tab);
    });
    if (tab === "ripper") { resizeRipperCanvas(); drawRipper(); }
    if (tab === "seamless") { refreshSeamlessSource(); }
    if (tab === "atlas") { drawAtlas(); }
  }
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { switchTab(b.dataset.tab); });
  });

  // ========================================================== RIPPER
  var ripper = { img: null, src: null, corners: null, scale: 1, drag: -1, panStart: null };

  function loadRipperImage(file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      ripper.img = img;
      ripper.src = SF.toImageData(img, img.naturalWidth, img.naturalHeight);
      ripper.corners = SF.Ripper.defaultCorners(img.naturalWidth, img.naturalHeight);
      $("ripperPlaceholder").style.display = "none";
      resizeRipperCanvas();
      drawRipper();
      status("Loaded " + file.name + " (" + img.naturalWidth + "×" + img.naturalHeight + ")");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function resizeRipperCanvas() {
    if (!ripper.img) return;
    var wrap = $("ripperCanvasWrap");
    var maxW = wrap.clientWidth - 20, maxH = wrap.clientHeight - 20;
    var iw = ripper.img.naturalWidth, ih = ripper.img.naturalHeight;
    var s = Math.min(maxW / iw, maxH / ih, 1);
    if (!isFinite(s) || s <= 0) s = 1;
    ripper.scale = s;
    var c = $("ripperCanvas");
    c.width = Math.round(iw * s); c.height = Math.round(ih * s);
  }

  function drawRipper() {
    var c = $("ripperCanvas"); if (!ripper.img) return;
    var ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ripper.img, 0, 0, c.width, c.height);
    var s = ripper.scale, pts = ripper.corners.map(function (p) { return [p[0] * s, p[1] * s]; });
    // perspective guide grid: actual homography (not bilinear corner lerp)
    ctx.strokeStyle = "rgba(79,157,255,.35)"; ctx.lineWidth = 1;
    var N = 4;
    var H = SF.Ripper.homography(ripper.corners);
    function hmap(u, v) {
      var p = SF.applyHomography(H, u, v);
      return [p[0] * s, p[1] * s];
    }
    for (var i = 1; i < N; i++) {
      ctx.beginPath();
      var started = false;
      for (var j = 0; j <= 20; j++) {
        var p = hmap(i / N, j / 20);
        if (!isFinite(p[0]) || !isFinite(p[1])) continue;
        started ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        started = true;
      }
      ctx.stroke();
      ctx.beginPath();
      started = false;
      for (var k = 0; k <= 20; k++) {
        var q = hmap(k / 20, i / N);
        if (!isFinite(q[0]) || !isFinite(q[1])) continue;
        started ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        started = true;
      }
      ctx.stroke();
    }
    // quad outline
    ctx.strokeStyle = "#4f9dff"; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.closePath(); ctx.stroke();
    // handles
    var labels = ["TL", "TR", "BR", "BL"];
    pts.forEach(function (p, i) {
      ctx.fillStyle = i === ripper.drag ? "#fff" : "#4f9dff";
      ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif"; ctx.fillText(labels[i], p[0] + 9, p[1] - 9);
    });
  }

  function ripperMouse(e) {
    var c = $("ripperCanvas"), rect = c.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (c.width / rect.width);
    var y = (e.clientY - rect.top) * (c.height / rect.height);
    return [x / ripper.scale, y / ripper.scale]; // source-image coords
  }

  (function bindRipperCanvas() {
    var c = $("ripperCanvas");
    c.addEventListener("pointerdown", function (e) {
      if (!ripper.corners) return;
      c.setPointerCapture(e.pointerId);
      var m = ripperMouse(e);
      if (e.shiftKey) { ripper.panStart = { m: m, corners: ripper.corners.map(function (p) { return p.slice(); }) }; return; }
      var best = -1, bd = 16 / ripper.scale;
      ripper.corners.forEach(function (p, i) {
        var d = Math.hypot(p[0] - m[0], p[1] - m[1]);
        if (d < bd) { bd = d; best = i; }
      });
      ripper.drag = best; drawRipper();
    });
    c.addEventListener("pointermove", function (e) {
      if (!ripper.corners) return;
      var m = ripperMouse(e);
      if (ripper.panStart) {
        var dx = m[0] - ripper.panStart.m[0], dy = m[1] - ripper.panStart.m[1];
        ripper.corners = ripper.panStart.corners.map(function (p) { return [p[0] + dx, p[1] + dy]; });
        drawRipper(); return;
      }
      if (ripper.drag >= 0) {
        ripper.corners[ripper.drag] = [
          SF.clamp(m[0], 0, ripper.img.naturalWidth),
          SF.clamp(m[1], 0, ripper.img.naturalHeight)
        ];
        drawRipper(); updateRipPreview();
      }
    });
    function end() { ripper.drag = -1; ripper.panStart = null; drawRipper(); updateRipPreview(); }
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    // wheel: grow / shrink the quad about its centroid
    c.addEventListener("wheel", function (e) {
      if (!ripper.corners) return;
      e.preventDefault();
      var cx = 0, cy = 0;
      ripper.corners.forEach(function (p) { cx += p[0]; cy += p[1]; });
      cx /= 4; cy /= 4;
      var f = e.deltaY < 0 ? 1.05 : 0.95;
      ripper.corners = ripper.corners.map(function (p) { return [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]; });
      drawRipper(); updateRipPreview();
    }, { passive: false });
  })();

  function ripSampler() {
    return $("ripSample").value === "bilinear" ? SF.sampleBilinear : SF.sampleBicubic;
  }
  function applyRipLighting(img) {
    var light = +$("ripLight").value / 100;
    if (light > 0) SF.flattenLighting(img, light, false);
    return img;
  }

  var ripPreviewTimer = null;
  function updateRipPreview() {
    if (!ripper.src) return;
    clearTimeout(ripPreviewTimer);
    ripPreviewTimer = setTimeout(function () {
      var rw = SF.clamp(parseInt($("ripW").value, 10) || 512, 16, 4096);
      var rh = SF.clamp(parseInt($("ripH").value, 10) || 512, 16, 4096);
      var maxSide = 256;
      var sc = maxSide / Math.max(rw, rh);
      var pw = Math.max(16, Math.round(rw * sc));
      var ph = Math.max(16, Math.round(rh * sc));
      var out = applyRipLighting(SF.Ripper.rip(ripper.src, ripper.corners, pw, ph, ripSampler()));
      var pc = $("ripPreview"); pc.width = pw; pc.height = ph;
      pc.getContext("2d").putImageData(out, 0, 0);
    }, 40);
  }

  $("ripperFile").addEventListener("change", function (e) { if (e.target.files[0]) loadRipperImage(e.target.files[0]); });
  $("ripReset").addEventListener("click", function () {
    if (ripper.img) { ripper.corners = SF.Ripper.defaultCorners(ripper.img.naturalWidth, ripper.img.naturalHeight); drawRipper(); updateRipPreview(); }
  });
  $("ripFit").addEventListener("click", function () {
    if (!ripper.corners) return;
    var s = SF.Ripper.suggestSize(ripper.corners);
    $("ripW").value = s.w; $("ripH").value = $("ripSquare").checked ? s.w : s.h;
  });
  $("ripW").addEventListener("input", function () {
    if ($("ripSquare").checked) $("ripH").value = $("ripW").value;
    updateRipPreview();
  });
  $("ripH").addEventListener("input", function () {
    if ($("ripSquare").checked) $("ripW").value = $("ripH").value;
    updateRipPreview();
  });
  $("ripSample").addEventListener("change", updateRipPreview);
  $("ripLight").addEventListener("input", function () {
    $("vRipLight").textContent = $("ripLight").value;
    updateRipPreview();
  });
  $("ripButton").addEventListener("click", function () {
    if (!ripper.src) { status("Load a photo first."); return; }
    var w = SF.clamp(parseInt($("ripW").value, 10) || 512, 16, 4096);
    var h = SF.clamp(parseInt($("ripH").value, 10) || 512, 16, 4096);
    var out = applyRipLighting(SF.Ripper.rip(ripper.src, ripper.corners, w, h, ripSampler()));
    var t = makeTexture(out, "rip_" + state.nextId);
    state.library.forEach(function (o) { o.selected = false; });
    t.selected = true; state.activeId = t.id;
    renderLibrary();
    status("Ripped " + w + "×" + h + " → added to library as " + t.name);
  });

  // ========================================================== SEAMLESS
  var seamSource = null; // ImageData currently being seamlessed

  (function fillMethods() {
    var sel = $("seamMethod");
    SF.Seamless.methods.forEach(function (m) {
      var o = document.createElement("option"); o.value = m.id; o.textContent = m.label; sel.appendChild(o);
    });
  })();

  function seamOpts() {
    return {
      method: $("seamMethod").value,
      blendX: +$("seamBlendX").value / 100,
      blendY: +$("seamBlendY").value / 100,
      detail: +$("seamDetail").value / 100,
      match: +$("seamMatch").value / 100,
      contrast: +$("seamContrast").value / 100,
      lighting: +$("seamLight").value / 100
    };
  }

  function refreshSeamlessSource() {
    var t = getActive();
    if (t) {
      seamSource = SF.toImageData(t.canvas, t.w, t.h);
      $("seamSource").textContent = "Source: " + t.name + " (" + t.w + "×" + t.h + ")";
      updateSeamPreview();
    } else {
      $("seamSource").textContent = "Select a texture in the library, or load an image →";
    }
  }

  $("seamFile").addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      seamSource = SF.toImageData(img, img.naturalWidth, img.naturalHeight);
      $("seamSource").textContent = "Source: " + file.name + " (" + img.naturalWidth + "×" + img.naturalHeight + ")";
      state.activeId = null;
      updateSeamPreview();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  var seamTimer = null, lastResult = null;
  function updateSeamPreview() {
    if (!seamSource) return;
    clearTimeout(seamTimer);
    status("Seamlessing…");
    seamTimer = setTimeout(function () {
      var result = SF.Seamless.apply(seamSource, seamOpts());
      lastResult = result;
      // single
      var sc = $("seamSingle"); sc.width = result.width; sc.height = result.height;
      sc.getContext("2d").putImageData(result, 0, 0);
      // 3x3 tiled
      var tile = SF.imageToCanvas(result);
      var tc = $("seamTiled"); tc.width = result.width * 3; tc.height = result.height * 3;
      var g = tc.getContext("2d");
      for (var yy = 0; yy < 3; yy++) for (var xx = 0; xx < 3; xx++) g.drawImage(tile, xx * result.width, yy * result.height);
      status("Ready.");
    }, 60);
  }

  ["seamMethod", "seamBlendX", "seamBlendY", "seamDetail", "seamMatch", "seamContrast", "seamLight"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      $("vBlendX").textContent = $("seamBlendX").value;
      $("vBlendY").textContent = $("seamBlendY").value;
      $("vDetail").textContent = $("seamDetail").value;
      $("vMatch").textContent = $("seamMatch").value;
      $("vContrast").textContent = $("seamContrast").value;
      $("vLight").textContent = $("seamLight").value;
      updateSeamPreview();
    });
  });

  function applySeamless() {
    if (!seamSource) { status("No source texture. Select one in the library."); return; }
    var result = SF.Seamless.apply(seamSource, seamOpts());
    var base = getActive();
    var t = makeTexture(result, (base ? base.name : "img") + "_seamless");
    state.library.forEach(function (o) { o.selected = false; });
    t.selected = true; state.activeId = t.id;
    renderLibrary();
    status("Seamless texture added: " + t.name);
  }
  $("seamApply").addEventListener("click", applySeamless);

  // ========================================================== ATLAS
  var atlasState = { canvas: null, placements: null, drag: null };

  function drawAtlas() {
    var c = $("atlasCanvas");
    if (!atlasState.canvas) { $("atlasPlaceholder").style.display = ""; c.width = c.height = 0; return; }
    $("atlasPlaceholder").style.display = "none";
    var wrap = $("atlasCanvasWrap");
    var src = atlasState.canvas;
    var s = Math.min((wrap.clientWidth - 20) / src.width, (wrap.clientHeight - 20) / src.height, 1);
    if (!isFinite(s) || s <= 0) s = 1;
    c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    c.dataset.scale = s;
  }

  function repackManual() {
    if (!atlasState.placements) return;
    atlasState.canvas = SF.Atlas.compose(atlasState.placements, +$("atlasPad").value || 0);
    drawAtlas();
  }

  $("atlasPack").addEventListener("click", function () {
    var sel = getSelected();
    if (!sel.length) { status("Select textures in the library to pack."); return; }
    var aw = SF.clamp(parseInt($("atlasW").value, 10) || 1024, 64, 8192);
    var packed = SF.Atlas.pack(sel, aw, parseInt($("atlasPad").value, 10) || 2);
    atlasState.canvas = packed.canvas;
    atlasState.placements = packed.placements;
    drawAtlas();
    $("atlasInfo").textContent = sel.length + " textures · atlas " + packed.width + "×" + packed.height;
    status("Packed " + sel.length + " textures.");
  });
  $("atlasExport").addEventListener("click", function () {
    if (!atlasState.canvas) { status("Pack an atlas first."); return; }
    SF.Atlas.downloadCanvas(atlasState.canvas, "atlas.png");
    status("Exported atlas.png");
  });

  // shift+drag to move a tile in the atlas
  (function bindAtlasCanvas() {
    var c = $("atlasCanvas");
    function pos(e) {
      var rect = c.getBoundingClientRect(), s = +c.dataset.scale || 1;
      return [(e.clientX - rect.left) * (c.width / rect.width) / s, (e.clientY - rect.top) * (c.height / rect.height) / s];
    }
    c.addEventListener("pointerdown", function (e) {
      if (!e.shiftKey || !atlasState.placements) return;
      c.setPointerCapture(e.pointerId);
      var m = pos(e);
      for (var i = atlasState.placements.length - 1; i >= 0; i--) {
        var p = atlasState.placements[i];
        if (m[0] >= p.x && m[0] <= p.x + p.tex.w && m[1] >= p.y && m[1] <= p.y + p.tex.h) {
          atlasState.drag = { p: p, off: [m[0] - p.x, m[1] - p.y] }; break;
        }
      }
    });
    c.addEventListener("pointermove", function (e) {
      if (!atlasState.drag) return;
      var m = pos(e);
      atlasState.drag.p.x = Math.max(0, Math.round(m[0] - atlasState.drag.off[0]));
      atlasState.drag.p.y = Math.max(0, Math.round(m[1] - atlasState.drag.off[1]));
      repackManual();
    });
    c.addEventListener("pointerup", function () { atlasState.drag = null; });
  })();

  // ========================================================== EXPORT
  function exportTexture(t) { SF.Atlas.downloadCanvas(t.canvas, t.name + ".png"); }
  $("exportSelected").addEventListener("click", function () {
    var sel = getSelected();
    if (!sel.length) { status("Nothing selected."); return; }
    sel.forEach(exportTexture);
    status("Exported " + sel.length + " texture(s).");
  });
  $("exportAll").addEventListener("click", function () {
    if (!state.library.length) { status("Library is empty."); return; }
    state.library.forEach(exportTexture);
    status("Exported all " + state.library.length + " texture(s).");
  });

  // ------------------------------------------------------------ library foot
  $("libSelectAll").addEventListener("click", function () {
    var all = state.library.every(function (t) { return t.selected; });
    state.library.forEach(function (t) { t.selected = !all; });
    renderLibrary();
  });
  $("libDelete").addEventListener("click", function () {
    state.library = state.library.filter(function (t) { return !t.selected; });
    if (!getActive()) state.activeId = null;
    renderLibrary();
    if (state.tab === "seamless") refreshSeamlessSource();
  });

  // ------------------------------------------------------------ hotkeys
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    if (e.key === "s" || e.key === "S") {
      var t = getActive();
      if (t) {
        seamSource = SF.toImageData(t.canvas, t.w, t.h);
        applySeamless();
      } else status("Select a texture first, then press S.");
    } else if (e.key === "1") switchTab("ripper");
    else if (e.key === "2") switchTab("seamless");
    else if (e.key === "3") switchTab("atlas");
  });

  // ------------------------------------------------------------ resize
  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (state.tab === "ripper") { resizeRipperCanvas(); drawRipper(); }
      if (state.tab === "atlas") drawAtlas();
    }, 100);
  });

  renderLibrary();
  status("Ready. Load a photo in the Ripper tab, or drop an image into Seamless.");
})(window.SF = window.SF || {});
