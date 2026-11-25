// Sound. Everything here is synthesised at runtime with the Web Audio API: no audio files.
//   - sound effects: plucked-string notes on a pentatonic scale (after a guqin), water drips, wood
//     blocks, brush swishes (the SFX table)
//   - music: a small step sequencer playing written phrases, one mood per part of the game (MOODS)
// TO USE RECORDED AUDIO INSTEAD: put files in src/assets/audio/ and list them in MR.AUDIO_FILES
// (config.js). A listed music file replaces that mood's sequencer; a listed sound replaces that
// entry of SFX. Nothing else needs to change. See the README, section "换成自己的声音".
window.MR = window.MR || {};

(function () {
  let ac = null, master = null, wet = null, noiseBuf = null, sprayGain = null, musicBus = null;
  let muted = new URLSearchParams(location.search).has('mute');
  try { if (localStorage.getItem('moran.muted') === '1') muted = true; } catch (e) { /* storage may be blocked */ }
  const VOL = 1;
  // D major pentatonic over three octaves
  const SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.26, 739.99, 880.0, 987.77, 1174.66];
  const last = {};

  // A machine with no sound device rejects resume(); the game simply stays silent there.
  function wake() { if (ac.state === 'suspended') { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } }

  function init() {
    if (ac) { wake(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : VOL;
    const comp = ac.createDynamicsCompressor();
    // the compressor works as a limiter: many sounds at once must not clip
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 10; comp.attack.value = 0.003; comp.release.value = 0.15;
    const post = ac.createGain(); post.gain.value = 0.95;
    master.connect(comp); comp.connect(post); post.connect(ac.destination);
    // a short echo that stands in for the resonance of a wooden instrument body
    wet = ac.createGain(); wet.gain.value = 0.5;
    const delay = ac.createDelay(1); delay.delayTime.value = 0.27;
    const fb = ac.createGain(); fb.gain.value = 0.3;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    wet.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);
    MR.audio.ctx = ac; MR.audio.out = post;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    musicBus = ac.createGain(); musicBus.gain.value = MR.audio.MUSIC; musicBus.connect(master);
    startSprayLoop();
    startMusic();
    fileMusic();
  }

  // --- building blocks -------------------------------------------------
  function env(t, peak, attack, decay, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest || master);
    return g;
  }
  function tone(t, type, f0, f1, peak, attack, decay, dest) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    o.connect(env(t, peak, attack, decay, dest));
    o.start(t); o.stop(t + attack + decay + 0.05);
  }
  function noise(t, filterType, f0, f1, q, peak, attack, decay, dest) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter();
    f.type = filterType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    s.connect(f); f.connect(env(t, peak, attack, decay, dest));
    s.start(t, Math.random()); s.stop(t + attack + decay + 0.05);
  }

  // --- the instruments ---------------------------------------------------
  // a plucked silk string: bright attack, fast-fading overtones, a slight downward bend
  function pluck(t, f, v = 1, len = 1.1, dest) {
    tone(t, 'triangle', f * 1.012, f, 0.34 * v, 0.004, len, dest);
    tone(t, 'sine', f * 2, f * 2, 0.12 * v, 0.003, len * 0.45, dest);
    tone(t, 'sine', f * 3.01, f * 3, 0.05 * v, 0.002, len * 0.22, dest);
    noise(t, 'bandpass', f * 4, f * 2, 2, 0.06 * v, 0.001, 0.03, dest);
    tone(t, 'triangle', f * 1.012, f, 0.1 * v, 0.004, len * 0.8, wet);
  }
  const drip = (t, v = 1, f = 900) => {
    tone(t, 'sine', f, f * 1.9, 0.16 * v, 0.004, 0.07);
    noise(t, 'bandpass', 2400, 1200, 1.5, 0.05 * v, 0.001, 0.035);
  };
  const tok = (t, v = 1, f = 520, dest) => {
    tone(t, 'sine', f, f * 0.72, 0.4 * v, 0.001, 0.06, dest);
    tone(t, 'triangle', f * 2.4, f * 2.2, 0.1 * v, 0.001, 0.03, dest);
  };
  const bell = (t, v = 1, f = 587.33, len = 2.2, dest) => {
    [[1, 1], [2.0, 0.45], [2.76, 0.3], [4.07, 0.16], [5.4, 0.08]].forEach(([r, a], i) => {
      tone(t, 'sine', f * r, f * r, 0.2 * v * a, 0.004, len / (1 + i * 0.6), dest);
    });
    tone(t, 'sine', f, f, 0.08 * v, 0.004, len, wet);
  };
  // a skin drum: a low thump with a little slap on top
  const drum = (t, v = 1, f = 92, dest) => {
    tone(t, 'sine', f * 1.9, f, 0.6 * v, 0.002, 0.2, dest);
    noise(t, 'lowpass', 900, 220, 0.7, 0.22 * v, 0.001, 0.07, dest);
  };
  const swish = (t, v = 1, up = true) => noise(t, 'bandpass', up ? 500 : 2600, up ? 2800 : 500, 1.1, 0.3 * v, 0.03, 0.22);

  const SFX = {
    blot: (o) => drip(ac.currentTime, 0.5 + Math.random() * 0.4, 700 + Math.random() * 700),
    // one note per two percent restored, climbing the scale as the painting comes back
    bloom: (o) => pluck(ac.currentTime, SCALE[4 + (o.step % 9)], 0.55, 1.0),
    step: () => drip(ac.currentTime, 0.22, 420 + Math.random() * 120),
    dash: () => {
      const t = ac.currentTime;
      swish(t, 1, true);
      noise(t + 0.02, 'lowpass', 900, 200, 0.7, 0.35, 0.01, 0.2);
      pluck(t, SCALE[1], 0.6, 0.5);
    },
    dashReady: () => tone(ac.currentTime, 'sine', 880, 1320, 0.1, 0.01, 0.09),
    dashNotReady: () => tok(ac.currentTime, 0.25, 180),
    hit: () => tok(ac.currentTime, 0.55, 480 + Math.random() * 80),
    pop: () => {
      const t = ac.currentTime;
      noise(t, 'bandpass', 900, 3200, 1.2, 0.4, 0.002, 0.14);
      tok(t, 0.9, 300);
      pluck(t + 0.03, SCALE[8], 0.7, 0.5);
      pluck(t + 0.12, SCALE[10], 0.7, 0.8);
    },
    chomp: () => {
      const t = ac.currentTime;
      noise(t, 'bandpass', 1100 + Math.random() * 500, 700, 4, 0.34, 0.001, 0.04);
      noise(t + 0.05, 'bandpass', 900 + Math.random() * 500, 600, 4, 0.22, 0.001, 0.035);
    },
    arrive: () => { const t = ac.currentTime; tok(t, 0.7, 240); tok(t + 0.13, 0.7, 240); tok(t + 0.26, 0.9, 200); },
    bite: () => {
      const t = ac.currentTime;
      tone(t, 'sine', 170, 62, 0.5, 0.002, 0.22);
      noise(t, 'lowpass', 700, 200, 0.8, 0.3, 0.001, 0.1);
      pluck(t + 0.02, SCALE[0] * 1.06, 0.5, 0.4);
    },
    milestone: (o) => { const t = ac.currentTime; bell(t, 0.5, SCALE[5 + (o.n || 0) * 2], 1.4); },
    clear: () => {
      const t = ac.currentTime;
      [5, 6, 7, 8, 9, 10, 12].forEach((n, i) => pluck(t + i * 0.09, SCALE[n], 0.6, 1.2));
      bell(t + 0.7, 1, SCALE[5], 3.2);
      bell(t + 0.72, 0.5, SCALE[8], 2.6);
      noise(t + 0.7, 'highpass', 5000, 8000, 0.5, 0.08, 0.3, 1.6);
    },
    finale: () => {
      const t = ac.currentTime;
      [5, 7, 8, 10, 12, 13, 15].forEach((n, i) => pluck(t + i * 0.13, SCALE[n], 0.6, 1.6));
      bell(t + 1.0, 1, SCALE[5], 4);
      bell(t + 1.02, 0.6, SCALE[10], 3);
      tone(t + 1.0, 'sine', SCALE[0] / 2, SCALE[0] / 2, 0.24, 0.02, 2.8);
    },
    stamp: () => {
      const t = ac.currentTime;
      tone(t, 'sine', 150, 70, 0.55, 0.002, 0.16);
      noise(t, 'lowpass', 1200, 300, 0.8, 0.35, 0.001, 0.08);
      bell(t + 0.05, 0.4, SCALE[8], 1.2);
    },
    hover: () => tone(ac.currentTime, 'sine', 1320, 1320, 0.035, 0.002, 0.04),
    click: () => { const t = ac.currentTime; tok(t, 0.5, 640); pluck(t, SCALE[7], 0.3, 0.3); },
    start: () => {
      const t = ac.currentTime;
      drip(t, 1.2, 500);
      [5, 8, 10].forEach((n, i) => pluck(t + 0.08 + i * 0.12, SCALE[n], 0.6, 1.4));
    },
    card: () => { const t = ac.currentTime; swish(t, 0.5, true); pluck(t + 0.05, SCALE[9], 0.5, 0.9); },
    // ink on a shell or on the King's armour: a dull metal knock, so it is plainly not working
    clang: () => { const t = ac.currentTime; tone(t, 'square', 1480, 1460, 0.09, 0.001, 0.06); tone(t, 'sine', 2210, 2190, 0.13, 0.001, 0.11); tok(t, 0.5, 300); },
    crack: () => {
      const t = ac.currentTime;
      noise(t, 'highpass', 2500, 5000, 0.8, 0.34, 0.001, 0.09);
      noise(t + 0.03, 'bandpass', 1300, 700, 2.5, 0.3, 0.001, 0.12);
      drum(t, 0.8, 120);
      pluck(t + 0.05, SCALE[12], 0.5, 0.4);
    },
    mothWarn: () => { const t = ac.currentTime; bell(t, 0.5, SCALE[13], 0.5); bell(t + 0.16, 0.5, SCALE[13], 0.5); bell(t + 0.32, 0.6, SCALE[14], 0.8); },
    moth: () => { const t = ac.currentTime; for (let i = 0; i < 7; i++) noise(t + i * 0.055, 'bandpass', 3000 + i * 150, 2200, 3, 0.3, 0.004, 0.04); },
    light: () => { const t = ac.currentTime; noise(t, 'bandpass', 1800, 4200, 1, 0.12, 0.05, 0.3); bell(t + 0.1, 0.35, SCALE[10], 1.6); },
    // the incense is nearly gone: a gong, then a wood block every second (see game.js)
    warn: () => { const t = ac.currentTime; bell(t, 1.1, 110, 3); bell(t, 0.7, 164.81, 2.4); drum(t, 0.8, 70); },
    tick: (o) => { const t = ac.currentTime; tok(t, o.last ? 1.3 : 0.9, o.last ? 880 : 660); if (o.last) tok(t + 0.09, 0.7, 880); },
    fail: () => {
      const t = ac.currentTime;
      [9, 8, 6, 5, 3, 1].forEach((n, i) => pluck(t + i * 0.16, SCALE[n] * (i === 2 ? 0.97 : 1), 0.6, 1.2));
      drum(t + 0.96, 1, 60); bell(t + 0.96, 0.9, 73.42, 3.5);
      noise(t, 'lowpass', 1200, 200, 0.7, 0.2, 0.4, 1.4);
    },
    kingRoar: () => {
      const t = ac.currentTime;
      tone(t, 'sawtooth', 58, 41, 0.3, 0.25, 1.3); tone(t, 'sawtooth', 87, 60, 0.18, 0.25, 1.1);
      noise(t, 'lowpass', 500, 180, 1.2, 0.3, 0.2, 1.2);
      drum(t, 1, 55); drum(t + 0.5, 0.8, 55); drum(t + 0.75, 1, 50);
    },
    kingWarn: () => { const t = ac.currentTime; tone(t, 'sawtooth', 110, 330, 0.2, 0.9, 0.2); for (let i = 0; i < 5; i++) tok(t + i * 0.2, 0.8 + i * 0.15, 500 + i * 70); },
    kingCharge: () => { const t = ac.currentTime; swish(t, 1.6, false); noise(t, 'lowpass', 1400, 200, 0.8, 0.7, 0.02, 0.6); tone(t, 'sawtooth', 160, 60, 0.28, 0.01, 0.6); },
    kingDazed: () => { const t = ac.currentTime; drum(t, 1.1, 64); [12, 11, 12, 11, 10].forEach((n, i) => tone(t + 0.1 + i * 0.11, 'sine', SCALE[n], SCALE[n] * 0.98, 0.07, 0.01, 0.1)); },
    kingHurt: () => {
      const t = ac.currentTime;
      noise(t, 'bandpass', 700, 3000, 1, 0.5, 0.002, 0.2); drum(t, 1.1, 80);
      tone(t + 0.05, 'sawtooth', 120, 52, 0.22, 0.02, 0.5);
      [8, 10, 12].forEach((n, i) => pluck(t + 0.08 + i * 0.08, SCALE[n], 0.6, 0.7));
    },
    kingDie: () => {
      const t = ac.currentTime;
      tone(t, 'sawtooth', 200, 36, 0.3, 0.02, 1.6); noise(t, 'lowpass', 2000, 150, 0.8, 0.45, 0.01, 1.5);
      for (let i = 0; i < 6; i++) drum(t + i * 0.2, 1 - i * 0.12, 90 - i * 8);
    },
  };
  // sounds that would otherwise fire many times a frame, with their minimum spacing in seconds
  const LIMIT = { blot: 0.07, hit: 0.05, chomp: 0.16, step: 0.2, hover: 0.05, bloom: 0.09, clang: 0.14 };

  // --- continuous spray hiss, faded in and out by setSpray() -------------------
  function startSprayLoop() {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 6.3;
    const lfoG = ac.createGain(); lfoG.gain.value = 500;
    lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();
    sprayGain = ac.createGain(); sprayGain.gain.value = 0;
    s.connect(bp); bp.connect(sprayGain); sprayGain.connect(master); s.start();
  }

  // --- music -------------------------------------------------------------------
  // A step sequencer, eight steps to the bar. Each mood has four written bars of melody (numbers
  // are positions in SCALE, null is a rest), a bass note per bar and a drum pattern. All of it is
  // D major pentatonic; the boss mood centres on B, which makes the same notes sound minor.
  const _ = null;
  const MOODS = {
    calm: { // title and the first painting: slow, sparse, guqin-like
      bpm: 66, voice: 'long',
      bars: [[5, _, 7, _, 8, _, _, _], [10, _, 8, _, 7, _, 5, _], [8, _, _, 7, 5, _, _, _], [3, _, 5, _, 7, 8, _, _]],
      bass: [73.42, 73.42, 110, 73.42], bassOn: [0], drum: [], block: [],
    },
    flow: { // second and third painting: walking pace, a wood block keeping time
      bpm: 96, voice: 'short',
      bars: [[5, 7, 8, 7, 10, _, 8, 7], [5, 7, 8, 10, 12, _, 10, 8], [9, 8, 7, 5, 7, _, 8, _], [7, 5, 4, 5, 3, _, 5, _]],
      bass: [73.42, 73.42, 61.74, 55], bassOn: [0, 4], drum: [0], block: [2, 6],
    },
    boss: { // the Bookworm King: fast, drums, low register
      bpm: 132, voice: 'hard',
      bars: [[4, 4, 9, 4, 7, 4, 8, 7], [4, 4, 9, 4, 10, 9, 8, 7], [6, 6, 11, 6, 9, 6, 8, 9], [7, 8, 9, 8, 7, 6, 4, _]],
      bass: [61.74, 61.74, 82.41, 92.5], bassOn: [0, 2, 4, 6], drum: [0, 3, 4], block: [2, 6], hat: true,
    },
    ending: { // the ending: bells, rising
      bpm: 76, voice: 'bell',
      bars: [[5, _, 7, 8, 10, _, 12, _], [13, _, 12, 10, 12, _, _, _], [10, _, 8, 7, 8, _, 10, _], [12, _, 10, _, 10, _, _, _]],
      bass: [73.42, 110, 61.74, 73.42], bassOn: [0, 4], drum: [], block: [],
    },
  };
  let mood = 'calm', tension = 0, step = 0, nextAt = 0, musicEl = null, musicElMood = '';
  const FILES = MR.AUDIO_FILES || { music: {}, sfx: {} };
  const fileUrl = (p) => (window.MR_EMBED && window.MR_EMBED[p]) || p;

  function playStep(m, t, n) {
    const bar = Math.floor(n / 8) % 4, st = n % 8, note = m.bars[bar][st], round = Math.floor(n / 32);
    if (note !== null) {
      // every other time round, the last bar is played an octave up
      const f = SCALE[Math.min(SCALE.length - 1, note + (round % 2 === 1 && bar === 3 ? 5 : 0))];
      if (m.voice === 'long') pluck(t, f, 0.3, 2.4, musicBus);
      else if (m.voice === 'short') pluck(t, f, 0.26, 0.9, musicBus);
      else if (m.voice === 'hard') { pluck(t, f, 0.3, 0.45, musicBus); tone(t, 'sawtooth', f / 2, f / 2, 0.035, 0.005, 0.16, musicBus); }
      else { bell(t, 0.3, f, 2.2, musicBus); pluck(t, f / 2, 0.16, 1.6, musicBus); }
    }
    if (m.bassOn.includes(st)) { tone(t, 'triangle', m.bass[bar], m.bass[bar], 0.26, 0.01, m.voice === 'hard' ? 0.22 : 1.2, musicBus); tone(t, 'sine', m.bass[bar] * 2, m.bass[bar] * 2, 0.07, 0.01, 0.5, musicBus); }
    if (m.drum.includes(st)) drum(t, m.voice === 'hard' ? 0.75 : 0.3, 88, musicBus);
    if (m.block.includes(st)) tok(t, 0.18, 760, musicBus);
    if (m.hat && st % 2 === 1) noise(t, 'highpass', 6000, 7000, 0.7, 0.05, 0.001, 0.03, musicBus);
    // the incense is running out: a heartbeat under everything, harder as it gets closer
    if (tension > 0 && st % 4 === 0) { drum(t, 0.4 + tension * 0.6, 60, musicBus); drum(t + 0.13, 0.25 + tension * 0.4, 56, musicBus); }
  }
  function startMusic() {
    nextAt = ac.currentTime + 0.4;
    setInterval(() => {
      if (ac.state !== 'running') { nextAt = ac.currentTime + 0.1; return; }
      if (nextAt < ac.currentTime) nextAt = ac.currentTime + 0.05;
      const m = MOODS[mood];
      while (nextAt < ac.currentTime + 0.3) {
        if (!FILES.music[mood]) playStep(m, nextAt, step);
        step++;
        nextAt += 60 / (m.bpm * (1 + tension * 0.16)) / 2;
      }
    }, 90);
  }
  // A recorded track listed in MR.AUDIO_FILES.music replaces the sequencer for its mood.
  function fileMusic() {
    const path = FILES.music[mood] || '';
    if (musicElMood === mood) { if (musicEl) musicEl.volume = muted ? 0 : 0.6; return; }
    if (musicEl) { musicEl.pause(); musicEl = null; }
    musicElMood = mood;
    if (!path) return;
    musicEl = new Audio(fileUrl(path)); musicEl.loop = mood !== 'ending'; musicEl.volume = muted ? 0 : 0.6;
    const p = musicEl.play(); if (p && p.catch) p.catch(() => {});
  }
  function fileSfx(name) {
    const a = new Audio(fileUrl(FILES.sfx[name])); a.volume = muted ? 0 : 0.8;
    const p = a.play(); if (p && p.catch) p.catch(() => {});
  }

  MR.audio = {
    init,
    ctx: null,
    out: null,
    play(name, opts) {
      if (!ac) return;
      wake();
      const gap = LIMIT[name];
      if (gap) { if (ac.currentTime - (last[name] || -1) < gap) return; last[name] = ac.currentTime; }
      if (FILES.sfx[name]) return fileSfx(name);
      try { SFX[name](opts || {}); } catch (e) { console.warn('sfx', name, e); }
    },
    // which piece of music plays: 'calm' | 'flow' | 'boss' | 'ending'
    music(name) { if (name !== mood) { mood = name; step = 0; } if (ac) fileMusic(); },
    // 0..1: how close the incense is to burning out
    tension(v) { tension = v; },
    mood: () => mood,
    setSpray(on) {
      if (!ac || !sprayGain) return;
      sprayGain.gain.setTargetAtTime(on ? 0.05 : 0, ac.currentTime, on ? 0.03 : 0.08);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.03);
      if (musicEl) musicEl.volume = muted ? 0 : 0.6;
      try { localStorage.setItem('moran.muted', muted ? '1' : '0'); } catch (e) { /* storage may be blocked */ }
      return muted;
    },
    isMuted: () => muted,
    // for tools/audio-probe.mjs: the names of all sound effects, and the music level (0..1)
    names: () => Object.keys(SFX),
    musicVolume(v) { if (musicBus) musicBus.gain.value = v; },
    MUSIC: 0.72,
  };
})();
