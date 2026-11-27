// Kestrel Ridge Run — keyboard and mouse.
// One clear job: turn keys and pointer drags into the flight model's
// input shape, and latch one-frame presses (Enter, P, R, M) so a slow
// frame never swallows them.

export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // latched until consumed
  const input = {
    pitch: 0, roll: 0, yaw: 0,
    throttle: 0, // absolute target, 0..1 — W/S nudge it, digits set it
    brake: false,
    mouseSteer: { x: 0, y: 0 }, // -1..1 while the pointer is dragged
    dragging: false,
  };

  let dragStartX = 0, dragStartY = 0;
  let dragDX = 0, dragDY = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    // Throttle nudges live here so holding W keeps climbing the lever.
    if (e.code === 'KeyW') input.throttle = Math.min(1, input.throttle + 0.12);
    if (e.code === 'KeyS') input.throttle = Math.max(0, input.throttle - 0.12);
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 0 && n <= 9) input.throttle = n / 9;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onPointerDown(e) {
    // Only the canvas steers; HUD buttons handle their own clicks.
    if (e.target.id !== 'scene' && e.target.tagName !== 'CANVAS') return;
    input.dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragDX = 0; dragDY = 0;
  }

  function onPointerMove(e) {
    if (!input.dragging) return;
    dragDX = e.clientX - dragStartX;
    dragDY = e.clientY - dragStartY;
  }

  function onPointerUp() {
    input.dragging = false;
    dragDX = 0; dragDY = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('blur', () => keys.clear());

  // Read the live axes once per frame. Keyboard and mouse add together so
  // either control path flies the plane on its own.
  function poll() {
    const k = keys;
    let pitch = 0, roll = 0, yaw = 0;
    if (k.has('ArrowUp')) pitch += 1;
    if (k.has('ArrowDown')) pitch -= 1;
    if (k.has('ArrowLeft')) roll -= 1;
    if (k.has('ArrowRight')) roll += 1;
    if (k.has('KeyA')) yaw -= 1;
    if (k.has('KeyD')) yaw += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) input.throttle = Math.min(1, input.throttle + 0.02);
    if (k.has('ControlLeft') || k.has('ControlRight')) input.throttle = Math.max(0, input.throttle - 0.02);
    if (input.dragging) {
      roll += Math.max(-1, Math.min(1, dragDX / 140));
      pitch -= Math.max(-1, Math.min(1, dragDY / 140));
    }
    input.pitch = Math.max(-1, Math.min(1, pitch));
    input.roll = Math.max(-1, Math.min(1, roll));
    input.yaw = Math.max(-1, Math.min(1, yaw));
    input.brake = k.has('KeyB') || k.has('Space');
    return input;
  }

  // True once for a key pressed since the last poll, then cleared.
  function consumePressed(code) {
    if (pressed.has(code)) {
      pressed.delete(code);
      return true;
    }
    return false;
  }

  function isDown(code) {
    return keys.has(code);
  }

  return { input, poll, consumePressed, isDown };
}
