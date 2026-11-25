// Everything that moves on the painting: the ink drop (player), flying ink, bookworms, particles.
// All positions are in field coordinates (0,0 is the painting's top-left corner).
window.MR = window.MR || {};

(function () {
  const F = MR.FIELD;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------- particles
  const parts = [], floats = [];
  function puff(x, y, n, o) {
    o = o || {};
    for (let i = 0; i < n && parts.length < 320; i++) {
      const a = o.ang !== undefined ? o.ang + rand(-0.6, 0.6) : rand(0, 6.283), v = rand(o.v0 || 30, o.v1 || 140);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(0.25, 0.6) * (o.life || 1), r: rand(1.2, 3.6) * (o.size || 1), kind: o.kind || 'ink' });
    }
  }
  function ring(x, y, r, life) { parts.push({ x, y, vx: 0, vy: 0, t: 0, life: life || 0.4, r, kind: 'ring' }); }
  function floatText(x, y, text, color) { floats.push({ x: clamp(x, 70, F.w - 70), y: Math.max(48, y), text, color: color || '#1b1714', t: 0 }); }

  function updateParts(dt) {
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 4 * dt; p.vy *= 1 - 4 * dt; }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t >= parts[i].life) parts.splice(i, 1);
    for (const f of floats) { f.t += dt; f.y -= 26 * dt; }
    for (let i = floats.length - 1; i >= 0; i--) if (floats[i].t >= 1.3) floats.splice(i, 1);
  }
  function drawParts(ctx) {
    for (const p of parts) {
      const k = p.t / p.life;
      if (p.kind === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.strokeStyle = '#1b1714'; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.3 + 0.7 * k), 0, 6.3); ctx.stroke();
      } else {
        ctx.globalAlpha = (1 - k) * (p.kind === 'ink' ? 0.85 : 0.9);
        ctx.fillStyle = p.kind === 'ink' ? '#1b1714' : p.kind === 'shard' ? '#96702f' : p.kind === 'ember' ? '#e8742c' : '#d8c59a';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 6.3); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawFloats(ctx) {
    ctx.textAlign = 'center';
    for (const f of floats) {
      ctx.globalAlpha = f.t < 0.9 ? 1 : 1 - (f.t - 0.9) / 0.4;
      ctx.font = '600 20px ' + MR.FONT_TEXT;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(244,236,214,0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- player
  function newPlayer() {
    return { x: F.w / 2, y: F.h / 2, vx: 0, vy: 0, dashT: 0, dashDir: { x: 1, y: 0 }, dashId: 0, dashLeft: 0, cd: 0, invuln: 0, sprayAcc: 0, trailAcc: 0, moved: 0, sprayed: 0, blots: 0, dashes: 0, t: 0, squish: 0, lastDir: { x: 0, y: -1 } };
  }
  // Where ink will land: the mouse position, pulled in to the throwing range and to the painting.
  function aimOf(p, reach) {
    const m = MR.input.mouse;
    let dx = m.x - F.x - p.x, dy = m.y - F.y - p.y;
    const d = Math.hypot(dx, dy) || 1, far = d > reach;
    const k = far ? reach / d : 1;
    const x = clamp(p.x + dx * k, 4, F.w - 4), y = clamp(p.y + dy * k, 4, F.h - 4);
    return { x, y, far, mx: m.x - F.x, my: m.y - F.y, dx: dx / d, dy: dy / d, dist: Math.hypot(x - p.x, y - p.y) };
  }

  function updatePlayer(G, dt) {
    const p = G.player, s = G.stats, ax = MR.input.axis();
    p.t += dt;
    p.cd = Math.max(0, p.cd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.stun = Math.max(0, (p.stun || 0) - dt);
    p.squish = Math.max(0, p.squish - dt * 3);
    const aim = p.aim = aimOf(p, G.reach);
    const ox = p.x, oy = p.y;

    if (p.cd <= 0 && p.cdWas > 0) MR.audio.play('dashReady');
    p.cdWas = p.cd;

    if (G.canAct && MR.input.rightPressed()) {
      if (p.cd <= 0 && p.dashT <= 0 && p.stun <= 0) {
        const d = Math.hypot(aim.mx - p.x, aim.my - p.y);
        p.dashDir = d > 12 ? { x: aim.dx, y: aim.dy } : { x: p.lastDir.x, y: p.lastDir.y };
        p.dashT = s.dashTime; p.cd = s.dashCooldown; p.dashId++; p.dashes++; p.dashLeft = 0;
        MR.audio.play('dash');
        ring(p.x, p.y, 46, 0.35);
        G.shake = Math.max(G.shake, 3);
      } else if (p.dashT <= 0) { MR.audio.play('dashNotReady'); p.cdNudge = 0.25; }
    }
    p.cdNudge = Math.max(0, (p.cdNudge || 0) - dt);

    if (p.dashT > 0) {
      const v = s.dashDist / s.dashTime;
      p.dashT -= dt;
      p.x += p.dashDir.x * v * dt; p.y += p.dashDir.y * v * dt;
      G.touchWash(p.x, p.y, ox, oy);
      p.vx = p.dashDir.x * s.speed; p.vy = p.dashDir.y * s.speed;
      p.dashLeft -= v * dt;
      if (p.dashLeft <= 0) { // one broad blot every few pixels makes a brush stroke
        p.dashLeft = s.dashR * 0.5;
        G.paint(clamp(p.x, 0, F.w), clamp(p.y, 0, F.h), s.dashR * rand(0.9, 1.1), { dark: 0.7 });
        puff(p.x, p.y, 2, { v0: 40, v1: 160 });
      }
      for (const w of G.worms) {
        if (w.state === 'flee' || w.state === 'warn' || w.dashId === p.dashId || w.def.flies) continue;
        if (Math.hypot(w.x - p.x, w.y - p.y) < s.dashR + w.def.radius) {
          w.dashId = p.dashId; G.shake = Math.max(G.shake, 5);
          if (w.shell) crackShell(G, w, p.x, p.y);
          else hitWorm(G, w, s.dashDamage, p.x, p.y, 34);
        }
      }
      if (G.king) MR.king.dashHit(G, p);
    } else {
      const k = Math.min(1, dt * 14);
      const v = s.speed * (p.stun > 0 ? 0.4 : 1);
      p.vx += (ax.x * v - p.vx) * k; p.vy += (ax.y * v - p.vy) * k;
      if (!G.canAct) { p.vx *= 0.8; p.vy *= 0.8; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (ax.x || ax.y) p.lastDir = { x: ax.x, y: ax.y };
    }
    p.x = clamp(p.x, 16, F.w - 16); p.y = clamp(p.y, 18, F.h - 14);

    const step = Math.hypot(p.x - ox, p.y - oy);
    p.moved += step; p.trailAcc += step;
    if (p.trailAcc > 11 && p.dashT <= 0) {
      p.trailAcc = 0;
      G.paint(p.x + rand(-3, 3), p.y + 8 + rand(-3, 3), s.trailR * rand(0.9, 1.15), { dark: 0.45 });
      MR.audio.play('step');
    }

    // a quick click counts too: it always throws at least one blot
    const clicked = MR.input.leftPressed() && !MR.ui.hovering();
    const spraying = G.canAct && (MR.input.mouse.left || clicked) && !MR.ui.captured() && p.dashT <= 0 && p.stun <= 0;
    if (spraying && clicked) p.sprayAcc = Math.max(p.sprayAcc, 1);
    MR.audio.setSpray(spraying);
    p.spraying = spraying;
    if (spraying && aim.far) {
      p.farT = (p.farT || 0) + dt;
      if (p.farT > 1.2) { p.farT = -3; floatText(aim.x, aim.y - 30, MR.t('tooFar'), '#a62c22'); }
    }
    if (spraying) {
      p.sprayed += dt;
      p.sprayAcc += dt * s.sprayRate;
      while (p.sprayAcc >= 1) {
        p.sprayAcc -= 1;
        const sc = (9 + Math.min(aim.dist, 700) * 0.075) * s.spread, a = rand(0, 6.283), rr = Math.sqrt(Math.random()) * sc;
        const tx = clamp(aim.x + Math.cos(a) * rr, 2, F.w - 2), ty = clamp(aim.y + Math.sin(a) * rr, 2, F.h - 2);
        const d = Math.hypot(tx - p.x, ty - p.y);
        p.blots++;
        G.drops.push({ sx: p.x, sy: p.y - 8, tx, ty, x: p.x, y: p.y - 8, t: 0, dur: clamp(d / 1000, 0.07, 0.8), r: s.blotR * nearBoost(d) * rand(0.85, 1.15), dmg: s.sprayDamage });
      }
      p.squish = Math.max(p.squish, 0.25);
    } else p.sprayAcc = Math.min(p.sprayAcc, 0.9);
  }

  function updateDrops(G, dt) {
    const s = G.stats;
    for (const d of G.drops) {
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      d.x = d.sx + (d.tx - d.sx) * k; d.y = d.sy + (d.ty - d.sy) * k;
      let hit = k >= 1;
      // ink that flies over a bookworm lands on it, so aiming past one still works
      for (const w of G.worms) {
        if (w.state === 'flee' || w.state === 'warn' || hit) continue;
        if (Math.hypot(w.x - d.x, w.y - d.y) < w.def.radius + 9) hit = true;
      }
      // the Bookworm King's body stops ink: only what lands on its tail end counts
      const part = G.king && !hit ? MR.king.partAt(G, d.x, d.y, 4) : null;
      if (part) hit = true;
      if (hit) {
        d.done = true;
        G.paint(d.x, d.y, d.r, { grow: s.bleed, time: s.bleedTime });
        G.touchWash(d.x, d.y);
        puff(d.x, d.y, 2, { v0: 20, v1: 90, size: 0.8 });
        MR.audio.play('blot');
        for (const w of G.worms) {
          if (w.state === 'flee' || w.state === 'warn' || Math.hypot(w.x - d.x, w.y - d.y) >= w.def.radius + d.r * 0.7 * G.generosity) continue;
          if (w.shell) bounce(G, w); else hitWorm(G, w, d.dmg, d.sx, d.sy, w.def.flies ? 2 : 5);
        }
        if (G.king) MR.king.inkHit(G, part || MR.king.partAt(G, d.x, d.y, d.r * 0.6), d.dmg);
      }
    }
    G.drops = G.drops.filter((d) => !d.done);
  }

  function drawPlayer(ctx, G) {
    const p = G.player, sp = MR.SPRITES.drop, aim = p.aim;
    if (!aim) return;
    const h = 54, w = h * sp.w / sp.h;
    if (G.canAct) {
      // how far the ink reaches: always drawn, so the limit is never a surprise
      ctx.strokeStyle = aim.far ? 'rgba(170,40,30,0.7)' : 'rgba(27,23,20,0.4)'; ctx.lineWidth = aim.far ? 3 : 2.5; ctx.setLineDash([5, 9]);
      ctx.beginPath(); ctx.arc(p.x, p.y, G.reach, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
      // dotted line to where the ink lands, and a ring there
      ctx.fillStyle = 'rgba(27,23,20,0.32)';
      const n = Math.max(2, Math.floor(aim.dist / 26));
      for (let i = 1; i < n; i++) { const k = i / n; ctx.beginPath(); ctx.arc(p.x + (aim.x - p.x) * k, p.y - 8 + (aim.y - p.y + 8) * k, 2.2, 0, 6.3); ctx.fill(); }
      const rr = G.stats.blotR * 0.75 * G.generosity * nearBoost(aim.dist) + (p.spraying ? Math.sin(p.t * 30) * 2 : 0);
      ctx.strokeStyle = aim.far ? 'rgba(170,40,30,0.75)' : 'rgba(27,23,20,0.7)';
      ctx.lineWidth = 2.5; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -p.t * 30;
      ctx.beginPath(); ctx.arc(aim.x, aim.y, rr, 0, 6.3); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(aim.x, aim.y, 3, 0, 6.3); ctx.fill();
      if (aim.far) { // the mouse is beyond the throwing range: show the gap
        ctx.strokeStyle = 'rgba(170,40,30,0.3)'; ctx.lineWidth = 2; ctx.setLineDash([3, 7]);
        ctx.beginPath(); ctx.moveTo(aim.x, aim.y); ctx.lineTo(aim.mx, aim.my); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // dash cooldown: an arc that closes around the drop
    if (p.cd > 0) {
      const k = 1 - p.cd / G.stats.dashCooldown;
      ctx.strokeStyle = 'rgba(27,23,20,0.18)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 36, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(166,44,34,0.8)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 36, -1.57, -1.57 + 6.283 * k); ctx.stroke();
    }
    // a pale halo so the black drop still reads on dark ink
    const hg = ctx.createRadialGradient(p.x, p.y, 14, p.x, p.y, 44);
    hg.addColorStop(0, 'rgba(250,244,226,0.85)'); hg.addColorStop(0.6, 'rgba(250,244,226,0.45)'); hg.addColorStop(1, 'rgba(250,244,226,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(p.x, p.y, 44, 0, 6.3); ctx.fill();
    // shadow
    ctx.fillStyle = 'rgba(20,16,12,0.22)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 22, 17, 7, 0, 0, 6.3); ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(p.t * 5) * 1.5);
    let sx = 1, sy = 1;
    const speed = Math.hypot(p.vx, p.vy) / G.stats.speed;
    if (p.dashT > 0) { ctx.rotate(Math.atan2(p.dashDir.y, p.dashDir.x) - Math.PI / 2 + Math.PI); sx = 0.78; sy = 1.4; }
    else { ctx.rotate(clamp(p.vx / G.stats.speed, -1, 1) * 0.22); sx = 1 + p.squish * 0.25 - speed * 0.04; sy = 1 - p.squish * 0.2 + speed * 0.06; }
    ctx.scale(sx, sy);
    if (p.invuln > 0 && Math.floor(p.t * 14) % 2) ctx.globalAlpha = 0.45;
    ctx.drawImage(MR.img.sprites, sp.x, sp.y, sp.w, sp.h, -w / 2, -h * 0.58, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (p.stun > 0) { // dizzy: stars going round
      ctx.fillStyle = '#a62c22';
      for (let i = 0; i < 3; i++) { const a = p.t * 7 + i * 2.09; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 24, p.y - 40 + Math.sin(a) * 7, 4, 0, 6.3); ctx.fill(); }
    }
  }

  function drawDrops(ctx, G) {
    ctx.fillStyle = '#1b1714';
    for (const d of G.drops) {
      const k = d.t / d.dur, lift = Math.sin(k * Math.PI) * Math.min(40, Math.hypot(d.tx - d.sx, d.ty - d.sy) * 0.16);
      ctx.beginPath(); ctx.arc(d.x, d.y - lift, 3.5 + Math.sin(k * Math.PI) * 2.5, 0, 6.3); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- bookworms
  function spawnWorm(G, type, from) {
    const def = MR.WORMS[type], p = G.player;
    let x, y, tries = 0;
    do { // somewhere on the edge of the painting, not right next to the player
      const side = (Math.random() * 4) | 0;
      x = side === 0 ? -50 : side === 1 ? F.w + 50 : rand(60, F.w - 60);
      y = side === 2 ? -50 : side === 3 ? F.h + 50 : rand(60, F.h - 60);
    } while (++tries < 12 && Math.hypot(x - p.x, y - p.y) < 380);
    if (from) { x = from.x; y = from.y; }
    const w = { type, def, x, y, ang: Math.atan2(F.h / 2 - y, F.w / 2 - x), hp: def.hp, shell: !!def.shell, state: 'crawl', target: null, retarget: 0, age: 0, flash: 0, slow: 0, eatAcc: 0, dashId: -1, entered: false, eaten: 0, sayT: 0, clang: 0 };
    if (def.flies) { // a moth: pick the lane with the most paint on it, come in from the side away from the drop
      let best = F.h / 2, bn = -1;
      for (let n = 0; n < 7; n++) { const ly = rand(70, F.h - 70), c = MR.Ink.lanePainted(ly, def.bite); if (c > bn) { bn = c; best = ly; } }
      w.dir = p.x < F.w / 2 ? -1 : 1;
      w.x = w.dir > 0 ? -70 : F.w + 70; w.y = w.lane = best; w.ang = w.dir > 0 ? 0 : Math.PI;
      w.state = 'warn'; w.warn = 1.7;
    }
    G.worms.push(w);
    return w;
  }

  // Ink is thickest close to the drop and thins out with distance: walking up to a blank patch
  // (or a bookworm) pays.
  function nearBoost(d) { return clamp(1.35 - d / 800, 0.85, 1.35); }

  function hitWorm(G, w, dmg, fromX, fromY, knock) {
    if (w.state === 'flee') return;
    w.hp -= dmg; w.flash = 0.16; w.slow = w.def.flies ? 0.25 : 0.6;
    const d = Math.hypot(w.x - fromX, w.y - fromY) || 1;
    w.x += (w.x - fromX) / d * knock; w.y += (w.y - fromY) / d * knock;
    MR.audio.play('hit');
    if (w.hp <= 0) driveOff(G, w, true);
  }

  // Ink on a shell does nothing, and says so.
  function bounce(G, w) {
    w.clang = 0.2;
    MR.audio.play('clang');
    if (w.sayT <= 0) { w.sayT = 2.2; G.tut.wormHint = { worm: w, key: 'tutGrub', t: 3 }; }
  }
  function crackShell(G, w, fromX, fromY) {
    w.shell = false; w.flash = 0.3; w.slow = 1.6;
    const d = Math.hypot(w.x - fromX, w.y - fromY) || 1;
    w.x += (w.x - fromX) / d * 30; w.y += (w.y - fromY) / d * 30;
    puff(w.x, w.y, 14, { kind: 'shard', v0: 120, v1: 340, size: 1.6, life: 1.3 });
    ring(w.x, w.y, 70, 0.4);
    MR.audio.play('crack');
    G.shake = Math.max(G.shake, 8);
  }

  function driveOff(G, w, byPlayer) {
    w.state = 'flee';
    const dl = w.x, dr = F.w - w.x, dt = w.y, db = F.h - w.y, m = Math.min(dl, dr, dt, db);
    w.exit = m === dl ? { x: -120, y: w.y } : m === dr ? { x: F.w + 120, y: w.y } : m === dt ? { x: w.x, y: -120 } : { x: w.x, y: F.h + 120 };
    if (!byPlayer) return;
    const r = w.def.burst * G.stats.burstMul;
    G.paint(clamp(w.x, 0, F.w), clamp(w.y, 0, F.h), r, { time: 0.9, dark: 0.6 });
    puff(w.x, w.y, 16, { v0: 80, v1: 300, size: 1.3 });
    ring(w.x, w.y, r, 0.5);
    MR.audio.play('pop');
    G.shake = Math.max(G.shake, w.def.burst > 100 ? 9 : 4);
    G.drove++; G.levelDrove++;
    floatText(w.x, w.y - 24, MR.t('drove') + ' +1', '#a62c22');
    if (G.stats.burstDamage > 0) { // Breaking Ink: the burst carries on to whatever stands in it
      for (const o of G.worms) {
        if (o === w || o.state === 'flee' || o.state === 'warn' || Math.hypot(o.x - w.x, o.y - w.y) > r + o.def.radius) continue;
        if (o.shell) crackShell(G, o, w.x, w.y); else hitWorm(G, o, G.stats.burstDamage, w.x, w.y, 20);
      }
    }
  }

  function eat(G, w, x, y) {
    const scale = G.finishWash && G.finishWash.active ? MR.FINISH_WASH.biteScale : 1;
    const cells = MR.Ink.erase(x, y, w.def.bite * (w.def.flies ? 1 : G.hunger) * scale);
    if (!cells) return;
    w.eaten += cells; puff(x, y, 1, { kind: 'crumb', v0: 20, v1: 70, size: 0.9 }); MR.audio.play('chomp');
    G.lostCells += cells; G.eatenCells += cells; if (w.def.flies) G.mothCells += cells;
    const onePercent = MR.Ink.GW * MR.Ink.GH / 100;
    if (G.lostCells >= onePercent) { G.lostCells -= onePercent; G.lossFlash = 1; floatText(x, y - 26, '-1%', '#a62c22'); }
  }

  function updateWorms(G, dt) {
    const p = G.player, gentle = !!G.level.tutorial || G.mode === 'title';
    for (const w of G.worms) {
      w.age += dt; w.flash = Math.max(0, w.flash - dt); w.slow = Math.max(0, w.slow - dt);
      w.sayT = Math.max(0, w.sayT - dt); w.clang = Math.max(0, w.clang - dt);
      if (w.state === 'flee') {
        const a = Math.atan2(w.exit.y - w.y, w.exit.x - w.x);
        w.ang = a;
        w.x += Math.cos(a) * 380 * dt; w.y += Math.sin(a) * 380 * dt;
        if (w.x < -90 || w.x > F.w + 90 || w.y < -90 || w.y > F.h + 90) w.gone = true;
        continue;
      }
      if (w.def.flies) { // a moth: announced, then straight across, dusting its lane blank
        if (w.state === 'warn') { w.warn -= dt; if (w.warn <= 0) { w.state = 'crawl'; MR.audio.play('moth'); } continue; }
        const v = w.def.speed * G.wormPace * (w.slow > 0 ? 0.45 : 1);
        w.x += w.dir * v * dt; w.y = w.lane + Math.sin(w.age * 2.2) * 16;
        w.eatAcc += dt;
        if (w.eatAcc > 0.08) { w.eatAcc = 0; eat(G, w, w.x, w.y); }
        if (w.dir > 0 ? w.x > F.w + 70 : w.x < -70) w.gone = true;
        continue;
      }
      const inside = w.x > 20 && w.x < F.w - 20 && w.y > 20 && w.y < F.h - 20;
      if (inside) w.entered = true;
      w.retarget -= dt;
      if (!w.target || w.retarget <= 0 || Math.hypot(w.target.x - w.x, w.target.y - w.y) < 22) {
        w.target = (!w.hunt && MR.Ink.paintedNear(w.x, w.y)) || { x: p.x, y: p.y };
        w.retarget = w.hunt ? 0.5 : rand(2, 3.5);
      }
      let want = Math.atan2(w.target.y - w.y, w.target.x - w.x);
      if (w.entered && !inside) want = Math.atan2(F.h / 2 - w.y, F.w / 2 - w.x);
      let da = want - w.ang;
      while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
      w.ang += clamp(da, -w.def.turn * dt, w.def.turn * dt);
      const hx = w.x + Math.cos(w.ang) * w.def.len * 0.36, hy = w.y + Math.sin(w.ang) * w.def.len * 0.36;
      const eating = MR.Ink.covered(hx, hy);
      const v = (eating && !w.hunt ? w.def.eatSpeed * G.hunger : w.def.speed) * (w.slow > 0 ? 0.3 : 1) * G.wormPace * (w.hunt ? 1.25 : 1);
      const wig = Math.sin(w.age * 7) * 0.18;
      w.x += Math.cos(w.ang + wig) * v * dt; w.y += Math.sin(w.ang + wig) * v * dt;
      w.eating = eating;
      if (eating) {
        w.eatAcc += dt;
        if (w.eatAcc > 0.09) {
          w.eatAcc = 0;
          eat(G, w, hx, hy);
          // in the first painting and on the lower difficulty rows a bookworm that has eaten its fill wanders off by itself
          if ((gentle || G.diff.calm) && w.eaten >= w.def.appetite) { driveOff(G, w, false); floatText(w.x, w.y - 24, MR.t('sated'), '#5a4e44'); }
        }
      }
      if (p.invuln <= 0 && p.dashT <= 0 && G.canAct && Math.hypot(w.x - p.x, w.y - p.y) < w.def.radius + 17) G.bite(w);
    }
    G.worms = G.worms.filter((w) => !w.gone);
  }

  function drawWorms(ctx, G) {
    const SL = 7, c = MR.ui.clock();
    for (const w of G.worms) {
      const sp = MR.SPRITES[w.def.sprite];
      if (w.def.flies) {
        // the lane it is about to cross, so there is time to get there
        if (w.state !== 'flee') {
          const a = w.state === 'warn' ? 0.35 + 0.35 * Math.sin(c * 14) : 0.22;
          ctx.strokeStyle = 'rgba(166,44,34,' + a + ')'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]); ctx.lineDashOffset = -c * 60 * w.dir;
          ctx.beginPath(); ctx.moveTo(w.dir > 0 ? Math.max(0, w.x) : Math.min(F.w, w.x), w.lane); ctx.lineTo(w.dir > 0 ? F.w : 0, w.lane); ctx.stroke(); ctx.setLineDash([]);
          if (w.state === 'warn') {
            const ex = w.dir > 0 ? 26 : F.w - 26;
            ctx.fillStyle = '#a62c22'; ctx.beginPath(); ctx.arc(ex, w.lane, 18 + Math.sin(c * 14) * 3, 0, 6.3); ctx.fill();
            ctx.fillStyle = '#fff3df'; ctx.font = '700 24px ' + MR.FONT_TEXT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', ex, w.lane + 1);
            continue;
          }
        }
        const h = w.def.len, wd = h * sp.w / sp.h, flap = 0.72 + 0.28 * Math.sin(w.age * 24);
        ctx.fillStyle = 'rgba(20,16,12,0.18)';
        ctx.beginPath(); ctx.ellipse(w.x + 6, w.y + 22, wd * 0.36 * flap, h * 0.3, 0, 0, 6.3); ctx.fill();
        ctx.save();
        ctx.translate(w.x, w.y); ctx.rotate((w.state === 'flee' ? w.ang + w.age * 9 : w.ang) + Math.PI / 2); ctx.scale(flap, 1);
        ctx.drawImage(MR.img.sprites, sp.x, sp.y, sp.w, sp.h, -wd / 2, -h / 2, wd, h);
        const inked = w.state === 'flee' ? 0.95 : Math.min(0.85, (1 - w.hp / w.def.hp) * 0.8 + (w.flash > 0 ? 0.6 : 0));
        if (inked > 0.02) { ctx.globalAlpha = inked; ctx.drawImage(MR.img.spritesInk, sp.x, sp.y, sp.w, sp.h, -wd / 2, -h / 2, wd, h); ctx.globalAlpha = 1; }
        ctx.restore();
        continue;
      }
      const len = w.def.len * (w.state === 'flee' ? 0.85 : 1), wd = len * sp.w / sp.h;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.fillStyle = 'rgba(250,244,226,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, len * 0.56, wd * 0.62, w.ang, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(20,16,12,0.22)';
      ctx.beginPath(); ctx.ellipse(3, 6, len * 0.42, wd * 0.36, w.ang, 0, 6.3); ctx.fill();
      ctx.rotate(w.ang + Math.PI / 2);
      const inked = w.state === 'flee' ? 0.95 : Math.min(0.85, (1 - w.hp / w.def.hp) * 0.8 + (w.flash > 0 ? 0.6 : 0));
      const amp = (w.state === 'flee' ? 4 : w.eating ? 1.2 : 2.4) * (w.def.len / 86), ph = w.age * (w.state === 'flee' ? 26 : 9);
      // the sprite is drawn in slices that sway from side to side, so the body wriggles
      for (let i = 0; i < SL; i++) {
        const sy = sp.y + sp.h * i / SL, sh = sp.h / SL, dy = -len / 2 + len * i / SL, off = Math.sin(ph - i * 0.9) * amp * (i / SL + 0.2);
        ctx.drawImage(MR.img.sprites, sp.x, sy, sp.w, sh, -wd / 2 + off, dy, wd, len / SL + 0.6);
        if (inked > 0.02) { ctx.globalAlpha = inked; ctx.drawImage(MR.img.spritesInk, sp.x, sy, sp.w, sh, -wd / 2 + off, dy, wd, len / SL + 0.6); ctx.globalAlpha = 1; }
      }
      if (w.shell) { // a bronze shell over its back: ink does nothing until a dash cracks it
        const rx = wd * 0.5, ry = len * 0.4;
        ctx.fillStyle = w.clang > 0 ? 'rgba(255,240,200,0.85)' : 'rgba(150,112,48,0.78)';
        ctx.strokeStyle = '#2a1d0c'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 4, rx, ry, 0, 0, 6.3); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(42,29,12,0.7)'; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) { const yy = 4 + i * ry * 0.36, xx = rx * Math.sqrt(Math.max(0, 1 - (i * 0.36) * (i * 0.36))); ctx.beginPath(); ctx.moveTo(-xx, yy); ctx.quadraticCurveTo(0, yy - 7, xx, yy); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,236,180,0.75)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(-rx * 0.22, 4 - ry * 0.2, rx * 0.5, ry * 0.62, 0, 3.4, 4.5); ctx.stroke();
      }
      ctx.restore();
    }
  }

  MR.ent = { newPlayer, updatePlayer, updateDrops, drawPlayer, drawDrops, spawnWorm, hitWorm, driveOff, updateWorms, drawWorms, updateParts, drawParts, drawFloats, puff, ring, floatText, nearBoost, clearFx() { parts.length = 0; floats.length = 0; } };
})();
