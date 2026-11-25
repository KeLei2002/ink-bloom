// The paint field: which parts of the hidden painting are showing.
//   mask      a canvas whose alpha says how much of the painting shows at each pixel (what you see)
//   grid      a coarse true/false grid of the same area (what the rules use: progress, bookworm food)
//   revealed  the painting cut out by the mask; only the part that changed is recomposed each frame
// Blots do not appear at full size: each one is stamped a little larger every frame for a moment,
// which is what makes ink look like it is soaking into paper.
window.MR = window.MR || {};

(function () {
  const CELL = 16;
  const F = MR.FIELD;
  const GW = Math.ceil(F.w / CELL), GH = Math.ceil(F.h / CELL);
  const BRUSH = 128; // size of a brush stamp texture
  const SOLID = 0.78; // the solid part of a stamp is about this share of its width
  let mask, mctx, revealed, rctx, painting, grid, count = 0;
  let stamps = [], blooms = [], wetBlots = [];
  let dirty = null;

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // Irregular soft-edged blobs, built once from overlapping radial gradients.
  function makeStamps() {
    for (let n = 0; n < 5; n++) {
      const c = canvas(BRUSH, BRUSH), x = c.getContext('2d'), h = BRUSH / 2;
      const blob = (bx, by, r, a) => {
        const g = x.createRadialGradient(bx, by, r * 0.35, bx, by, r);
        g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
        g.addColorStop(0.75, 'rgba(0,0,0,' + a * 0.85 + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.beginPath(); x.arc(bx, by, r, 0, 6.3); x.fill();
      };
      blob(h, h, h * 0.74, 1);
      const lobes = 9 + n;
      for (let i = 0; i < lobes; i++) {
        const a = (i / lobes) * 6.283 + Math.random() * 0.5, d = h * (0.5 + Math.random() * 0.22), r = h * (0.16 + Math.random() * 0.2);
        blob(h + Math.cos(a) * d, h + Math.sin(a) * d, r, 1);
      }
      for (let i = 0; i < 7; i++) { // loose specks at the rim
        const a = Math.random() * 6.283, d = h * (0.8 + Math.random() * 0.16);
        blob(h + Math.cos(a) * d, h + Math.sin(a) * d, h * (0.03 + Math.random() * 0.05), 0.9);
      }
      stamps.push(c);
    }
  }

  function markDirty(x, y, r) {
    const x0 = Math.max(0, Math.floor(x - r - 2)), y0 = Math.max(0, Math.floor(y - r - 2));
    const x1 = Math.min(F.w, Math.ceil(x + r + 2)), y1 = Math.min(F.h, Math.ceil(y + r + 2));
    if (x1 <= x0 || y1 <= y0) return;
    if (!dirty) dirty = { x0, y0, x1, y1 };
    else { dirty.x0 = Math.min(dirty.x0, x0); dirty.y0 = Math.min(dirty.y0, y0); dirty.x1 = Math.max(dirty.x1, x1); dirty.y1 = Math.max(dirty.y1, y1); }
  }

  function stampMask(b, r, alpha) {
    const s = (r * 2) / BRUSH / SOLID;
    mctx.globalAlpha = alpha;
    mctx.setTransform(b.c * s, b.s * s, -b.s * s, b.c * s, b.x, b.y);
    mctx.drawImage(stamps[b.stamp], -BRUSH / 2, -BRUSH / 2);
    markDirty(b.x, b.y, r * 1.2);
  }

  function gridCircle(x, y, r, value) {
    const cx0 = Math.max(0, Math.floor((x - r) / CELL)), cx1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
    const cy0 = Math.max(0, Math.floor((y - r) / CELL)), cy1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
    let changed = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const dx = (cx + 0.5) * CELL - x, dy = (cy + 0.5) * CELL - y;
      if (dx * dx + dy * dy > r * r) continue;
      const i = cy * GW + cx;
      if (grid[i] !== value) { grid[i] = value; changed++; }
    }
    count += value ? changed : -changed;
    return changed;
  }

  MR.Ink = {
    CELL, GW, GH,
    init() {
      mask = canvas(F.w, F.h); mctx = mask.getContext('2d');
      revealed = canvas(F.w, F.h); rctx = revealed.getContext('2d');
      grid = new Uint8Array(GW * GH);
      makeStamps();
    },
    // Start a painting from blank.
    reset(img) {
      painting = img;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, F.w, F.h);
      rctx.clearRect(0, 0, F.w, F.h);
      grid.fill(0); count = 0;
      blooms = []; wetBlots = []; dirty = null;
    },
    get progress() { return count / grid.length; },
    get activeBlooms() { return blooms.length; },
    covered(x, y) {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      return cx >= 0 && cy >= 0 && cx < GW && cy < GH && grid[cy * GW + cx] === 1;
    },

    // Drop a blot of ink at (x, y), field coordinates. r is the radius it settles at.
    //   o.grow   final size relative to r (the Wash technique sets this above 1)
    //   o.time   seconds to settle        o.dark  how black the wet ink looks at first (0..1)
    blot(x, y, r, o) {
      o = o || {};
      const grow = o.grow || 1, a = Math.random() * 6.283;
      const b = { x, y, r0: r * 0.42, r1: r * grow, t: 0, dur: o.time || 0.6, c: Math.cos(a), s: Math.sin(a), stamp: (Math.random() * stamps.length) | 0 };
      blooms.push(b);
      stampMask(b, b.r0, 1);
      if (o.dark !== 0) {
        // very large blots keep a modest, paler wet core so black never hides the picture for long
        const wr = r <= 48 ? r : 48 + (r - 48) * 0.4, pale = Math.max(0.5, Math.min(1, 48 / r));
        wetBlots.push({ x, y, r: wr * 1.05, t: 0, dur: 0.75 + Math.random() * 0.35, a: (o.dark === undefined ? 0.8 : o.dark) * pale, c: b.c, s: b.s, stamp: b.stamp, grow });
      }
      return gridCircle(x, y, r * grow * 0.88, 1);
    },
    // A bookworm bites the painting back to blank paper.
    erase(x, y, r) {
      const changed = gridCircle(x, y, r, 0);
      if (!changed) return 0;
      for (const b of blooms) if (Math.hypot(b.x - x, b.y - y) < r + b.r1 * 0.6) b.dead = true; // stop ink that is still spreading here
      const a = Math.random() * 6.283, b = { x, y, c: Math.cos(a), s: Math.sin(a), stamp: (Math.random() * stamps.length) | 0 };
      mctx.globalCompositeOperation = 'destination-out';
      stampMask(b, r * 1.08, 1);
      mctx.globalCompositeOperation = 'source-over';
      return changed;
    },
    // Reveal everything that is still blank (used when a painting is cleared).
    fillAll() {
      for (let cy = 1; cy < GH; cy += 4) for (let cx = 1; cx < GW; cx += 4) {
        const x = (cx + 0.5 + Math.random()) * CELL, y = (cy + 0.5 + Math.random()) * CELL;
        const b = { x, y, r0: 20, r1: 90, t: -Math.random() * 0.9 - Math.hypot(x - F.w / 2, y - F.h / 2) / 900, dur: 1.1, c: 1, s: 0, stamp: (Math.random() * stamps.length) | 0 };
        blooms.push(b);
      }
      grid.fill(1); count = grid.length;
    },

    update(dt) {
      for (const b of blooms) {
        b.t += dt;
        if (b.t <= 0 || b.dead) continue;
        const k = Math.min(1, b.t / b.dur), e = 1 - Math.pow(1 - k, 3);
        stampMask(b, b.r0 + (b.r1 - b.r0) * e, k >= 1 ? 1 : 0.55);
      }
      blooms = blooms.filter((b) => !b.dead && b.t < b.dur);
      for (const w of wetBlots) w.t += dt;
      wetBlots = wetBlots.filter((w) => w.t < w.dur);
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalAlpha = 1;
      if (dirty) {
        const { x0, y0 } = dirty, w = dirty.x1 - x0, h = dirty.y1 - y0;
        rctx.globalCompositeOperation = 'source-over';
        rctx.clearRect(x0, y0, w, h);
        rctx.drawImage(mask, x0, y0, w, h, x0, y0, w, h);
        rctx.globalCompositeOperation = 'source-atop';
        rctx.drawImage(painting, x0, y0, w, h, x0, y0, w, h);
        dirty = null;
      }
    },

    // Draws the revealed painting, then the wet ink that is still soaking in on top of it.
    draw(ctx) {
      ctx.drawImage(revealed, F.x, F.y);
      if (!wetBlots.length) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(F.x, F.y, F.w, F.h); ctx.clip();
      for (const w of wetBlots) {
        const k = w.t / w.dur;
        const r = w.r * (0.55 + 0.45 * Math.min(1, k * 3)) * (1 + (w.grow - 1) * k * 0.5);
        const s = (r * 2) / BRUSH / SOLID;
        ctx.globalAlpha = w.a * (1 - k) * (1 - k);
        ctx.setTransform(w.c * s, w.s * s, -w.s * s, w.c * s, F.x + w.x, F.y + w.y);
        ctx.drawImage(stamps[w.stamp], -BRUSH / 2, -BRUSH / 2);
      }
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    },
    stamp: (i) => stamps[i % stamps.length],

    // --- questions the bookworms and the guide ask ---------------------------------
    // A painted spot near (x, y): the best of a few random samples, or null if nothing is painted.
    paintedNear(x, y, tries) {
      if (!count) return null;
      let best = null, bd = 1e9;
      for (let n = 0; n < (tries || 14); n++) {
        const i = (Math.random() * grid.length) | 0;
        if (!grid[i]) continue;
        const px = (i % GW + 0.5) * CELL, py = (Math.floor(i / GW) + 0.5) * CELL, d = Math.hypot(px - x, py - y);
        if (d < bd) { bd = d; best = { x: px, y: py }; }
      }
      return best;
    },
    // The guide searches a small window. A finishing stroke needs a much larger blank patch.
    emptiestRegion(span = 6, near = null) {
      let best = null, bn = 0, bestDistance = Infinity;
      for (let by = 0; by + span <= GH + 2; by += 3) for (let bx = 0; bx + span <= GW + 2; bx += 3) {
        let n = 0;
        for (let cy = by; cy < Math.min(GH, by + span); cy++) for (let cx = bx; cx < Math.min(GW, bx + span); cx++) if (!grid[cy * GW + cx]) n++;
        if (!n || n < bn || (n === bn && !near)) continue;
        const x = Math.min(F.w - 40, (bx + span / 2) * CELL), y = Math.min(F.h - 40, (by + span / 2) * CELL);
        const distance = near ? Math.hypot(x - near.x, y - near.y) : 0;
        if (n > bn || distance < bestDistance) { bn = n; bestDistance = distance; best = { x, y, blank: n / (span * span) }; }
      }
      return best;
    },
    // How many painted cells lie within r of the horizontal line at y: moths pick the fullest lane.
    lanePainted(y, r) {
      const cy0 = Math.max(0, Math.floor((y - r) / CELL)), cy1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
      let n = 0;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = 0; cx < GW; cx++) n += grid[cy * GW + cx];
      return n;
    },
    // Nearest blank cell to (x, y); used by the automated player.
    nearestBlank(x, y) {
      let best = null, bd = 1e9;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i]) continue;
        const px = (i % GW + 0.5) * CELL, py = (Math.floor(i / GW) + 0.5) * CELL, d = Math.hypot(px - x, py - y);
        if (d < bd) { bd = d; best = { x: px, y: py, d }; }
      }
      return best;
    },
  };
})();
