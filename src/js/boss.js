// The Bookworm King, the last level. A long body that follows its head across the scroll.
//   - Only the tail end takes ink (when the body is gone, the head). Everything else blocks it,
//     so the drop has to get behind the King or beside its tail.
//   - It crawls after the drop head first, so the tail is always on the far side of it.
//   - Every few seconds it stops, shows the lane it is about to charge down, and charges.
//     Being in the lane costs incense and leaves the drop dizzy; after a charge the King is
//     dazed for a moment with its body stretched out along the lane: the opening.
window.MR = window.MR || {};

(function () {
  const F = MR.FIELD, C = MR.KING;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const turnTo = (ang, want, max) => { let d = want - ang; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; return ang + clamp(d, -max, max); };

  function create(G) {
    const mul = G ? G.diff.king : 1, K = { segMax: C.segHp * mul, headMax: C.headHp * mul, x: F.w + 130, y: F.h * 0.32, ang: Math.PI, state: 'enter', t: 0, age: 0, segs: [], headHp: C.headHp * mul, headFlash: 0, trail: [],
      attack: C.attackEvery * 0.7, eatAcc: 0, sayT: 0, dashId: -1, hintTail: 30, hintCharge: 0, charges: 0, blocked: 0, total: C.segments + 1 };
    for (let i = 0; i < C.segments; i++) K.segs.push({ hp: K.segMax, flash: 0, x: K.x + (i + 1) * C.gap, y: K.y, ang: Math.PI });
    for (let d = (C.segments + 2) * C.gap; d >= 0; d -= 6) K.trail.push({ x: K.x + d, y: K.y });
    return K;
  }

  const lost = (K) => K.total - 1 - K.segs.length + (K.headHp <= 0 ? 1 : 0);
  // The one part that takes ink right now.
  function weak(K) {
    if (K.segs.length) { const s = K.segs[K.segs.length - 1]; return { kind: 'seg', i: K.segs.length - 1, x: s.x, y: s.y, r: C.segR, hp: s.hp, max: K.segMax }; }
    return { kind: 'head', x: K.x, y: K.y, r: C.headR, hp: K.headHp, max: K.headMax };
  }
  // Which part of the King covers (x, y), if any. The weak part wins where parts overlap.
  function partAt(G, x, y, pad) {
    const K = G.king;
    if (!K || K.state === 'dying') return null;
    const w = weak(K);
    if (Math.hypot(w.x - x, w.y - y) < w.r * 0.9 + pad) return w;
    if (Math.hypot(K.x - x, K.y - y) < C.headR * 0.85 + pad) return { kind: 'head', x: K.x, y: K.y, r: C.headR };
    for (let i = 0; i < K.segs.length; i++) { const s = K.segs[i]; if (Math.hypot(s.x - x, s.y - y) < C.segR * 0.85 + pad) return { kind: 'seg', i, x: s.x, y: s.y, r: C.segR }; }
    return null;
  }
  const isWeak = (K, part) => part.kind === 'head' ? !K.segs.length : part.i === K.segs.length - 1;

  function damage(G, K, dmg) {
    const E = MR.ent;
    MR.audio.play('hit');
    K.hintTail = Math.min(K.hintTail, 1.5); K.blocked = 0;
    if (K.segs.length) {
      const s = K.segs[K.segs.length - 1];
      s.hp -= dmg; s.flash = 0.16;
      if (s.hp > 0) return;
      K.segs.pop();
      const r = C.burst * G.stats.burstMul;
      G.paint(clamp(s.x, 0, F.w), clamp(s.y, 0, F.h), r, { time: 0.9, dark: 0.6 });
      E.puff(s.x, s.y, 22, { v0: 100, v1: 360, size: 1.5 }); E.ring(s.x, s.y, r, 0.55);
      E.floatText(s.x, s.y - 40, MR.t('kingSeg', { n: lost(K), total: K.total }), '#a62c22');
      MR.audio.play('kingHurt'); G.shake = Math.max(G.shake, 12);
      if (K.state !== 'charge') { K.state = 'hurt'; K.t = 0; }
      K.attack = Math.max(K.attack, 2.2);
      if (!K.segs.length) { K.hintHead = 7; }
      // it calls a bookworm to its side, which goes for the drop
      if (G.worms.filter((w) => w.state !== 'flee').length < 2) { const w = E.spawnWorm(G, 'silverfish'); w.hunt = true; MR.audio.play('arrive'); }
    } else {
      K.headHp -= dmg; K.headFlash = 0.16;
      if (K.headHp > 0) return;
      K.state = 'dying'; K.t = 0;
      E.puff(K.x, K.y, 40, { v0: 120, v1: 460, size: 1.8, life: 1.4 }); E.ring(K.x, K.y, 220, 0.8);
      E.floatText(K.x, K.y - 60, MR.t('kingDown'), '#a62c22');
      MR.audio.play('kingDie'); G.shake = 16;
      for (const w of G.worms) E.driveOff(G, w, false);
    }
  }

  // Ink landed on `part` (may be null).
  function inkHit(G, part, dmg) {
    const K = G.king;
    if (!K || !part || K.state === 'dying' || K.state === 'enter') return;
    if (K.state === 'hurt') return; // a moment's grace after losing a segment
    if (isWeak(K, part) || G.diff.soft) return damage(G, K, dmg); // the gentlest row: ink counts anywhere on it
    MR.audio.play('clang');
    if (++K.blocked > 40) { K.blocked = 0; K.hintTail = 6; } // still spraying the armour: show where the tail is again
    if (K.sayT <= 0) { K.sayT = 2.6; MR.ent.floatText(part.x, part.y - 50, MR.t('kingBlock'), '#7a5a1e'); }
  }
  function dashHit(G, p) {
    const K = G.king;
    if (!K || K.state === 'dying' || K.state === 'enter' || K.state === 'hurt' || K.dashId === p.dashId) return;
    const w = weak(K), any = G.diff.soft && partAt(G, p.x, p.y, G.stats.dashR);
    if (any || Math.hypot(w.x - p.x, w.y - p.y) < G.stats.dashR + w.r) { K.dashId = p.dashId; G.shake = Math.max(G.shake, 6); damage(G, K, C.dashHit); }
  }

  function placeBody(K) {
    // each segment sits a fixed distance back along the path the head took
    let acc = 0, n = 0, want = C.gap;
    for (let i = K.trail.length - 1; i > 0 && n < K.segs.length; i--) {
      const a = K.trail[i], b = K.trail[i - 1], d = Math.hypot(a.x - b.x, a.y - b.y);
      while (n < K.segs.length && acc + d >= want) {
        const k = d ? (want - acc) / d : 0, s = K.segs[n];
        s.x = a.x + (b.x - a.x) * k; s.y = a.y + (b.y - a.y) * k;
        s.ang = Math.atan2(a.y - b.y, a.x - b.x);
        n++; want += C.gap;
      }
      acc += d;
    }
  }

  function update(G, dt) {
    const K = G.king, p = G.player, Ink = MR.Ink, pace = G.wormPace;
    K.age += dt; K.t += dt; K.sayT = Math.max(0, K.sayT - dt); K.headFlash = Math.max(0, K.headFlash - dt);
    K.hintTail = Math.max(0, K.hintTail - dt); K.hintCharge = Math.max(0, K.hintCharge - dt); K.hintHead = Math.max(0, (K.hintHead || 0) - dt);
    for (const s of K.segs) s.flash = Math.max(0, s.flash - dt);
    const ox = K.x, oy = K.y;
    let speed = 0;
    if (K.state === 'enter') {
      speed = 150;
      if (K.x < F.w - 150) { K.state = 'roam'; K.t = 0; }
    } else if (K.state === 'roam') {
      // it stalks the drop head first, so its tail is always on the far side
      const dP = Math.hypot(p.x - K.x, p.y - K.y);
      K.ang = turnTo(K.ang, Math.atan2(p.y - K.y, p.x - K.x), C.turn * dt);
      speed = (C.speed + lost(K) * C.speedPerLoss) * pace * (dP < 70 ? 0.4 : 1);
      K.attack -= dt * pace * (G.diff.soft ? 0.5 : 1);
      if (K.attack <= 0 && G.canAct) {
        K.state = 'windup'; K.t = 0; K.charges++;
        if (K.charges <= 3) K.hintCharge = 3.2;
        MR.audio.play('kingWarn');
      }
    } else if (K.state === 'windup') {
      if (K.t < C.windup * 0.72) K.ang = turnTo(K.ang, Math.atan2(p.y - K.y, p.x - K.x), 6 * dt); // then the lane is fixed
      if (K.t >= C.windup) { K.state = 'charge'; K.t = 0; MR.audio.play('kingCharge'); G.shake = Math.max(G.shake, 6); }
    } else if (K.state === 'charge') {
      speed = C.chargeSpeed;
      const nx = K.x + Math.cos(K.ang) * 40, ny = K.y + Math.sin(K.ang) * 40;
      if (K.t >= C.chargeTime || nx < 20 || nx > F.w - 20 || ny < 20 || ny > F.h - 20) { K.state = 'dazed'; K.t = 0; MR.audio.play('kingDazed'); G.shake = Math.max(G.shake, 5); }
    } else if (K.state === 'dazed') {
      if (K.t >= C.dazed / Math.max(0.7, pace)) { K.state = 'roam'; K.t = 0; K.attack = C.attackEvery * rand(0.75, 1.1) / (1 + lost(K) * 0.07); }
    } else if (K.state === 'gloat') { // it has just bitten the drop: it rears up and lets it get away
      if (K.t >= C.gloat) { K.state = 'roam'; K.t = 0; K.attack = Math.max(K.attack, 1.5); }
    } else if (K.state === 'hurt') {
      if (K.t >= 0.9) { K.state = 'roam'; K.t = 0; }
    } else if (K.state === 'dying') {
      K.ang += dt * 14;
      if (K.t > 1.5) G.kingDefeated = true;
      return;
    }
    K.x += Math.cos(K.ang) * speed * dt; K.y += Math.sin(K.ang) * speed * dt;
    if (K.state !== 'enter') { K.x = clamp(K.x, 20, F.w - 20); K.y = clamp(K.y, 20, F.h - 20); }
    const last = K.trail[K.trail.length - 1];
    if (Math.hypot(K.x - last.x, K.y - last.y) >= 6) { K.trail.push({ x: K.x, y: K.y }); if (K.trail.length > 400) K.trail.splice(0, 100); }
    placeBody(K);
    // it eats whatever paint its head crosses
    K.eatAcc += dt;
    if (K.eatAcc > 0.08 && (K.x !== ox || K.y !== oy)) {
      K.eatAcc = 0;
      const cells = Ink.erase(K.x + Math.cos(K.ang) * 26, K.y + Math.sin(K.ang) * 26, C.bite);
      if (cells) { MR.audio.play('chomp'); MR.ent.puff(K.x, K.y, 1, { kind: 'crumb', v0: 20, v1: 70 }); }
    }
    if (p.invuln <= 0 && p.dashT <= 0 && G.canAct && Math.hypot(K.x - p.x, K.y - p.y) < C.headR + 12) {
      G.bite(K, K.state === 'charge' ? C.chargeCost : undefined, 110);
      p.invuln = 2.2;
      if (K.state === 'roam') { K.state = 'gloat'; K.t = 0; }
    }
  }

  function sprite(ctx, key, x, y, ang, h, inked, flash) {
    const sp = MR.KING_SPRITES[key], w = h * sp.w / sp.h;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.drawImage(MR.img.king, sp.x, sp.y, sp.w, sp.h, -w / 2, -h / 2, w, h);
    const a = Math.min(0.9, inked * 0.85 + (flash > 0 ? 0.55 : 0));
    if (a > 0.02) { ctx.globalAlpha = a; ctx.drawImage(MR.img.kingInk, sp.x, sp.y, sp.w, sp.h, -w / 2, -h / 2, w, h); }
    ctx.restore();
  }

  function draw(ctx, G) {
    const K = G.king, c = MR.ui.clock();
    if (!K) return;
    const dying = K.state === 'dying', k = dying ? Math.max(0, 1 - K.t / 1.5) : 1;
    // the lane it is about to charge down
    if (K.state === 'windup' || K.state === 'charge') {
      const len = C.chargeSpeed * C.chargeTime + 60, a = K.state === 'windup' ? 0.16 + 0.2 * (K.t / C.windup) + 0.08 * Math.sin(c * 30) : 0.2;
      ctx.save(); ctx.translate(K.x, K.y); ctx.rotate(K.ang);
      ctx.fillStyle = 'rgba(190,40,28,' + a + ')'; ctx.fillRect(0, -C.headR, len, C.headR * 2);
      ctx.strokeStyle = 'rgba(166,44,34,' + (a + 0.35) + ')'; ctx.lineWidth = 3; ctx.setLineDash([16, 10]); ctx.lineDashOffset = -c * 160;
      ctx.beginPath(); ctx.moveTo(0, -C.headR); ctx.lineTo(len, -C.headR); ctx.moveTo(0, C.headR); ctx.lineTo(len, C.headR); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(166,44,34,' + (a + 0.3) + ')';
      for (let i = 1; i <= 3; i++) { const x = len * i / 3.4; ctx.beginPath(); ctx.moveTo(x + 18, 0); ctx.lineTo(x - 8, -16); ctx.lineTo(x - 8, 16); ctx.fill(); }
      ctx.restore();
    }
    const w = dying ? null : weak(K);
    ctx.save();
    if (dying) ctx.globalAlpha = k;
    for (let i = K.segs.length - 1; i >= 0; i--) {
      const s = K.segs[i], tail = i === K.segs.length - 1, wob = Math.sin(K.age * 6 - i * 0.8) * 2;
      ctx.fillStyle = 'rgba(20,16,12,0.22)'; ctx.beginPath(); ctx.ellipse(s.x + 4, s.y + 8, C.segR * 0.95, C.segR * 0.7, 0, 0, 6.3); ctx.fill();
      sprite(ctx, tail ? 'kingTail' : 'kingSeg', s.x + Math.cos(s.ang + 1.57) * wob, s.y + Math.sin(s.ang + 1.57) * wob, s.ang, tail ? 96 : 84, tail ? 1 - s.hp / K.segMax : 0, s.flash);
    }
    const shake = K.state === 'windup' ? (Math.random() - 0.5) * 6 : 0;
    ctx.fillStyle = 'rgba(20,16,12,0.24)'; ctx.beginPath(); ctx.ellipse(K.x + 4, K.y + 10, C.headR, C.headR * 0.8, 0, 0, 6.3); ctx.fill();
    sprite(ctx, 'kingHead', K.x + shake, K.y + shake, K.ang, 112 * (dying ? 0.5 + 0.5 * k : 1), dying ? 1 : K.segs.length ? 0 : 1 - K.headHp / K.headMax, K.headFlash);
    ctx.restore();
    if (w) { // a ring on the part that takes ink
      const pulse = (c * 1.4) % 1;
      ctx.strokeStyle = 'rgba(166,44,34,' + (0.9 - pulse * 0.6) + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r + 8 + pulse * 16, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,236,190,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r + 6, -1.57, -1.57 + 6.283 * (w.hp / w.max)); ctx.stroke();
    }
    if (K.state === 'dazed') { // stars going round its head
      ctx.fillStyle = '#b08a4a'; ctx.strokeStyle = '#1b1714'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const a = c * 5 + i * 2.09, x = K.x + Math.cos(a) * 44, y = K.y - 44 + Math.sin(a) * 12; ctx.beginPath(); for (let j = 0; j < 10; j++) { const r = j % 2 ? 4 : 9, b = j * 0.628; ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
  }

  MR.king = { create, update, draw, partAt, inkHit, dashHit, weak, lost };
})();
