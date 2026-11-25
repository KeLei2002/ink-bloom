// The whole control scheme: WASD to move, mouse to aim, left button held to spray, right button to dash.
// Everything else in the game is an on-screen button (see ui.js).
window.MR = window.MR || {};

(function () {
  const KEYS = {
    KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
    ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
  };
  const held = new Set();
  const mouse = { x: MR.W / 2, y: MR.H / 2, left: false, moved: false, inside: false };
  let leftPressed = false, leftReleased = false, rightPressed = false, focusAt = -1e9;
  let canvas = null;

  function toGame(e) {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    mouse.x = (e.clientX - box.left) / box.width * MR.W;
    mouse.y = (e.clientY - box.top) / box.height * MR.H;
    mouse.inside = mouse.x >= 0 && mouse.x <= MR.W && mouse.y >= 0 && mouse.y <= MR.H;
    mouse.moved = true;
  }

  MR.input = {
    mouse,
    attach(cv) {
      canvas = cv;
      window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const a = KEYS[e.code];
        if (!a) return;
        e.preventDefault();
        held.add(a);
      });
      window.addEventListener('keyup', (e) => { const a = KEYS[e.code]; if (a) held.delete(a); });
      window.addEventListener('blur', () => { held.clear(); mouse.left = false; });
      window.addEventListener('focus', () => { focusAt = performance.now(); });
      window.addEventListener('mousemove', toGame);
      window.addEventListener('mousedown', (e) => {
        // A click that only brings keyboard focus back to the game (after switching windows, or the
        // first click inside an itch.io iframe) still counts: every action here is harmless.
        window.focus();
        toGame(e);
        if (e.button === 0) { mouse.left = true; leftPressed = true; }
        if (e.button === 2) rightPressed = true;
        e.preventDefault();
      });
      window.addEventListener('mouseup', (e) => {
        toGame(e);
        if (e.button === 0) { mouse.left = false; leftReleased = true; }
      });
      window.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('dragstart', (e) => e.preventDefault());
    },
    axis() {
      let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      let y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    leftPressed: () => leftPressed,
    leftReleased: () => leftReleased,
    rightPressed: () => rightPressed,
    endFrame() { leftPressed = leftReleased = rightPressed = false; mouse.moved = false; },
    justFocused: () => performance.now() - focusAt < 250,
    // for automated tests
    sim(action, isDown) { if (isDown) held.add(action); else held.delete(action); },
  };
})();
