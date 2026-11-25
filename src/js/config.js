// All tuning and content tables: the game is these tables plus the rules that read them.
// Add a painting to MR.LEVELS, a bookworm to MR.WORMS, a technique to MR.BRUSHES.
window.MR = window.MR || {};

// Screen layout in game pixels. The canvas is always 1280 x 720 and scaled to the window by CSS.
MR.W = 1280;
MR.H = 720;
MR.FIELD = { x: 48, y: 82, w: 1184, h: 592 }; // where the painting sits
// Finishing a scroll still takes a stroke. A marked patch spreads the player's ink across nearby gaps.
MR.FINISH_WASH = { threshold: 0.60, hitRadius: 52, bloomRadius: 158, nextDelay: 0.85, biteScale: 0.68 };

// What the ink drop can do before any technique is chosen.
MR.BASE_STATS = {
  speed: 265,          // pixels per second
  trailR: 24,          // radius of the trail the drop leaves just by moving
  range: 270,          // how far ink can be thrown. The painting is 1184 wide, so standing still
                       // reaches well under half of it: the drop has to travel.
  sprayRate: 24,       // blots per second while the left button is held
  sprayDamage: 1,      // what one blot does to a bookworm
  blotR: 31,           // radius of one blot
  spread: 1,           // scatter of the spray
  bleed: 1,            // how much a blot grows after landing (1 = not at all)
  bleedTime: 0.6,      // seconds a blot takes to settle
  dashDist: 240,
  dashTime: 0.17,
  dashR: 44,           // half-width of the stroke a dash paints
  dashCooldown: 1.4,
  dashDamage: 4,
  burstMul: 1,         // size of the ink burst when a bookworm is driven off
  burstDamage: 0,      // what that burst does to other bookworms it touches
  incenseMul: 1,       // length of the incense stick
};

// Brush techniques: each one changes a few numbers in the stats above.
// After each painting three that the player does not have yet are offered.
MR.BRUSHES = {
  splash: { name: 'brushSplash', desc: 'brushSplashDesc',
    apply(s) { s.blotR *= 1.35; s.spread *= 1.4; s.sprayRate *= 1.1; } },
  flying: { name: 'brushFlying', desc: 'brushFlyingDesc',
    apply(s) { s.dashDist *= 1.5; s.dashR *= 1.4; s.dashCooldown *= 0.55; s.dashDamage += 3; } },
  wash: { name: 'brushWash', desc: 'brushWashDesc',
    apply(s) { s.bleed = 1.6; s.bleedTime = 2.2; s.trailR *= 1.3; } },
  reach: { name: 'brushReach', desc: 'brushReachDesc',
    apply(s) { s.range *= 1.4; } },
  scorch: { name: 'brushScorch', desc: 'brushScorchDesc',
    apply(s) { s.sprayDamage *= 1.5; } },
  burst: { name: 'brushBurst', desc: 'brushBurstDesc',
    apply(s) { s.burstMul *= 1.5; s.burstDamage += 4; } },
  incense: { name: 'brushIncense', desc: 'brushIncenseDesc',
    apply(s) { s.incenseMul *= 1.25; } },
};

// Bookworm types. Sizes are on-screen pixels.
//   shell   spray does nothing until a dash cracks it
//   flies   crosses the painting in a straight lane, dusting it blank; a dash cannot reach it
MR.WORMS = {
  silverfish: { sprite: 'silverfish', len: 86, radius: 17, speed: 78, eatSpeed: 44, bite: 15, hp: 5, burst: 60, turn: 2.6, appetite: 60 },
  grub: { sprite: 'grub', len: 118, radius: 34, speed: 40, eatSpeed: 26, bite: 32, hp: 9, burst: 112, turn: 1.4, appetite: 160, shell: true },
  moth: { sprite: 'moth', len: 74, radius: 30, speed: 150, bite: 36, hp: 4, burst: 80, flies: true },
};

// The Bookworm King (last level). Only its tail end takes ink; the body in front blocks it.
MR.KING = {
  segments: 5, gap: 60, segR: 36, headR: 44,
  segHp: 190, headHp: 280, dashHit: 16,
  speed: 96, speedPerLoss: 13, turn: 1.7, bite: 46,
  attackEvery: 7, windup: 1.15, chargeSpeed: 640, chargeTime: 0.8, dazed: 2.6,
  burst: 150, chargeCost: 12, stun: 1.2, gloat: 1.8,
};

