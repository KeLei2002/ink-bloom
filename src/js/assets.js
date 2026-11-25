// Asset manifest. The single-file build inlines these as data URIs through window.MR_EMBED.
window.MR = window.MR || {};

MR.ASSETS = {
  paper: 'assets/img/paper.jpg',
  sprites: 'assets/img/sprites.png',
  paintingLotus: 'assets/img/painting-lotus.jpg',
  paintingMountain: 'assets/img/painting-mountain.jpg',
  paintingPlum: 'assets/img/painting-plum.jpg',
  paintingScroll: 'assets/img/painting-scroll.jpg',
  king: 'assets/img/sprites-king.png',
};

// Rectangles inside sprites.png, printed by tools/prep_assets.py. Every sprite faces up.
MR.SPRITES = {
  drop: { x: 6, y: 6, w: 90, h: 132 },
  silverfish: { x: 102, y: 6, w: 60, h: 190 },
  grub: { x: 168, y: 6, w: 146, h: 240 },
  moth: { x: 320, y: 6, w: 187, h: 150 },
};

// Rectangles inside sprites-king.png: the Bookworm King's parts and the incense burner.
MR.KING_SPRITES = {
  kingHead: { x: 6, y: 6, w: 186, h: 230 },
  kingSeg: { x: 198, y: 6, w: 212, h: 190 },
  kingTail: { x: 416, y: 6, w: 124, h: 200 },
  burner: { x: 546, y: 6, w: 118, h: 200 },
};

MR.img = {};

MR.loadAssets = function () {
  const embed = window.MR_EMBED || {};
  const images = Object.entries(MR.ASSETS).map(([key, path]) => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => { MR.img[key] = im; resolve(); };
    im.onerror = () => reject(new Error('missing ' + path));
    im.src = embed[path] || path;
  }));
  // Fonts are optional: fall back to system fonts if they do not arrive within two seconds.
  const fonts = !document.fonts ? Promise.resolve() : Promise.race([
    Promise.all([document.fonts.load('40px "MRBrush"', '墨染 Ink'), document.fonts.load('20px "MRText"', '墨染 Ink')]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  return Promise.all([Promise.all(images), fonts]).then(() => {
    // All-black copies of the sprite sheets: drawn over a bookworm to show how inked it is.
    for (const [from, to] of [['sprites', 'spritesInk'], ['king', 'kingInk']]) {
      const s = MR.img[from], c = document.createElement('canvas');
      c.width = s.width; c.height = s.height;
      const x = c.getContext('2d');
      x.drawImage(s, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#14110f';
      x.fillRect(0, 0, c.width, c.height);
      MR.img[to] = c;
    }
  });
};
