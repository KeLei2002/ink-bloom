// Rules, flow between screens, and the main loop.
//   title -> play -> clear -> choose a technique -> play ... -> the Bookworm King -> end
//                 \-> fail (the incense burned out) -> the same painting again, perhaps on an easier setting
// The flow walks MR.LEVELS, so adding a painting does not change this file's shape.
window.MR = window.MR || {};

(function () {
  const F = MR.FIELD, W = MR.W, H = MR.H, Ink = MR.Ink, E = MR.ent, UI = MR.ui;
  const q = new URLSearchParams(location.search);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let canvas, ctx, bg, last = 0;

  const G = MR.G = {
    mode: 'boot', paused: false, pauseReason: '', fade: 1,
    levelIndex: 0, level: MR.LEVELS[0], stats: null, brushes: [],
    time: 0, totalTime: 0, levelTimes: [], levelSpare: [], drove: 0, levelDrove: 0, best: 0, newBest: false, grade: null,
    diffIndex: 0, diff: MR.DIFFICULTY[0], maxDiff: 0, fails: 0, retries: 0, failTip: '', offer: [],
    incense: null, low: 0, reach: MR.BASE_STATS.range, king: null, kingDefeated: false, finishWash: null,
    player: E.newPlayer(), worms: [], drops: [], shake: 0, canAct: false, wormPace: 1, activity: 1, generosity: 1, carry: 1,
    shownProgress: 0, progressPop: 0, lostCells: 0, eatenCells: 0, mothCells: 0, lossFlash: 0, noteStep: 0, milestone: 0,
    known: { move: false, aim: false, spray: false, dash: false }, teaching: null,
    tut: { step: 'free', t: 0 }, spawn: null, hint: { base: 0, idle: 0, target: null, every: 0 },
    banner: 0, clearT: 0, picked: null, pickT: 0, titleT: 0,
    // every blot goes through here so progress sounds stay in one place
    paint(x, y, r, o) {
      Ink.blot(x, y, r * G.generosity, o);
      const step = Math.floor(Ink.progress * 50);
      if (step > G.noteStep) { G.noteStep = step; if (G.mode === 'play') { MR.audio.play('bloom', { step }); G.progressPop = 1; } }
    },
    // Both a landed blot and a dash crossing the ring count, even between animation frames.
    touchWash(x, y, fromX = x, fromY = y) {
      const wash = G.finishWash;
      if (!wash || !wash.target || G.mode !== 'play') return;
      const target = wash.target, dx = x - fromX, dy = y - fromY;
      const t = clamp(((target.x - fromX) * dx + (target.y - fromY) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      if (Math.hypot(fromX + t * dx - target.x, fromY + t * dy - target.y) > MR.FINISH_WASH.hitRadius) return;
      wash.target = null;
      wash.delay = MR.FINISH_WASH.nextDelay;
      // The bonus has a fixed size even in the adaptive tutorial.
      Ink.blot(target.x, target.y, MR.FINISH_WASH.bloomRadius, { time: 0.9, dark: 0.22 });
      E.ring(target.x, target.y, MR.FINISH_WASH.bloomRadius, 0.7);
      MR.audio.play('bloom', { step: Math.floor(Ink.progress * 50) });
    },
    // A bookworm (or the King) reached the drop: a shove, a patch of paint gone, and, once the
    // incense is burning, a few seconds of it knocked off. The drop itself cannot die.
    bite(w, cost, shove) {
      const p = G.player, d = Math.hypot(p.x - w.x, p.y - w.y) || 1, push = shove || 52;
      p.invuln = 1.3; p.squish = 1;
      p.x = clamp(p.x + (p.x - w.x) / d * push, 16, F.w - 16); p.y = clamp(p.y + (p.y - w.y) / d * push, 18, F.h - 14);
      if (!shove) { w.slow = 1.1; w.x -= (p.x - w.x) / d * 14; w.y -= (p.y - w.y) / d * 14; }
      Ink.erase((p.x + w.x) / 2, (p.y + w.y) / 2, 34);
      E.puff(p.x, p.y, 8, { kind: 'crumb', v0: 40, v1: 180 });
      const I = G.incense, sec = G.diff.endless ? 0 : cost === undefined ? G.diff.bite : cost;
      if (I && I.lit && sec > 0) {
        I.left = Math.max(0.01, I.left - sec); I.flash = 1; I.lossSecs = sec; I.lossTime = 1.8; G.bites++;
        E.puff(p.x, p.y - 20, 6, { kind: 'ember', v0: 40, v1: 160 });
      } else E.floatText(p.x, p.y + 42, MR.t('bitten'), '#a62c22');
      // only a charge knocks the drop dizzy; after an ordinary bite it can walk or dash away at once
      if (shove && cost !== undefined) { p.stun = MR.KING.stun; E.floatText(p.x, p.y - 66, MR.t('stunned'), '#a62c22'); }
      MR.audio.play('bite');
      G.shake = Math.max(G.shake, shove ? 12 : 6);
    },
  };

  function computeStats() {
    const s = Object.assign({}, MR.BASE_STATS);
    for (const id of G.brushes) MR.BRUSHES[id].apply(s);
    return s;
  }

  // The backdrop for one painting: silk mount, the worm-eaten blank paper, and the faintest ghost
  // of the picture so there is always a promise of what is under the ink.
  function makeBackground(img) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b333b'); g.addColorStop(1, '#20262c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(210,190,150,0.05)'; x.lineWidth = 1;
    for (let i = -H; i < W + H; i += 26) { // a quiet damask lattice
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke();
      x.beginPath(); x.moveTo(i + H, 0); x.lineTo(i, H); x.stroke();
    }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(F.x - 4, F.y - 2, F.w + 12, F.h + 12);
    x.fillStyle = '#b08a4a'; x.fillRect(F.x - 7, F.y - 7, F.w + 14, F.h + 14);
    x.fillStyle = '#1b1714'; x.fillRect(F.x - 3, F.y - 3, F.w + 6, F.h + 6);
    x.drawImage(MR.img.paper, F.x, F.y, F.w, F.h);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = '#d8d0c0'; x.fillRect(F.x, F.y, F.w, F.h);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 0.07; x.drawImage(img, F.x, F.y, F.w, F.h); x.globalAlpha = 1;
    return c;
  }

  // ------------------------------------------------------------------ flow
  function goTitle() {
    G.mode = 'title'; G.paused = false; G.fade = 1; G.canAct = false; G.titleT = 0;
    G.level = MR.LEVELS[0]; G.levelIndex = 0;
    G.stats = computeStats();
    Ink.reset(MR.img[G.level.painting]); bg = makeBackground(MR.img[G.level.painting]);
    G.worms = []; G.drops = []; E.clearFx(); G.wormPace = 1; G.generosity = 1; G.king = null; G.incense = null; G.low = 0;
    G.player = E.newPlayer(); G.finishWash = null;
    G.titleMouse = null;
    MR.audio.setSpray(false); MR.audio.music('calm'); MR.audio.tension(0);
  }

  function setDifficulty(i) {
    G.diffIndex = clamp(i, 0, MR.DIFFICULTY.length - 1); G.diff = MR.DIFFICULTY[G.diffIndex];
    G.maxDiff = Math.max(G.maxDiff, G.diffIndex);
  }

  function startRun() {
    MR.audio.init(); MR.audio.play('start');
    G.brushes = (q.get('brushes') || '').split(',').filter((b) => MR.BRUSHES[b]); // ?brushes= and ?level= are for testing
    G.totalTime = 0; G.levelTimes = []; G.levelSpare = []; G.drove = 0; G.newBest = false; G.carry = 1; G.retries = 0; G.fails = 0;
    G.maxDiff = 0; setDifficulty(G.diffIndex);
    startLevel(q.has('level') ? clamp(Number(q.get('level')) - 1, 0, MR.LEVELS.length - 1) : 0);
  }

  function startLevel(i) {
    const L = MR.LEVELS[i];
    G.levelIndex = i; G.level = L; G.mode = 'play'; G.paused = false; G.fade = 1;
    G.stats = computeStats();
    Ink.reset(MR.img[L.painting]); bg = makeBackground(MR.img[L.painting]);
    G.player = E.newPlayer(); G.worms = []; G.drops = []; E.clearFx();
    G.time = 0; G.activity = 1; G.levelDrove = 0; G.lostCells = 0; G.eatenCells = 0; G.mothCells = 0; G.bites = 0; G.lossFlash = 0; G.shownProgress = 0; G.noteStep = 0; G.milestone = 0; G.shake = 0;
    // only the first painting adapts to the player; after it the difficulty row is all the help there is
    G.generosity = L.tutorial ? G.carry : 1 + G.diff.help;
    G.wormPace = L.tutorial ? 1 : G.diff.pace;
    G.incense = L.incense ? { total: Math.round(L.incense * G.diff.incense * G.stats.incenseMul), left: 0, lit: false, flash: 0, warned: false, sec: -1, lossSecs: 0, lossTime: 0 } : null;
    if (G.incense) G.incense.left = G.incense.total;
    // the lower rows keep the bookworms but they eat like they did in the first painting
    G.hunger = G.diff.calm ? 1 : (L.worms.hunger || 1);
    G.low = 0; G.king = L.boss ? MR.king.create(G) : null; G.kingDefeated = false;
    G.reach = G.stats.range * (1 + 0.5 * (G.generosity - 1));
    G.spawn = { started: false, timer: 0, count: 0, clock: 0, mothOn: false, mothTimer: 0, moths: 0, specials: L.worms.specials.map((s) => Object.assign({ done: false }, s)) };
    G.hint = { base: 0, idle: 0, target: null, every: 0 };
    G.finishWash = L.boss ? null : { active: false, target: null, delay: 0 };
    G.tut = { step: L.tutorial ? 'move' : 'free', t: 0, worm: null, wormHint: null };
    G.known = { move: true, aim: !L.tutorial, spray: !L.tutorial, dash: true };
    G.teaching = null;
    G.banner = G.bannerLen = L.intro2 ? 8 : L.intro ? 6.5 : 2.6; G.clearT = 0; G.picked = null;
    G.canAct = true;
    MR.audio.music(L.boss ? 'boss' : L.tutorial ? 'calm' : 'flow'); MR.audio.tension(0);
    if (L.boss) MR.audio.play('kingRoar');
    // a first drop of ink where the player stands, so the idea is on screen before any input
    G.paint(G.player.x, G.player.y + 8, 46, { dark: 0.8, time: 0.9 });
  }

  function clearLevel() {
    G.mode = 'clear'; G.clearT = 0; G.canAct = false; G.stamped = false;
    G.levelTimes[G.levelIndex] = Math.floor(G.time); G.totalTime += Math.floor(G.time); // whole seconds, so the result card adds up
    G.levelSpare[G.levelIndex] = G.incense ? G.incense.left / G.incense.total : null;
    G.fails = 0; G.low = 0;
    for (const w of G.worms) E.driveOff(G, w, false);
    G.drops = [];
    Ink.fillAll();
    MR.audio.setSpray(false); MR.audio.tension(0); MR.audio.play(G.level.boss ? 'finale' : 'clear');
    G.teaching = null;
  }

  // The incense burned out: this painting is lost and will be started again (never the whole run).
  function failLevel() {
    const p = G.player;
    G.mode = 'fail'; G.failT = 0; G.canAct = false; G.fails++; G.retries++;
    G.totalTime += Math.floor(G.time);
    G.failProgress = Ink.progress;
    // one line of advice, picked from what actually happened
    const tips = [];
    if (G.level.boss) tips.push('tipKing', 'tipKing2');
    else {
      if (G.worms.some((w) => w.shell && w.state !== 'flee')) tips.push('tipShell');
      if (G.mothCells / (Ink.GW * Ink.GH) > 0.08) tips.push('tipMoth');
      if (G.eatenCells / (Ink.GW * Ink.GH) > 0.1) tips.push('tipWorms');
      if (p.moved / Math.max(1, G.time) < 70) tips.push('tipMove');
      if (p.dashes < 4) tips.push('tipDash');
      tips.push('tipRoute');
    }
    G.failTip = tips.find((k) => k !== G.lastTip) || tips[0]; // not the same line twice running
    G.lastTip = G.failTip;
    G.drops = [];
    MR.audio.setSpray(false); MR.audio.tension(0); MR.audio.play('fail');
    G.teaching = null; G.shake = 10;
  }

  function afterClear() {
    const next = MR.LEVELS[G.levelIndex + 1];
    if (!next) return endRun();
    // three techniques the player does not have yet, drawn at random
    const pool = Object.keys(MR.BRUSHES).filter((b) => !G.brushes.includes(b) && !(G.diff.endless && b === 'incense'));
    for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
    G.offer = pool.slice(0, 3);
    G.mode = 'choose'; G.picked = null; G.pickT = 0; G.chooseT = 0; G.chooseMoved = false; MR.audio.play('card');
  }

  function pickBrush(id) {
    G.picked = id; G.pickT = 0;
    G.brushes.push(id);
    MR.audio.play('stamp');
  }

  function endRun() {
    G.mode = 'end'; G.fade = 0.6; G.endT = 0; G.king = null;
    // grade: how much incense was left on average, less a penalty for every lost painting
    const timed = G.levelSpare.filter((v) => v !== null && v !== undefined);
    G.spare = (timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : 0) - 0.08 * G.retries;
    G.grade = MR.GRADES.find((g) => G.spare >= g.spare && (!g.standardOnly || G.maxDiff === 0)).id;
    // the best time only counts on the standard difficulty
    let best = 0;
    try { best = Number(localStorage.getItem('moran.full.best')) || 0; } catch (e) { /* storage may be blocked */ }
    const faster = G.maxDiff === 0 && (!best || G.totalTime < best);
    G.newBest = best > 0 && faster; // a first run has nothing to beat
    G.best = faster ? G.totalTime : best;
    try { if (faster) localStorage.setItem('moran.full.best', String(G.totalTime)); } catch (e) { /* storage may be blocked */ }
    // the best grade so far, shown on the title screen next to the best time
    const rank = MR.GRADES.findIndex((g) => g.id === G.grade);
    try {
      const had = localStorage.getItem('moran.full.grade');
      if (had === null || rank < Number(had)) localStorage.setItem('moran.full.grade', String(rank));
    } catch (e) { /* storage may be blocked */ }
    MR.audio.music('ending');
  }
  // What the title screen shows of earlier runs: { grade: 'gradeS', time: seconds } or null.
  function record() {
    try {
      const g = localStorage.getItem('moran.full.grade'), b = Number(localStorage.getItem('moran.full.best')) || 0;
      if (g === null && !b) return null;
      return { grade: g === null ? null : MR.GRADES[Number(g)].id, time: b };
    } catch (e) { return null; }
  }

  MR.game = {
    record,
    startRun, goTitle, afterClear, pickBrush,
    openMenu() { if (G.mode === 'play') { G.paused = true; G.pauseReason = 'menu'; MR.audio.setSpray(false); } },
    closeMenu() { G.paused = false; },
    restartLevel() { G.paused = false; if (G.mode === 'play' && G.incense) { G.totalTime += Math.floor(G.time); G.retries++; } startLevel(G.levelIndex); },
    retry() { startLevel(G.levelIndex); },
    retryEasier(steps) { setDifficulty(G.diffIndex + (steps || 1)); G.fails = 0; startLevel(G.levelIndex); },
    // from the menu: switch difficulty and start this painting again on it
    cycleDifficulty() { setDifficulty((G.diffIndex + 1) % MR.DIFFICULTY.length); G.paused = false; G.fails = 0; startLevel(G.levelIndex); },
    toggleLang() { MR.lang = MR.lang === 'zh' ? 'en' : 'zh'; document.documentElement.lang = MR.lang; },
  };

  // ------------------------------------------------------------------ per-frame rules
  function updateTutorial(dt) {
    const T = G.tut, p = G.player, K = G.known;
    T.t += dt;
    if (p.moved > 30) K.move = true;
    if (p.blots > 2) { K.spray = true; K.aim = true; }
    if (p.dashes > 0) K.dash = true;
    // never held up: someone who starts with the mouse, or finds no keys, moves on
    if (T.step === 'move' && (p.moved > 120 || T.t > 7 || p.blots >= 6)) { T.step = 'spray'; T.t = 0; }
    else if (T.step === 'spray' && p.blots >= 14) { T.step = p.dashes ? 'goal' : 'dash'; T.t = 0; }
    else if (T.step === 'dash' && (p.dashes > 0 || T.t > 4)) { T.step = 'goal'; T.t = 0; }
    else if (T.step === 'goal' && T.t > 3.2) { T.step = 'free'; T.t = 0; }
    else if (T.step === 'worm' && (G.levelDrove > 0 || !G.worms.includes(T.worm))) { T.step = 'free'; T.t = 0; }
    G.teaching = T.step === 'move' ? 'move' : T.step === 'spray' ? 'spray' : T.step === 'dash' ? 'dash' : null;
    if (T.step === 'spray') K.aim = K.spray = true;
    if (T.step === 'dash') K.dash = true;
    if (T.wormHint && (T.wormHint.t -= dt) <= 0) T.wormHint = null;
    if (T.wormHint && !G.worms.includes(T.wormHint.worm)) T.wormHint = null;
  }

  function updateSpawns(dt) {
    const L = G.level.worms, S = G.spawn, T = G.tut, pr = Ink.progress;
    const ready = !G.level.tutorial || (T.step !== 'move' && T.step !== 'spray' && G.time > 30);
    if (!S.started && pr >= L.startAt && ready) { S.started = true; S.timer = 0; }
    if (!S.started) return;
    const alive = G.worms.filter((w) => w.state !== 'flee').length;
    let max = L.max;
    if (G.level.tutorial && (T.step === 'worm' || T.step === 'dash')) max = 1; // one at a time while a control is being taught
    if (G.time > L.easeAfter) max = 1;
    if (G.time > L.stopAfter && !(G.level.tutorial && S.count === 0)) max = 0; // the teaching bookworm always comes
    // bookworms keep pace with the player: a slow or idle player meets fewer, slower ones
    const act = G.activity * G.activity;
    G.wormPace = (G.time > L.easeAfter ? 0.7 : 1) * (0.25 + 0.75 * act);
    S.timer -= dt * (0.15 + 0.85 * act);
    if (S.timer <= 0 && alive < max) {
      const w = E.spawnWorm(G, L.types[(Math.random() * L.types.length) | 0]);
      S.timer = L.every; S.count++;
      MR.audio.play('arrive');
      if (G.level.tutorial && S.count === 1) { T.step = 'worm'; T.worm = w; T.t = 0; }
    }
    for (const s of S.specials) {
      if (s.done || pr < s.at || G.time > L.stopAfter) continue;
      s.done = true;
      const w = E.spawnWorm(G, s.type);
      MR.audio.play('arrive');
      if (s.hint) T.wormHint = { worm: w, key: s.hint, t: 9 };
    }
  }

  // From the second painting on: no adapting to the player. Bookworms come on a clock once the
  // incense is lit, special ones at set points of progress, moths every so often.
  function updatePressure(dt) {
    const L = G.level.worms, S = G.spawn, T = G.tut, D = G.diff, pr = Ink.progress;
    G.wormPace = D.pace;
    if (!G.incense || !G.incense.lit) return;
    S.clock += dt;
    if (!S.started && (pr >= L.startAt || S.clock > 14) && L.max > 0) { S.started = true; S.timer = 0; }
    if (S.started) {
      S.timer -= dt * D.spawn;
      const alive = G.worms.filter((w) => w.state !== 'flee' && !w.def.flies).length;
      if (S.timer <= 0 && alive < L.max) {
        E.spawnWorm(G, L.types[(Math.random() * L.types.length) | 0]);
        S.timer = L.every; S.count++;
        MR.audio.play('arrive');
      }
    }
    for (const s of S.specials) {
      if (s.done || pr < s.at) continue;
      s.done = true;
      const w = E.spawnWorm(G, s.type);
      MR.audio.play('arrive');
      if (s.hint) T.wormHint = { worm: w, key: s.hint, t: 10 };
    }
    if (L.moths) {
      if (!S.mothOn && pr >= L.moths.at) { S.mothOn = true; S.mothTimer = 0; }
      if (S.mothOn) {
        S.mothTimer -= dt * D.spawn;
        if (S.mothTimer <= 0 && !G.worms.some((w) => w.def.flies && w.state !== 'flee')) {
          const w = E.spawnWorm(G, 'moth');
          S.mothTimer = L.moths.every; S.moths++;
          MR.audio.play('mothWarn');
          if (S.moths === 1) T.wormHint = { worm: w, key: 'tutMoth', t: 8 };
        }
      }
    }
  }

  // The incense stick: lit by the player's first move, burns down in real time, and when it is
  // nearly gone the whole screen says so before anything is lost.
  function updateIncense(dt) {
    const I = G.incense, p = G.player;
    if (!I) return;
    I.flash = Math.max(0, I.flash - dt * 1.5);
    I.lossTime = Math.max(0, I.lossTime - dt);
    if (!I.lit) { if (p.moved > 24 || p.blots > 0 || G.time > 8) { I.lit = true; MR.audio.play('light'); } return; }
    if (G.diff.endless) return; // the last difficulty row: the stick never burns down
    I.left -= dt;
    const warnAt = Math.min(25, I.total * 0.25);
    G.low = clamp(1 - I.left / warnAt, 0, 1);
    MR.audio.tension(G.low);
    if (G.low > 0 && !I.warned) { I.warned = true; G.warnT = 3; MR.audio.play('warn'); }
    const sec = Math.ceil(I.left);
    if (G.low > 0 && sec !== I.sec) { I.sec = sec; MR.audio.play('tick', { last: sec <= 10 }); I.flash = Math.max(I.flash, 0.6); }
    if (I.left <= 0) failLevel();
  }

  // If the restored share has not grown for a while, point at the emptiest part of the painting.
  function updateHint(dt) {
    const h = G.hint, pr = Ink.progress;
    const wash = G.finishWash;
    if (wash && (wash.active || pr >= MR.FINISH_WASH.threshold)) {
      wash.active = true;
      h.target = null;
      wash.delay = Math.max(0, wash.delay - dt);
      if (!wash.target && !wash.delay && pr < G.level.goal) {
        const area = Ink.emptiestRegion(15, G.player);
        if (area) wash.target = Ink.nearestBlank(area.x, area.y);
      }
      return;
    }
    if (pr > h.base + 0.008) { h.base = pr; h.idle = 0; h.target = null; }
    else { h.idle += dt; h.base = Math.min(h.base, pr + 0.02); }
    if (G.level.boss) { h.target = null; return; }
    if (h.idle > 4.5 && G.tut.step !== 'move' && G.tut.step !== 'spray') {
      h.every -= dt;
      if (h.every <= 0 || !h.target) { h.every = 1.2; h.target = Ink.emptiestRegion(); }
    }
  }

  function updatePlay(dt) {
    G.time += dt;
    G.banner = Math.max(0, G.banner - dt); G.warnT = Math.max(0, (G.warnT || 0) - dt);
    const tutorial = !!G.level.tutorial;
    if (tutorial) {
      // First painting only. Nobody is left grinding: a player who falls behind an easy pace gets bigger
      // blots and a longer reach, the further behind the more; it never shrinks again within the painting.
      const expected = G.level.goal * clamp((G.time - 15) / 100, 0, 1);
      const help = clamp((expected - Ink.progress) * 7, 0, 2.4) + clamp((G.time - 150) / 100, 0, 1.2);
      G.generosity = Math.min(3.4, Math.max(G.generosity, G.carry + help));
    }
    // in the first painting the help stretches the reach as far as it takes: nobody is stuck at 79%
    G.reach = G.stats.range * (1 + (tutorial ? 0.85 : 0.5) * (G.generosity - 1));
    E.updatePlayer(G, dt);
    if (G.player.moved > 24 || G.player.blots || G.player.dashes) G.banner = Math.min(G.banner, 0.35);
    E.updateDrops(G, dt);
    E.updateWorms(G, dt);
    if (G.king) { MR.king.update(G, dt); if (G.kingDefeated) return clearLevel(); }
    const busy = G.player.spraying || G.player.dashT > 0 || Math.hypot(G.player.vx, G.player.vy) > 60;
    G.activity += ((busy ? 1 : 0) - G.activity) * Math.min(1, dt / 5);
    updateTutorial(dt);
    if (tutorial) updateSpawns(dt); else updatePressure(dt);
    updateHint(dt);
    updateIncense(dt);
    if (G.mode !== 'play') return;
    const pr = Ink.progress;
    G.noteStep = Math.min(G.noteStep, Math.floor(pr * 50) + 1);
    const ms = Math.floor(pr * 4);
    if (ms > G.milestone && ms < 4) { G.milestone = ms; MR.audio.play('milestone', { n: ms }); }
    if (!G.level.boss && pr >= G.level.goal) clearLevel();
  }

  function updateTitle(dt) {
    G.titleT += dt;
    const tt = G.titleT, m = MR.input.mouse;
    // two wandering brushes keep the title picture alive
    if (Math.floor(tt * 20) !== Math.floor((tt - dt) * 20)) {
      [[0.31, 0.47, 0], [0.23, 0.38, 2.1]].forEach(([a, b, ph]) => {
        Ink.blot(F.w / 2 + Math.sin(tt * a * 2 + ph) * F.w * 0.46, F.h / 2 + Math.sin(tt * b * 2 + ph * 2) * F.h * 0.42, 30 + Math.random() * 14, { dark: 0.7 });
      });
    }
    // and the mouse is already a brush, before any button is pressed
    const mx = m.x - F.x, my = m.y - F.y;
    if (mx > 0 && my > 0 && mx < F.w && my < F.h && !UI.hovering()) {
      const lm = G.titleMouse;
      if (!lm || Math.hypot(mx - lm.x, my - lm.y) > 12) {
        if (lm) { G.paint(mx, my, 26 + Math.random() * 10, { dark: 0.8 }); MR.audio.play('blot'); }
        G.titleMouse = { x: mx, y: my };
      }
    }
    if (G.worms.length < 2 && tt > 4 && Math.floor(tt) !== Math.floor(tt - dt) && Math.random() < 0.3) E.spawnWorm(G, 'silverfish');
    for (const w of G.worms) if (w.age > 26 && w.state !== 'flee') E.driveOff(G, w, false);
    E.updateWorms(G, dt);
  }

  function update(dt) {
    UI.beginFrame(dt);
    if (G.fade > 0) G.fade = Math.max(0, G.fade - dt * 2.2);
    G.shake = Math.max(0, G.shake - dt * 30);
    G.progressPop = Math.max(0, G.progressPop - dt * 5);
    G.lossFlash = Math.max(0, G.lossFlash - dt * 1.6);
    if (G.mode === 'title') updateTitle(dt);
    else if (G.mode === 'play') {
      if (G.paused) { if (G.pauseReason === 'blur' && MR.input.leftPressed()) G.paused = false; }
      else updatePlay(dt);
    } else if (G.mode === 'clear') {
      G.clearT += dt;
      E.updateWorms(G, dt);
      E.updatePlayer(G, dt);
      if (G.clearT > 0.7 && !G.stamped) { G.stamped = true; MR.audio.play('stamp'); G.shake = 5; }
    } else if (G.mode === 'fail') {
      G.failT += dt;
      E.updateWorms(G, dt);
      // what was restored is eaten away again while the card comes up
      if (G.failT < 1.6) for (let n = 0; n < 5; n++) Ink.erase(Math.random() * F.w, Math.random() * F.h, 40 + Math.random() * 50);
    } else if (G.mode === 'end') {
      G.endT += dt;
    } else if (G.mode === 'choose') {
      G.chooseT += dt; if (MR.input.mouse.moved) G.chooseMoved = true;
      if (G.picked) { G.pickT += dt; if (G.pickT > 0.9) startLevel(G.levelIndex + 1); }
    }
    if (!(G.mode === 'play' && G.paused)) { Ink.update(dt); E.updateParts(dt); }
    const target = G.mode === 'title' ? 0 : G.mode === 'fail' ? G.failProgress : Ink.progress;
    G.shownProgress += (target - G.shownProgress) * Math.min(1, dt * 10);
    MR.input.endFrame();
  }

  // ------------------------------------------------------------------ drawing
  function controlHint() {
    const T = G.tut, K = G.king;
    if (K && K.state !== 'dying') {
      if (K.hintCharge > 0 && (K.state === 'windup' || K.state === 'charge')) return MR.t('tutChargeSub');
      if (K.hintHead > 0) return MR.t('tutKingHead');
      if (K.hintTail > 0) return MR.t(G.diff.soft ? 'tutKingSoft' : 'tutKingSub');
    }
    if (T.wormHint && T.wormHint.worm.state !== 'flee') {
      if (T.wormHint.key === 'tutMoth') return MR.t('tutMothSub');
      if (T.wormHint.worm.shell) return MR.t('tutGrubSub');
    }
    if (G.finishWash && G.finishWash.active) return MR.t('guideWash');
    switch (T.step) {
      case 'move': return MR.t('guideMove');
      case 'spray': return MR.t('guideSpray');
      case 'dash': return MR.t('guideDash');
      case 'goal': return MR.t('tutGoalSub', { goal: Math.round(G.level.goal * 100) });
      case 'worm': return MR.t('tutWorm');
      default: return '';
    }
  }

  function drawPrompts() {
    const T = G.tut;
    if (T.step === 'worm' && T.worm && T.worm.state !== 'flee') {
      const x = F.x + clamp(T.worm.x, 18, F.w - 18), y = F.y + clamp(T.worm.y - 42, 4, F.h - 24);
      UI.mouseIcon(ctx, x - 7, y, 22, 'left');
    }
    // every shell keeps a small right-button mark over it: ink will not do, a dash will
    for (const w of G.worms) {
      if (!w.shell || w.state === 'flee') continue;
      const x = F.x + clamp(w.x, 24, F.w - 24), y = F.y + clamp(w.y - 58, 30, F.h - 20) + Math.sin(UI.clock() * 5) * 3;
      ctx.fillStyle = 'rgba(251,246,232,0.92)'; ctx.strokeStyle = '#a62c22'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 20, 0, 6.3); ctx.fill(); ctx.stroke();
      UI.mouseIcon(ctx, x - 8, y - 13, 26, 'right');
    }
    // a cracked big bookworm shows how much more ink it takes, with a left-button mark: now ink works
    for (const w of G.worms) {
      if (!w.def.shell || w.shell || w.state === 'flee') continue;
      const x = F.x + clamp(w.x, 40, F.w - 40), y = F.y + (w.y + 52 > F.h - 14 ? w.y - 52 : w.y + 52), bw = 56, k = clamp(w.hp / w.def.hp, 0, 1);
      const labelY = F.y + clamp(w.y - (w.y + 52 > F.h - 14 ? 76 : 51), 14, F.h - 14);
      UI.text(ctx, MR.t('sprayExposed'), x, labelY, 19, { weight: 700, color: '#8e2b20', halo: '#fff0cd', haloW: 5 });
      ctx.fillStyle = 'rgba(251,246,232,0.92)'; ctx.strokeStyle = '#1c1814'; ctx.lineWidth = 1.5;
      UI.roundRect(ctx, x - bw / 2 - 2, y - 6, bw + 4, 12, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1c1814'; UI.roundRect(ctx, x - bw / 2, y - 4, Math.max(8, bw * (1 - k)), 8, 4); ctx.fill();
      UI.mouseIcon(ctx, x - bw / 2 - 24, y - 12, 22, 'left');
    }
  }

  // The warning that comes before a painting is lost: red at the edges of the screen, growing.
  function drawLow() {
    if (G.mode !== 'play' || G.low <= 0) return;
    const c = UI.clock(), a = G.low * (0.3 + 0.14 * Math.sin(c * (4 + G.low * 6)));
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.86);
    g.addColorStop(0, 'rgba(170,30,20,0)'); g.addColorStop(1, 'rgba(170,30,20,' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sec = Math.ceil(G.incense.left);
    if (G.warnT > 0 || sec <= 10) {
      const s = sec <= 10 ? String(sec) : MR.t('warnLow');
      ctx.save(); ctx.globalAlpha = sec <= 10 ? 0.85 : Math.min(1, G.warnT);
      UI.text(ctx, s, W / 2, F.y + (sec <= 10 ? 70 : 150), sec <= 10 ? 96 : 40, { brush: true, color: '#a62c22', halo: 'rgba(244,236,214,0.9)', haloW: 10 });
      if (sec <= 10) UI.text(ctx, MR.t('warnLow'), W / 2, F.y + 132, 20, { weight: 700, color: '#a62c22', halo: 'rgba(244,236,214,0.9)' });
      ctx.restore();
    }
  }

  function drawHint() {
    const h = G.hint, p = G.player;
    if (G.mode !== 'play') return;
    const target = G.finishWash && G.finishWash.target;
    if (target) {
      const r = MR.FINISH_WASH.hitRadius - 4 + Math.sin(UI.clock() * 3) * 3;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, F.w, F.h); ctx.clip();
      ctx.translate(target.x, target.y);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff1cc'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = '#225c51'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#225c51'; ctx.strokeStyle = '#fff1cc'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(r + 6, 0); ctx.lineTo(r - 2, -4); ctx.lineTo(r - 8, 0); ctx.lineTo(r - 2, 4); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.rotate(Math.PI / 2);
      }
      ctx.restore();
      return;
    }
    if (!h.target || h.idle <= 4.5) return;
    const c = UI.clock(), tx = h.target.x, ty = h.target.y, k = (c * 0.8) % 1;
    ctx.save();
    ctx.strokeStyle = 'rgba(166,44,34,' + (0.85 - k * 0.6) + ')'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(tx, ty, 34 + k * 26, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
    UI.text(ctx, MR.t('tutBlank'), clamp(tx, 110, F.w - 110), clamp(ty, 24, F.h - 24), 17, { weight: 700, color: '#a62c22', halo: 'rgba(244,236,214,0.9)' });
    // an arrow beside the drop pointing the way
    const a = Math.atan2(ty - p.y, tx - p.x), d = Math.hypot(tx - p.x, ty - p.y);
    if (d > 150) {
      const ax = p.x + Math.cos(a) * (66 + Math.sin(c * 6) * 6), ay = p.y + Math.sin(a) * (66 + Math.sin(c * 6) * 6);
      ctx.translate(ax, ay); ctx.rotate(a); ctx.scale(1.5, 1.5);
      ctx.fillStyle = '#a62c22'; ctx.strokeStyle = 'rgba(244,236,214,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-4, -11); ctx.lineTo(-4, -4); ctx.lineTo(-18, -4); ctx.lineTo(-18, 4); ctx.lineTo(-4, 4); ctx.lineTo(-4, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBanner() {
    if (G.banner <= 0 || G.mode !== 'play') return;
    const a = Math.min(1, G.banner / 0.5) * Math.min(1, (G.bannerLen - G.banner) / 0.3), zh = MR.lang === 'zh';
    ctx.save(); ctx.globalAlpha = a;
    const y = F.y + 86;
    UI.text(ctx, UI.levelLabel(G), W / 2, y, zh ? 64 : 50, { brush: true, halo: 'rgba(244,236,214,0.85)', haloW: 10 });
    let yy = y + 54;
    // what is new in this painting, in one line
    if (G.level.intro && !(G.diff.endless && G.level.intro === 'introIncense')) { UI.text(ctx, MR.t(G.level.intro), W / 2, yy, 24, { weight: 700, color: '#a62c22', halo: 'rgba(244,236,214,0.95)', haloW: 7 }); yy += 34; }
    const line2 = !G.level.intro2 ? null : G.level.boss ? (G.diff.soft ? 'introKingSoft' : G.level.intro2) : G.diff.endless ? null : G.level.intro2;
    if (line2) { UI.text(ctx, MR.t(line2), W / 2, yy, 20, { weight: 700, color: '#a62c22', halo: 'rgba(244,236,214,0.95)', haloW: 7 }); yy += 32; }
    if (G.diffIndex > 0) { UI.text(ctx, MR.t('bannerDiff', { name: MR.t(G.diff.name) }), W / 2, yy, 16, { weight: 700, color: '#3a322c', halo: 'rgba(244,236,214,0.9)' }); yy += 26; }
    const b = G.brushes[G.brushes.length - 1];
    if (b) UI.text(ctx, MR.t('brushGot') + '：' + MR.t(MR.BRUSHES[b].name) + ' · ' + MR.t(MR.BRUSHES[b].desc), W / 2, yy, 18, { weight: 700, color: '#3a322c', halo: 'rgba(244,236,214,0.9)' });
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const sx = G.shake > 0.3 ? (Math.random() - 0.5) * G.shake : 0, sy = G.shake > 0.3 ? (Math.random() - 0.5) * G.shake : 0;
    ctx.drawImage(bg, sx, sy);
    ctx.save();
    ctx.translate(sx, sy);
    Ink.draw(ctx);
    ctx.translate(F.x, F.y);
    if (G.mode !== 'title') drawHint();
    E.drawParts(ctx);
    // bookworms and the King come out from under the frame, never over the bars above and below
    ctx.save(); ctx.beginPath(); ctx.rect(-12, -12, F.w + 24, F.h + 24); ctx.clip();
    if (G.king && G.mode !== 'title') MR.king.draw(ctx, G);
    E.drawWorms(ctx, G);
    ctx.restore();
    if (G.mode === 'play' || G.mode === 'clear' || G.mode === 'fail') { E.drawDrops(ctx, G); E.drawPlayer(ctx, G); }
    E.drawFloats(ctx);
    ctx.restore();
    drawLow();

    if (G.mode === 'title') UI.titleScreen(ctx, G);
    else {
      UI.hud(ctx, G, G.mode === 'play' && !G.paused ? controlHint() : '');
      if (G.mode === 'play') { drawBanner(); if (!G.paused) drawPrompts(); else UI.pauseScreen(ctx, G); }
      else if (G.mode === 'clear') UI.clearScreen(ctx, G);
      else if (G.mode === 'fail') UI.failScreen(ctx, G);
      else if (G.mode === 'choose') UI.chooseScreen(ctx, G);
      else if (G.mode === 'end') UI.endScreen(ctx, G);
    }
    if (G.fade > 0) { ctx.fillStyle = 'rgba(241,232,210,' + G.fade + ')'; ctx.fillRect(0, 0, W, H); }
    if (MR.perf.show) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(4, H - 24, 250, 20);
      UI.text(ctx, MR.perf.fps.toFixed(0) + ' fps  work ' + MR.perf.work.toFixed(1) + ' ms  worst ' + MR.perf.worst.toFixed(1), 10, H - 14, 12, { align: 'left', color: '#fff' });
    }
    UI.endFrame(canvas, G.mode === 'play' && !G.paused);
  }

  // ------------------------------------------------------------------ loop and boot
  MR.perf = { show: q.has('fps'), fps: 60, work: 0, worst: 0, frames: 0, slow: 0 };
  MR.tick = function (dt) { update(dt); draw(); };
  function frame(now) {
    const raw = (now - last) / 1000;
    const dt = Math.min(1 / 30, Math.max(0.001, raw));
    last = now;
    if (!MR.manual) {
      const t0 = performance.now();
      update(dt); draw();
      const work = performance.now() - t0, P = MR.perf;
      P.work += (work - P.work) * 0.05; P.fps += (1 / Math.max(raw, 0.001) - P.fps) * 0.05;
      P.frames++; if (raw > 1 / 45) P.slow++;
      P.worst = Math.max(P.worst * 0.995, work);
    }
    requestAnimationFrame(frame);
  }

  function fit() { // scale the 1280 x 720 canvas to the window, keeping its shape
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * s) + 'px'; canvas.style.height = Math.floor(H * s) + 'px';
  }

  MR.boot = function () {
    if (q.has('diff')) setDifficulty(Number(q.get('diff'))); // for testing
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d');
    fit(); window.addEventListener('resize', fit);
    MR.input.attach(canvas);
    document.documentElement.lang = MR.lang;
    window.addEventListener('blur', () => { if (G.mode === 'play' && !G.paused) { G.paused = true; G.pauseReason = 'blur'; MR.audio.setSpray(false); } });
    ctx.fillStyle = '#20262c'; ctx.fillRect(0, 0, W, H);
    MR.loadAssets().then(() => {
      Ink.init();
      goTitle();
      last = performance.now();
      requestAnimationFrame(frame);
    }).catch((e) => {
      ctx.fillStyle = '#f1e8d2'; ctx.font = '20px sans-serif';
      ctx.fillText('Could not load the game files: ' + e.message, 40, 60);
    });
  };
})();