// Paintings, in order.
//   goal      restored share that clears the painting
//   incense   seconds on the incense stick; when it burns out the painting is lost and started again.
//             The first painting has none: it teaches the controls and cannot be lost.
//   worms     pressure, not a script:
//     startAt   restored share at which the first bookworm appears     max    how many at once
//     every     seconds between arrivals                               types  drawn at random
//     specials  one-off arrivals at a given restored share
//     moths     { at: share for the first one, every: seconds between the following ones }
//     easeAfter / stopAfter   (first painting only) seconds after which the pressure drops / ends
MR.LEVELS = [
  {
    id: 'lotus', name: 'lotus', painting: 'paintingLotus', goal: 0.8, tutorial: true,
    worms: { startAt: 0.26, max: 2, every: 7, types: ['silverfish'], specials: [], easeAfter: 80, stopAfter: 130 },
  },
  {
    id: 'mountain', name: 'mountain', painting: 'paintingMountain', goal: 0.8, incense: 100, intro: 'introIncense', intro2: 'introIncense2',
    worms: { startAt: 0.05, max: 3, every: 6, hunger: 1.4, types: ['silverfish'],
      specials: [{ at: 0.22, type: 'grub', hint: 'tutGrub' }, { at: 0.5, type: 'grub' }] },
  },
  {
    id: 'plum', name: 'plum', painting: 'paintingPlum', goal: 0.8, incense: 90, intro: 'introMoth',
    worms: { startAt: 0.05, max: 5, every: 4, hunger: 1.6, types: ['silverfish', 'silverfish', 'grub'],
      specials: [{ at: 0.4, type: 'grub' }], moths: { at: 0.18, every: 8 } },
  },
  {
    id: 'boss', name: 'boss', painting: 'paintingScroll', boss: true, incense: 150, intro: 'introKing', intro2: 'introKing2',
    worms: { startAt: 2, max: 0, every: 9, types: ['silverfish'], specials: [] },
  },
];

// Difficulty. The game starts on the first row. After losing the same painting the lose card offers
// the next row down; the menu can switch at any time. The second row only stretches time and slows the
// bookworms. The third is the way out for anyone who just wants to see the ending: it cannot be lost.
//   incense  multiplies the incense stick     pace   bookworm speed     spawn  arrival rate
//   bite     seconds of incense a bite costs  help   extra blot size and reach
//   king     multiplies the King's toughness  endless  the incense never burns out: this row cannot be lost
//   soft     ink counts anywhere on the King, not only on its tail
MR.DIFFICULTY = [
  { id: 'standard', name: 'diffStandard', incense: 1, pace: 1, spawn: 1, bite: 4, help: 0, king: 1 },
  { id: 'easy', name: 'diffEasy', incense: 1.5, pace: 0.85, spawn: 0.85, bite: 3, help: 0, king: 0.8, calm: true },
  { id: 'gentle', name: 'diffGentle', incense: 1, pace: 0.6, spawn: 0.5, bite: 0, help: 0.5, king: 0.55, endless: true, soft: true, calm: true },
];

// Final grade. spare = average share of incense left over the timed paintings, minus 0.08 per lost painting.
// Only the standard difficulty can earn the two upper grades.
MR.GRADES = [
  { id: 'gradeS', spare: 0.36, standardOnly: true },
  { id: 'gradeA', spare: 0.18, standardOnly: true },
  { id: 'gradeB', spare: -9 },
];

// AUDIO FILES. Everything is synthesised by audio.js unless a path is given here.
// To replace a sound, put a file in src/assets/audio/ and write its path, e.g.
//   music: { calm: 'assets/audio/music-calm.mp3' }      sfx: { pop: 'assets/audio/pop.ogg' }
// Music moods: calm (title, first painting), flow (second and third), boss, ending.
// Sound names are the keys of SFX in audio.js (blot, dash, hit, pop, clear, fail ...).
MR.AUDIO_FILES = {
  music: { calm: '', flow: '', boss: '', ending: '' },
  sfx: {},
};
