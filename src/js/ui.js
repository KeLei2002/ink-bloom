// On-screen buttons, the HUD, control prompts and the menu screens. Everything that is not
// WASD or a mouse button on the painting goes through a button drawn here.
window.MR = window.MR || {};

(function () {
  const F = MR.FIELD, W = MR.W, H = MR.H;
  MR.FONT_BRUSH = '"MRBrush", "KaiTi", "STKaiti", "Kaiti SC", serif';
  MR.FONT_TEXT = '"MRText", "Noto Serif SC", "Songti SC", "SimSun", serif';
  const INK = '#1b1714', PAPER = '#f1e8d2', RED = '#a62c22', RED_HI = '#c4392c', GOLD = '#b08a4a';
  const t = (k, v) => MR.t(k, v);

  // ------------------------------------------------------------- buttons (immediate mode)
  let rects = [], nextRects = [], hoverId = null, pressedId = null, clickedId = null, capture = false, releasing = false, clock = 0;

  function beginFrame(dt) {
    clock += dt;
    const m = MR.input.mouse;
    let h = null;
    for (const r of rects) if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) h = r.id;
    if (h && h !== hoverId) MR.audio.play('hover');
    hoverId = h;
    clickedId = null;
    if (MR.input.leftPressed()) { pressedId = hoverId; capture = !!hoverId; }
    if (MR.input.leftReleased()) {
      if (pressedId && pressedId === hoverId) { clickedId = pressedId; MR.audio.init(); MR.audio.play('click'); }
      pressedId = null; releasing = true;
    }
    nextRects = [];
  }
  function endFrame(canvas, crosshair) {
    rects = nextRects;
    if (releasing) { capture = false; releasing = false; }
    const m = MR.input.mouse;
    const inField = m.x > F.x && m.x < F.x + F.w && m.y > F.y && m.y < F.y + F.h;
    const want = hoverId ? 'pointer' : crosshair && inField ? 'crosshair' : 'default';
    if (canvas.style.cursor !== want) canvas.style.cursor = want;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // Draws a button and returns true on the frame it is clicked.
  //   o.kind  'primary' (red, for the one thing to do next) | 'plain' | 'hud'
  //   o.font  font size      o.pulse  draw an attention ring      o.brush  use the brush font
  function button(ctx, id, x, y, w, h, label, o) {
    o = o || {};
    nextRects.push({ id, x, y, w, h });
    const hover = hoverId === id, down = pressedId === id && hover, kind = o.kind || 'plain';
    const dy = down ? 2 : hover ? -1 : 0;
    ctx.save();
    if (o.pulse) {
      const k = (clock * 0.9) % 1;
      ctx.strokeStyle = 'rgba(166,44,34,' + (1 - k) * 0.7 + ')'; ctx.lineWidth = 3;
      roundRect(ctx, x - k * 14, y - k * 14, w + k * 28, h + k * 28, 12 + k * 10); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, x + 1, y + 4, w, h, 9); ctx.fill();
    const fill = kind === 'primary' ? (hover ? RED_HI : RED) : kind === 'hud' ? (hover ? '#fff8e6' : 'rgba(241,232,210,0.92)') : (hover ? '#fffaf0' : PAPER);
    ctx.fillStyle = down ? (kind === 'primary' ? '#8a2018' : '#dccfae') : fill;
    roundRect(ctx, x, y + dy, w, h, 9); ctx.fill();
    ctx.lineWidth = hover ? 3 : 2;
    ctx.strokeStyle = kind === 'primary' ? (hover ? '#ffe9c8' : '#5e1610') : (hover ? RED : INK);
    ctx.stroke();
    ctx.fillStyle = kind === 'primary' ? '#fff3df' : INK;
    ctx.font = (o.brush ? '' : '600 ') + (o.font || 17) + 'px ' + (o.brush ? MR.FONT_BRUSH : MR.FONT_TEXT);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + dy + (o.brush ? 2 : 1));
    ctx.restore();
    return clickedId === id;
  }

  // ------------------------------------------------------------- small drawing helpers
  function panel(ctx, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; roundRect(ctx, x + 3, y + 6, w, h, 14); ctx.fill();
    ctx.fillStyle = o.fill || 'rgba(243,235,215,0.97)'; roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(176,138,74,0.8)'; ctx.lineWidth = 1.2; roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 9); ctx.stroke();
    ctx.restore();
  }
  function keycap(ctx, x, y, s, ch, hot, dark) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, x, y + 3, s, s, s * 0.2); ctx.fill();
    ctx.fillStyle = hot ? RED : dark ? '#e9dfc6' : '#fbf6e8'; roundRect(ctx, x, y, s, s, s * 0.2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = hot ? '#fff3df' : INK; ctx.font = '700 ' + Math.round(s * 0.56) + 'px ' + MR.FONT_TEXT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x + s / 2, y + s / 2 + 1);
    ctx.restore();
  }
  function wasd(ctx, x, y, s, hot) { // x, y = top-left of a 3 x 2 block
    const g = s + 4;
    keycap(ctx, x + g, y, s, 'W', hot); keycap(ctx, x, y + g, s, 'A', hot); keycap(ctx, x + g, y + g, s, 'S', hot); keycap(ctx, x + 2 * g, y + g, s, 'D', hot);
  }
  // A mouse seen from above; which = 'left' | 'right' | 'move' marks the part to use.
  function mouseIcon(ctx, x, y, h, which, light) {
    const w = h * 0.64, r = w * 0.45;
    ctx.save();
    ctx.lineWidth = Math.max(1.6, h * 0.06); ctx.strokeStyle = light ? PAPER : INK;
    ctx.fillStyle = light ? 'rgba(241,232,210,0.14)' : '#fbf6e8';
    roundRect(ctx, x, y, w, h, r); ctx.fill();
    if (which === 'left' || which === 'right') {
      ctx.save();
      roundRect(ctx, x, y, w, h, r); ctx.clip();
      ctx.fillStyle = RED_HI;
      ctx.fillRect(which === 'left' ? x : x + w / 2, y, w / 2, h * 0.42);
      ctx.restore();
    }
    roundRect(ctx, x, y, w, h, r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.42); ctx.lineTo(x + w, y + h * 0.42); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h * 0.42); ctx.stroke();
    if (which === 'move') { // four little arrows around it
      ctx.fillStyle = light ? PAPER : INK;
      const cx = x + w / 2, cy = y + h / 2, d = h * 0.72, a = h * 0.13;
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([ux, uy]) => {
        const px = cx + ux * d * (ux ? 0.72 : 1), py = cy + uy * d;
        ctx.beginPath(); ctx.moveTo(px + ux * a, py + uy * a); ctx.lineTo(px - uy * a - ux * a * 0.2, py - ux * a - uy * a * 0.2); ctx.lineTo(px + uy * a - ux * a * 0.2, py + ux * a - uy * a * 0.2); ctx.fill();
      });
    }
    ctx.restore();
  }
  function seal(ctx, x, y, s, text, k) { // a red name seal, stamped: k goes 0 -> 1
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.08);
    const sc = k < 1 ? 1 + (1 - k) * 1.2 : 1; ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.fillStyle = RED; roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.12); ctx.fill();
    ctx.strokeStyle = '#f3e3c6'; ctx.lineWidth = s * 0.035; roundRect(ctx, -s / 2 + s * 0.07, -s / 2 + s * 0.07, s * 0.86, s * 0.86, s * 0.07); ctx.stroke();
    ctx.fillStyle = '#f7ead2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const chars = [...text];
    if (MR.lang === 'zh' && chars.length === 4) {
      ctx.font = Math.round(s * 0.36) + 'px ' + MR.FONT_BRUSH;
      [[0.22, -0.2], [0.22, 0.22], [-0.22, -0.2], [-0.22, 0.22]].forEach(([dx, dy], i) => ctx.fillText(chars[i], dx * s, dy * s));
    } else {
      let size = s * 0.42;
      ctx.font = Math.round(size) + 'px ' + MR.FONT_BRUSH;
      const tw = ctx.measureText(text).width;
      if (tw > s * 0.84) { size *= s * 0.84 / tw; ctx.font = Math.round(size) + 'px ' + MR.FONT_BRUSH; }
      ctx.fillText(text, 0, 2);
    }
    ctx.restore();
  }
  function text(ctx, s, x, y, size, o) {
    o = o || {};
    ctx.font = (o.brush ? '' : (o.weight || 500) + ' ') + size + 'px ' + (o.brush ? MR.FONT_BRUSH : MR.FONT_TEXT);
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    if (o.halo) { ctx.lineWidth = o.haloW || 5; ctx.strokeStyle = o.halo; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = o.color || INK;
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // A control prompt that floats next to the thing it is about.
  //   icon: 'wasd' | 'left' | 'right' | null. (x, y) is the point it points at, in screen pixels.
  function prompt(ctx, x, y, icon, title, sub, o) {
    o = o || {};
    ctx.save();
    ctx.font = '700 22px ' + MR.FONT_TEXT; const tw = ctx.measureText(title).width;
    ctx.font = '500 16px ' + MR.FONT_TEXT; const sw = sub ? ctx.measureText(sub).width : 0;
    const iw = icon === 'wasd' ? 112 : icon ? 48 : 0, ih = icon === 'wasd' ? 72 : icon ? 62 : 0;
    const w = Math.max(tw, sw) + iw + 44 + (icon ? 12 : 0), h = Math.max(sub ? 74 : 54, ih + 24);
    const below = y - h - 52 < F.y + 4 || (o.below && y + h + 60 < F.y + F.h);
    let px = Math.max(F.x + 8, Math.min(F.x + F.w - w - 8, x - w / 2));
    let py = below ? y + 50 : y - h - 50;
    py = Math.max(F.y + 6, Math.min(F.y + F.h - h - 6, py));
    const bob = Math.sin(clock * 4) * 3;
    py += bob;
    panel(ctx, px, py, w, h);
    // a little tail toward the subject
    const tx = Math.max(px + 24, Math.min(px + w - 24, x));
    ctx.fillStyle = 'rgba(243,235,215,0.97)'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (below) { ctx.moveTo(tx - 11, py + 1.5); ctx.lineTo(tx, py - 14); ctx.lineTo(tx + 11, py + 1.5); }
    else { ctx.moveTo(tx - 11, py + h - 1.5); ctx.lineTo(tx, py + h + 14); ctx.lineTo(tx + 11, py + h - 1.5); }
    ctx.fill(); ctx.stroke();
    const hot = Math.sin(clock * 6) > -0.3;
    if (icon === 'wasd') wasd(ctx, px + 20, py + (h - 68) / 2, 32, hot);
    else if (icon) mouseIcon(ctx, px + 24, py + (h - 58) / 2, 58, hot ? icon : 'none');
    const cx = px + 22 + iw + (icon ? 12 : 0);
    text(ctx, title, cx, py + (sub ? h / 2 - 13 : h / 2), 22, { align: 'left', weight: 700, color: o.color || INK });
    if (sub) text(ctx, sub, cx, py + h / 2 + 15, 16, { align: 'left', color: '#4a4038' });
    ctx.restore();
  }

  // ------------------------------------------------------------- HUD
  const NUM = '一二三四五六';
  const levelLabel = (G) => G.level.boss ? t(G.level.name) : t('level', { n: MR.lang === 'zh' ? NUM[G.levelIndex] : G.levelIndex + 1 }) + ' · ' + t(G.level.name);

  function hud(ctx, G, guide) {
    const L = G.level, pr = G.shownProgress, goal = L.goal;
    // top bar
    const g = ctx.createLinearGradient(0, 0, 0, 78);
    g.addColorStop(0, 'rgba(22,26,30,0.98)'); g.addColorStop(1, 'rgba(34,40,46,0.96)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 74);
    ctx.fillStyle = GOLD; ctx.fillRect(0, 73, W, 1.5);
    text(ctx, levelLabel(G), 48, 27, MR.lang === 'zh' ? 30 : 24, { align: 'left', brush: true, color: PAPER });
    text(ctx, t('time') + ' ' + mmss(G.time) + '  ·  ' + t('levelOf', { n: G.levelIndex + 1, total: MR.LEVELS.length }) + (G.diffIndex ? '  ·  ' + t(G.diff.name) : ''), 49, 56, 14, { align: 'left', color: 'rgba(241,232,210,0.7)' });

    // goal and progress: always on screen
    const I = G.incense, bx = 340, bw = 410, by = I ? 23 : 34, bh = I ? 18 : 24, tx = bx + bw + 16;
    if (L.boss) {
      // the King: one pip per part of its body, filled as each is inked black
      const K = G.king, total = MR.KING.segments + 1, done = G.mode === 'clear' || G.mode === 'end' ? total : K ? MR.king.lost(K) : 0;
      text(ctx, t('goalKing'), bx, 12, 13, { align: 'left', weight: 700, color: PAPER });
      for (let i = 0; i < total; i++) {
        const x = bx + i * (bw / total), w = bw / total - 6;
        ctx.fillStyle = i < done ? RED : '#e9dfc6'; roundRect(ctx, x, by, w, bh, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(241,232,210,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      text(ctx, done + ' / ' + total, tx, by + bh / 2 + 2, 30, { align: 'left', brush: true, color: PAPER });
    } else {
      text(ctx, t('goal') + ' ' + Math.round(goal * 100) + '%', bx, I ? 12 : 17, I ? 13 : 16, { align: 'left', weight: 700, color: PAPER });
      ctx.fillStyle = 'rgba(241,232,210,0.16)'; roundRect(ctx, bx - 3, by - 3, bw + 6, bh + 6, 8); ctx.fill();
      ctx.fillStyle = '#e9dfc6'; roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
      ctx.save();
      roundRect(ctx, bx, by, bw, bh, 6); ctx.clip();
      const done = pr >= goal;
      ctx.fillStyle = done ? RED : INK;
      ctx.fillRect(bx, by, bw * Math.min(1, pr), bh);
      // a soft wet edge at the head of the bar
      const ex = bx + bw * Math.min(1, pr);
      const eg = ctx.createLinearGradient(ex, 0, ex + 16, 0);
      eg.addColorStop(0, done ? 'rgba(166,44,34,0.6)' : 'rgba(27,23,20,0.55)'); eg.addColorStop(1, 'rgba(27,23,20,0)');
      ctx.fillStyle = eg; ctx.fillRect(ex, by, 16, bh);
      ctx.restore();
      const gx = bx + bw * goal;
      ctx.fillStyle = RED_HI; ctx.fillRect(gx - 1.5, by - 5, 3, bh + 10);
      ctx.beginPath(); ctx.moveTo(gx - 6, by - 9); ctx.lineTo(gx + 6, by - 9); ctx.lineTo(gx, by - 2); ctx.fill();
      const pop = 1 + G.progressPop * 0.25;
      ctx.save(); ctx.translate(tx, I ? by + bh / 2 + 2 : 46); ctx.scale(pop, pop);
      text(ctx, Math.floor(pr * 100 + 0.001) + '%', 0, 0, I ? 30 : 36, { align: 'left', brush: true, color: done ? '#ff9a80' : G.lossFlash > 0.05 ? '#ff6a55' : PAPER });
      ctx.restore();
      if (!I) text(ctx, t('restored'), tx, 17, 14, { align: 'left', color: 'rgba(241,232,210,0.75)' });
    }
    // the incense stick: when it burns out the painting is lost
    if (I) {
      const k = Math.max(0, I.left / I.total), y = 59, low = G.low > 0, hot = I.flash > 0.05 || (low && Math.sin(clock * 12) > 0);
      const bs = MR.KING_SPRITES.burner;
      ctx.drawImage(MR.img.king, bs.x, bs.y + bs.h * 0.48, bs.w, bs.h * 0.52, bx - 34, y - 14, 26, 26 * (bs.h * 0.52) / bs.w);
      ctx.fillStyle = 'rgba(241,232,210,0.16)'; roundRect(ctx, bx, y - 2, bw, 4, 2); ctx.fill(); // ash
      ctx.fillStyle = hot ? RED_HI : '#b9853c'; roundRect(ctx, bx, y - 4, Math.max(8, bw * k), 8, 4); ctx.fill();
      const ex = bx + Math.max(8, bw * k);
      if (I.lit && G.mode === 'play') {
        const gl = ctx.createRadialGradient(ex, y, 1, ex, y, 14);
        gl.addColorStop(0, 'rgba(255,190,90,0.95)'); gl.addColorStop(0.4, 'rgba(240,110,40,0.6)'); gl.addColorStop(1, 'rgba(240,110,40,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(ex, y, 14 + Math.sin(clock * 9) * 2, 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(241,232,210,0.3)';
        for (let i = 0; i < 3; i++) { const a = (clock * 0.7 + i / 3) % 1; ctx.beginPath(); ctx.arc(ex + Math.sin(a * 7 + i) * 4, y - 6 - a * 22, 2 + a * 3, 0, 6.3); ctx.globalAlpha = 1 - a; ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      const sc = 1 + I.flash * (I.lossTime > 0 ? 0.09 : 0.3);
      ctx.save(); ctx.translate(tx, y + 1); ctx.scale(sc, sc);
      text(ctx, G.diff.endless ? t('incenseEndless') : I.lit ? t('incense') + ' ' + mmss(Math.ceil(Math.max(0, I.left))) : t('incenseWait'), 0, 0, 15, { align: 'left', weight: 700, color: hot ? '#ff6a55' : PAPER });
      ctx.restore();
      if (I.lossTime > 0 && G.mode === 'play') {
        ctx.save(); ctx.globalAlpha = Math.min(1, I.lossTime / 0.28);
        ctx.fillStyle = '#8e372b'; roundRect(ctx, 882, 48, 52, 23, 5); ctx.fill();
        text(ctx, t('incenseDelta', { n: I.lossSecs }), 908, 60, 15, { weight: 700, color: '#fff4dc' });
        ctx.restore();
      }
    }

    // on-screen buttons: the only way to reach menu, sound and language
    if (button(ctx, 'menu', 938, 20, 86, 34, t('menu'), { kind: 'hud', font: 16 })) MR.game.openMenu();
    if (button(ctx, 'sound', 1034, 20, 104, 34, t(MR.audio.isMuted() ? 'soundOff' : 'soundOn'), { kind: 'hud', font: 15 })) MR.audio.toggleMute();
    if (button(ctx, 'lang', 1148, 20, 84, 34, t('langSwitch'), { kind: 'hud', font: 15 })) MR.game.toggleLang();

    // bottom legend: the four controls, lit once they have been introduced
    const p = G.player, known = G.known;
    const items = [
      { key: 'move', w: 0, draw(x, y, hot) { ['W', 'A', 'S', 'D'].forEach((c, i) => keycap(ctx, x + i * 27, y - 12, 24, c, hot, true)); return 108; }, label: t('kMove') },
      { key: 'aim', draw(x, y) { mouseIcon(ctx, x + 6, y - 14, 28, 'none', true); return 30; }, label: t('kAim') },
      { key: 'spray', draw(x, y, hot) { mouseIcon(ctx, x + 6, y - 14, 28, 'left', true); return 30; }, label: t('kSpray') },
      { key: 'dash', draw(x, y, hot) { mouseIcon(ctx, x + 6, y - 14, 28, 'right', true); return 30; }, label: t('kDash') },
    ];
    ctx.font = '600 16px ' + MR.FONT_TEXT;
    const gap = guide ? 18 : 44;
    let total = 0;
    for (const it of items) { it.lw = ctx.measureText(it.label).width; it.iw = it.key === 'move' ? 108 : 30; total += it.iw + 10 + it.lw + gap; }
    let x = guide ? W - F.x - 68 - (total - gap) : (W - total + gap) / 2;
    const y = 698;
    if (guide) {
      const left = F.x + 13;
      ctx.fillStyle = '#bc9561'; ctx.fillRect(F.x, y - 10, 3, 20);
      ctx.font = '600 18px ' + MR.FONT_TEXT;
      const size = Math.min(18, 18 * (x - left - 18) / Math.max(1, ctx.measureText(guide).width));
      text(ctx, guide, left, y, size, { align: 'left', weight: 600, color: '#fae7be' });
    }
    for (const it of items) {
      const on = known[it.key], hot = G.teaching === it.key && Math.sin(clock * 6) > -0.3;
      ctx.globalAlpha = on ? 1 : 0.28;
      it.draw(x, y, hot);
      text(ctx, it.label, x + it.iw + 10, y + 1, 16, { align: 'left', weight: 600, color: hot ? '#ffb39e' : PAPER });
      if (it.key === 'dash' && on) { // cooldown meter next to the dash label
        const k = p.cd > 0 ? 1 - p.cd / G.stats.dashCooldown : 1, mx = x + it.iw + 10 + it.lw + 10 + (p.cdNudge > 0 ? Math.sin(clock * 60) * 3 : 0);
        ctx.fillStyle = 'rgba(241,232,210,0.2)'; roundRect(ctx, mx, y - 5, 54, 10, 5); ctx.fill();
        ctx.fillStyle = k >= 1 ? '#f1e8d2' : RED_HI; roundRect(ctx, mx, y - 5, Math.max(10, 54 * k), 10, 5); ctx.fill();
      }
      ctx.globalAlpha = 1;
      x += it.iw + 10 + it.lw + gap;
    }
  }

  // ------------------------------------------------------------- screens
  function titleScreen(ctx, G) {
    // a patch of mist so the title reads over the painting
    const mg = ctx.createRadialGradient(W / 2, 330, 60, W / 2, 330, 430);
    mg.addColorStop(0, 'rgba(244,237,220,0.96)'); mg.addColorStop(0.55, 'rgba(244,237,220,0.82)'); mg.addColorStop(1, 'rgba(244,237,220,0)');
    ctx.fillStyle = mg; ctx.fillRect(F.x, F.y, F.w, F.h);
    const zh = MR.lang === 'zh';
    text(ctx, t('title'), W / 2, zh ? 232 : 236, zh ? 170 : 120, { brush: true });
    if (zh) text(ctx, 'Ink Bloom', W / 2, 330, 26, { color: '#5a4e44', weight: 500 });
    text(ctx, t('tagline'), W / 2, 378, zh ? 22 : 19, { color: '#2e2722', weight: 600 });
    if (button(ctx, 'start', W / 2 - 130, 420, 260, 84, t('start'), { kind: 'primary', brush: true, font: zh ? 50 : 44, pulse: true })) MR.game.startRun();
    text(ctx, '▲ ' + t('startHint'), W / 2, 530, 17, { color: RED, weight: 700 });
    const rec = MR.game.record();
    if (rec) text(ctx, t('titleBest') + (rec.grade ? '  ' + t(rec.grade) : '') + (rec.time ? '  ·  ' + mmss(rec.time) : ''), W / 2, 578, 17, { color: '#3a322c', weight: 700, halo: 'rgba(244,237,220,0.8)', haloW: 4 });
    text(ctx, t('credit'), W / 2, 652, 13, { color: '#5a4e44', halo: 'rgba(244,237,220,0.8)', haloW: 4 });
    // top bar with the two setting buttons
    ctx.fillStyle = 'rgba(22,26,30,0.98)'; ctx.fillRect(0, 0, W, 74);
    ctx.fillStyle = GOLD; ctx.fillRect(0, 73, W, 1.5);
    text(ctx, t('title'), 48, 37, zh ? 30 : 26, { align: 'left', brush: true, color: PAPER });
    if (button(ctx, 'sound', 1034, 20, 104, 34, t(MR.audio.isMuted() ? 'soundOff' : 'soundOn'), { kind: 'hud', font: 15 })) { MR.audio.init(); MR.audio.toggleMute(); }
    if (button(ctx, 'lang', 1148, 20, 84, 34, t('langSwitch'), { kind: 'hud', font: 15 })) MR.game.toggleLang();
  }

  function dim(ctx, a) { ctx.fillStyle = 'rgba(20,18,16,' + a + ')'; ctx.fillRect(0, 0, W, H); }

  function pauseScreen(ctx, G) {
    dim(ctx, 0.55);
    const w = 440, h = G.pauseReason === 'blur' ? 230 : 430, x = (W - w) / 2, y = (H - h) / 2;
    panel(ctx, x, y, w, h);
    text(ctx, t('paused'), W / 2, y + 56, 46, { brush: true });
    if (G.pauseReason === 'blur') {
      if (button(ctx, 'resume', x + 60, y + 110, w - 120, 60, t('resume'), { kind: 'primary', font: 22, pulse: true })) MR.game.closeMenu();
      text(ctx, t('clickToResume'), W / 2, y + 196, 15, { color: '#5a4e44' });
      return;
    }
    if (button(ctx, 'resume', x + 60, y + 104, w - 120, 60, t('resume'), { kind: 'primary', font: 22 })) MR.game.closeMenu();
    if (button(ctx, 'restart', x + 60, y + 180, w - 120, 52, t('restartLevel'), { font: 19 })) MR.game.restartLevel();
    if (button(ctx, 'difficulty', x + 60, y + 246, w - 120, 52, t('difficulty') + '：' + t(G.diff.name), { font: 19 })) MR.game.cycleDifficulty();
    text(ctx, t('diffNote'), W / 2, y + 314, 14, { color: '#5a4e44' });
    if (button(ctx, 'totitle', x + 60, y + 340, w - 120, 52, t('toTitle'), { font: 19 })) MR.game.goTitle();
  }

  // The incense burned out. Start this painting again; after losing it twice the easier setting is put forward.
  function failScreen(ctx, G) {
    const k = G.failT;
    dim(ctx, Math.min(0.5, k * 0.5));
    if (k < 1.0) return;
    // Every lower difficulty row gets a button. After two losses of one painting (one, once the
    // difficulty has already been lowered) the game puts the next row forward itself.
    const a = Math.min(1, (k - 1.0) / 0.35), D = MR.DIFFICULTY, lower = D.slice(G.diffIndex + 1);
    const push = lower.length > 0 && (G.fails >= 2 || (G.diffIndex > 0 && G.fails >= 1));
    const w = 640, h = 296 + (push ? 32 : 0) + (lower.length ? 12 : 0) + lower.length * 56, x = (W - w) / 2, y = Math.max(96, 360 - h / 2 + 20) + (1 - a) * 20;
    ctx.globalAlpha = a;
    panel(ctx, x, y, w, h);
    const bs = MR.KING_SPRITES.burner;
    ctx.drawImage(MR.img.king, bs.x, bs.y, bs.w, bs.h, x + 34, y + 26, 52, 52 * bs.h / bs.w);
    text(ctx, t('failTitle'), W / 2, y + 54, MR.lang === 'zh' ? 46 : 38, { brush: true, color: RED });
    const K = G.king;
    text(ctx, G.level.boss ? t('failLineKing', { n: K ? MR.king.lost(K) : 0, total: MR.KING.segments + 1 }) : t('failLine', { pct: Math.floor(G.failProgress * 100), goal: Math.round(G.level.goal * 100) }), W / 2, y + 102, 19, { color: '#3a322c', weight: 600 });
    text(ctx, t('failOnly'), W / 2, y + 132, 15, { color: '#5a4e44' });
    wrap(ctx, t(G.failTip), W / 2, y + 168, w - 90, 17, 24, RED);
    ctx.globalAlpha = 1;
    if (a < 1) return;
    let by = y + 212;
    if (push) { text(ctx, t('failOffer'), W / 2, by + 8, 16, { color: '#3a322c', weight: 700 }); by += 32; }
    if (button(ctx, 'retry', W / 2 - 160, by, 320, 58, t('retry'), { kind: push ? 'plain' : 'primary', font: 22, pulse: !push })) MR.game.retry();
    by += 70;
    lower.forEach((row, i) => {
      const main = push && i === 0, label = t('easier', { name: t(row.name) }) + (row.endless ? t('noLose') : '');
      if (button(ctx, i ? 'easier' + (i + 1) : 'easier', W / 2 - 160, by, 320, main ? 54 : 44, label, { kind: main ? 'primary' : 'plain', font: main ? 20 : 16, pulse: main })) MR.game.retryEasier(i + 1);
      by += main ? 64 : 54;
    });
  }

  function clearScreen(ctx, G) {
    const k = G.clearT;
    if (k > 0.7) seal(ctx, F.x + F.w - 120, F.y + F.h - 110, 120, t('cleared'), Math.min(1, (k - 0.7) / 0.25));
    if (k < 1.2) return;
    const a = Math.min(1, (k - 1.2) / 0.4), w = 600, h = 226, x = (W - w) / 2, y = 236 + (1 - a) * 20, I = G.incense, boss = G.level.boss;
    ctx.globalAlpha = a;
    panel(ctx, x, y, w, h);
    text(ctx, boss ? t('kingCleared') : t('level', { n: MR.lang === 'zh' ? NUM[G.levelIndex] : G.levelIndex + 1 }) + ' · ' + t('cleared'), W / 2, y + 50, MR.lang === 'zh' ? 40 : 32, { brush: true });
    text(ctx, boss ? t('kingClearedSub') : t('clearedSub', { goal: Math.round(G.level.goal * 100) }), W / 2, y + 90, 17, { color: '#4a4038' });
    text(ctx, t('time') + ' ' + mmss(G.time) + (I && !G.diff.endless ? '   ·   ' + t('incenseLeft') + ' ' + mmss(Math.floor(Math.max(0, I.left))) : '') + '   ·   ' + t('endWorms') + ' ' + G.levelDrove + (t('unitWorm') ? ' ' + t('unitWorm') : ''), W / 2, y + 122, 18, { color: '#4a4038', weight: 600 });
    ctx.globalAlpha = 1;
    if (a >= 1 && button(ctx, 'next', W / 2 - 110, y + 150, 220, 56, t('next') + '  →', { kind: 'primary', font: 22, pulse: true })) MR.game.afterClear();
  }

  function brushIcon(ctx, kind, x, y) { // a small picture of what each technique does
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    const st = (i, px, py, r, a) => { ctx.globalAlpha = a; const s = (r * 2) / 128 / 0.78; ctx.drawImage(MR.Ink.stamp(i), px - 64 * s, py - 64 * s, 128 * s, 128 * s); };
    if (kind === 'splash') { st(0, 0, 0, 44, 0.95); st(1, -52, 26, 17, 0.9); st(2, 50, -30, 14, 0.9); st(3, 44, 34, 9, 0.9); st(4, -40, -36, 8, 0.9); }
    else if (kind === 'flying') {
      for (let i = 0; i < 9; i++) st(i, -62 + i * 15, 14 - i * 3.4, 17 - Math.abs(i - 3) * 1.1, 0.9);
      ctx.globalAlpha = 1; ctx.strokeStyle = '#f3ebd7'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-20 + i * 4, 10 - i * 5); ctx.lineTo(66, -14 - i * 5); ctx.stroke(); }
    } else if (kind === 'wash') { st(0, 0, 0, 22, 0.95); [34, 46, 58].forEach((r, i) => { st(i + 1, 0, 0, r, 0.22 - i * 0.05); }); }
    else if (kind === 'reach') { // the drop in the middle of a wider circle
      st(0, 0, 0, 13, 0.95); ctx.globalAlpha = 1;
      ctx.lineWidth = 2; ctx.setLineDash([3, 7]); ctx.strokeStyle = 'rgba(27,23,20,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 6.3); ctx.stroke();
      ctx.setLineDash([5, 7]); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 58, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = RED; [0, 1.57, 3.14, 4.71].forEach((a) => { const c = Math.cos(a), sn = Math.sin(a); ctx.beginPath(); ctx.moveTo(c * 52, sn * 52); ctx.lineTo(c * 40 - sn * 6, sn * 40 + c * 6); ctx.lineTo(c * 40 + sn * 6, sn * 40 - c * 6); ctx.fill(); });
    } else if (kind === 'scorch') { // one dense black blot on a bookworm
      const sp = MR.SPRITES.silverfish; ctx.globalAlpha = 1;
      ctx.save(); ctx.rotate(1.1); ctx.drawImage(MR.img.sprites, sp.x, sp.y, sp.w, sp.h, -17, -54, 34, 108); ctx.globalAlpha = 0.6; ctx.drawImage(MR.img.spritesInk, sp.x, sp.y, sp.w, sp.h, -17, -54, 34, 108); ctx.restore();
      st(2, 4, -2, 24, 1); st(3, 6, 0, 16, 1);
    } else if (kind === 'burst') { // a burst with spokes
      st(0, 0, 0, 30, 0.95); ctx.globalAlpha = 1; ctx.lineWidth = 5;
      for (let i = 0; i < 10; i++) { const a = i * 0.628 + 0.2, r0 = 38, r1 = i % 2 ? 54 : 64; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); }
    } else if (kind === 'incense') { // the burner with a taller stick
      const bs = MR.KING_SPRITES.burner; ctx.globalAlpha = 1;
      ctx.drawImage(MR.img.king, bs.x, bs.y, bs.w, bs.h, -38, -66, 76, 76 * bs.h / bs.w);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function chooseScreen(ctx, G) {
    dim(ctx, 0.5);
    text(ctx, t('choose'), W / 2, 150, MR.lang === 'zh' ? 54 : 44, { brush: true, color: PAPER });
    text(ctx, '▼ ' + t('chooseSub'), W / 2, 200, 18, { color: '#ffb39e', weight: 700 });
    const ids = G.offer, cw = 290, ch = 330, gap = 36, x0 = (W - (cw * ids.length + gap * (ids.length - 1))) / 2, y = 232;
    ids.forEach((id, i) => {
      const b = MR.BRUSHES[id], x = x0 + i * (cw + gap), picked = G.picked === id;
      // the pointer is still where the Continue button was: no card lights up or can be picked until it moves or a moment passes
      const live = G.chooseT > 0.7 || (G.chooseMoved && G.chooseT > 0.25);
      const hover = live && hoverId === 'brush-' + id;
      const lift = picked ? -10 : hover ? -8 : 0;
      nextRects.push({ id: 'brush-' + id, x, y, w: cw, h: ch });
      ctx.save(); ctx.translate(0, lift);
      panel(ctx, x, y, cw, ch, { fill: hover || picked ? '#fffaf0' : 'rgba(243,235,215,0.97)' });
      if (hover || picked) { ctx.strokeStyle = RED; ctx.lineWidth = 4; roundRect(ctx, x - 3, y - 3, cw + 6, ch + 6, 16); ctx.stroke(); }
      brushIcon(ctx, id, x + cw / 2, y + 100);
      text(ctx, t(b.name), x + cw / 2, y + 208, MR.lang === 'zh' ? 50 : 36, { brush: true });
      wrap(ctx, t(b.desc), x + cw / 2, y + 258, cw - 50, 17, 24);
      ctx.restore();
      if (picked) seal(ctx, x + cw - 50, y + 46 + lift, 60, t('brushGot'), Math.min(1, G.pickT / 0.2));
      if (live && clickedId === 'brush-' + id && !G.picked) MR.game.pickBrush(id);
    });
    // what the player already carries
    if (G.brushes.length) text(ctx, t('brushHave') + '：' + G.brushes.map((b) => t(MR.BRUSHES[b].name)).join('、'), W / 2, y + ch + 40, 17, { color: PAPER, weight: 600 });
  }
  function wrap(ctx, s, x, y, maxW, size, lh, color) {
    ctx.font = '500 ' + size + 'px ' + MR.FONT_TEXT;
    const words = MR.lang === 'zh' ? [...s] : s.split(' '), sep = MR.lang === 'zh' ? '' : ' ';
    let line = '', lines = [];
    for (const w of words) { const test = line ? line + sep + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
    lines.push(line);
    lines.forEach((l, i) => text(ctx, l, x, y + i * lh, size, { color: color || '#3a322c', weight: color ? 700 : 500 }));
  }

  // The ending: the four paintings hung side by side, the grade, the numbers worth beating.
  function endScreen(ctx, G) {
    dim(ctx, 0.55);
    const w = 1060, h = 548, x = (W - w) / 2, y = 92, zh = MR.lang === 'zh', k = G.endT;
    panel(ctx, x, y, w, h);
    text(ctx, t('endTitle'), W / 2, y + 54, zh ? 54 : 42, { brush: true });
    text(ctx, t('endLine'), W / 2, y + 100, 18, { color: '#4a4038', weight: 600 });
    const n = MR.LEVELS.length, tw = 216, th = 108, gap = 28, x0 = W / 2 - (n * tw + (n - 1) * gap) / 2, ty = y + 150;
    MR.LEVELS.forEach((L, i) => {
      const a = clamp01((k - 0.3 - i * 0.25) / 0.4), tx = x0 + i * (tw + gap), dy = (1 - a) * -30;
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, dy);
      // a hanging scroll: cord, rod, silk mount, the painting
      ctx.strokeStyle = '#5a4e44'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tx + tw / 2 - 40, ty - 12); ctx.lineTo(tx + tw / 2, ty - 26); ctx.lineTo(tx + tw / 2 + 40, ty - 12); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(tx - 6, ty - 8, tw + 16, th + 26);
      ctx.fillStyle = '#39424a'; ctx.fillRect(tx - 9, ty - 12, tw + 18, th + 24);
      ctx.fillStyle = GOLD; ctx.fillRect(tx - 14, ty - 14, tw + 28, 5); ctx.fillRect(tx - 14, ty + th + 9, tw + 28, 6);
      ctx.drawImage(MR.img[L.painting], tx, ty, tw, th);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(tx, ty, tw, th);
      ctx.restore();
      ctx.globalAlpha = a;
      text(ctx, t(L.name) + '  ' + mmss(G.levelTimes[i] || 0), tx + tw / 2, ty + th + 34, 15, { color: '#4a4038', weight: 600 });
      ctx.globalAlpha = 1;
    });
    const ry = y + 338, cols = [-390, -210, -30, 150];
    const cell = (cx, label, value, red) => { text(ctx, label, W / 2 + cx, ry, 15, { color: red ? RED : '#5a4e44', weight: red ? 700 : 500 }); text(ctx, value, W / 2 + cx, ry + 36, 40, { brush: true, color: red ? RED : INK }); };
    cell(cols[0], t(G.retries > 0 ? 'endTimeAll' : 'endTime'), mmss(G.totalTime), true);
    cell(cols[1], t('endRetries'), String(G.retries) + (t('unitTimes') ? ' ' + t('unitTimes') : ''));
    cell(cols[2], t('endWorms'), G.drove + (t('unitWorm') ? ' ' + t('unitWorm') : ''));
    cell(cols[3], G.newBest ? t('endNewBest') : t('endBest'), G.best ? mmss(G.best) : '-');
    if (!G.best && G.maxDiff > 0) text(ctx, t('endBestNone'), W / 2 + cols[3], ry + 66, 13, { color: '#5a4e44' });
    // the grade, stamped
    const sk = clamp01((k - 1.5) / 0.3);
    text(ctx, t('endGrade'), W / 2 + 390, ry - 16, 15, { color: '#5a4e44' });
    if (sk > 0) seal(ctx, W / 2 + 390, ry + 46, 100, t(G.grade), sk);
    text(ctx, t(G.grade + 'Note') + (G.maxDiff ? '  ' + t('endDiff', { name: t(MR.DIFFICULTY[G.maxDiff].name) }) : ''), W / 2, ry + 96, 15, { color: '#4a4038' });
    if (button(ctx, 'replay', W / 2 - 230, y + 458, 260, 62, t('replay'), { kind: 'primary', font: 24, pulse: true })) MR.game.startRun();
    if (button(ctx, 'totitle', W / 2 + 50, y + 463, 180, 52, t('toTitle'), { font: 18 })) MR.game.goTitle();
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  MR.ui = { beginFrame, endFrame, button, mouseIcon, roundRect, captured: () => capture, hovering: () => hoverId, prompt, hud, titleScreen, pauseScreen, clearScreen, failScreen, chooseScreen, endScreen, levelLabel, text, seal, panel, mmss, clock: () => clock, rects: () => rects };
})();
