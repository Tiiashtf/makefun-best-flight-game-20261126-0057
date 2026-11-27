// Kestrel Ridge Run — the game itself.
// One clear job: own the loop, the states (title / flying / paused /
// crashed / complete / game over), the mission script, the chase camera
// and the wiring between the flight model, the world and the HUD.

import * as THREE from 'three';
import { CONFIG, MISSIONS, RINGS, RING_RADIUS, GATES, GATE_HALF_WIDTH, GATE_MAX_ALT, PLANE_NAME, FIELD_NAME } from './config.js';
import { terrainHeight, riverX, RUNWAY, RUNWAY_Y } from './terrain.js';
import { createFlight, stepFlight, respawn, clamp, altitudeAGL } from './flight.js';
import { buildWorld } from './world.js';
import { buildAircraft } from './aircraft.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') || 1);

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
camera.position.set(0, 60, 240);

const world = buildWorld(THREE, scene);
const plane = buildAircraft(THREE);
scene.add(plane.group);
const hud = createHud();
const audio = createAudio();
const inputCtl = createInput();

const flight = createFlight();
const game = {
  state: 'title',
  flight,
  missionIndex: 0,
  missionDone: false,
  ringsPassed: 0,
  gatesPassed: 0,
  landedOnce: false,
  currentInput: { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false },
  camMode: 'chase',
  firstFrame: false,
  stepPhysics,
  applyInput,
};

let prevRingZ = null;
let prevGateZ = null;
let lastAlarm = 0;
let camPos = new THREE.Vector3(0, 60, 240);
let camLook = new THREE.Vector3(0, 14, 0);

// --- Mission helpers -------------------------------------------------------

function nextRing() {
  return game.ringsPassed < RINGS.length ? RINGS[game.ringsPassed] : null;
}

function nextGate() {
  return game.gatesPassed < GATES.length ? GATES[game.gatesPassed] : null;
}

function completeMission() {
  game.missionIndex += 1;
  if (game.missionIndex >= MISSIONS.length) {
    game.missionDone = true;
    flight.score += CONFIG.missionBonus;
    game.state = 'complete';
    audio.chime();
    document.getElementById('final-score').textContent = String(flight.score);
    document.getElementById('final-time').textContent = document.getElementById('hud-time').textContent;
    showOverlay('complete');
  } else {
    const m = MISSIONS[game.missionIndex];
    hud.showMessage(`Mission ${game.missionIndex + 1}: ${m.name} — ${m.brief}`, 4);
    audio.chime();
  }
  hud.setMission(game.missionIndex, game.missionDone);
}

function checkRingPass() {
  const ring = nextRing();
  if (!ring || game.missionIndex !== 0) return;
  const def = world.rings[game.ringsPassed];
  const zRel = flight.z - ring.z;
  if (prevRingZ !== null && Math.sign(zRel) !== Math.sign(prevRingZ) && Math.abs(zRel) < 60) {
    const dx = flight.x - ring.x;
    const dy = flight.y - def.y;
    const lateral = Math.hypot(dx, dy);
    if (lateral < RING_RADIUS) {
      def.passed = true;
      game.ringsPassed += 1;
      const centre = lateral < RING_RADIUS * 0.35;
      flight.score += CONFIG.ringScore + (centre ? CONFIG.ringCenterBonus : 0);
      hud.showMessage(centre ? `Ring ${game.ringsPassed} — DEAD CENTRE! +${CONFIG.ringScore + CONFIG.ringCenterBonus}` : `Ring ${game.ringsPassed}/8  +${CONFIG.ringScore}`, 2.5);
      audio.chime();
      if (game.ringsPassed >= RINGS.length) completeMission();
    }
  }
  prevRingZ = zRel;
}

function checkGatePass() {
  const gate = nextGate();
  if (!gate || game.missionIndex !== 1) return;
  const gx = riverX(gate.z);
  const zRel = flight.z - gate.z;
  if (prevGateZ !== null && Math.sign(zRel) !== Math.sign(prevGateZ) && Math.abs(zRel) < 60) {
    const lateral = Math.abs(flight.x - gx);
    if (lateral < GATE_HALF_WIDTH && flight.y < GATE_MAX_ALT) {
      world.gates[game.gatesPassed].passed = true;
      game.gatesPassed += 1;
      flight.score += CONFIG.gateScore;
      hud.showMessage(`Gate ${game.gatesPassed}/6 — low and clean  +${CONFIG.gateScore}`, 2.5);
      audio.chime();
      if (game.gatesPassed >= GATES.length) completeMission();
    } else {
      hud.showWarning('Gate missed — too high or too wide', 2);
    }
  }
  prevGateZ = zRel;
}

// --- Flight events ---------------------------------------------------------

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'takeoff') {
      hud.showMessage('Airborne — gear up when you are ready (G)', 2.5);
      if (game.missionIndex === 2 && game.landedOnce) {
        flight.score += CONFIG.takeoffBonus;
        hud.showMessage(`Touch & Go complete! +${CONFIG.takeoffBonus}`, 3);
        completeMission();
      }
    } else if (e.type === 'touchdown') {
      audio.thud();
      if (e.onRunway) {
        flight.score += CONFIG.landingScore;
        hud.showMessage(`Touchdown on Runway 18  +${CONFIG.landingScore}`, 3);
        if (game.missionIndex === 2 && !game.landedOnce) {
          game.landedOnce = true;
          hud.showMessage('Touchdown! Now take off again to finish the sortie', 4);
        }
      } else {
        hud.showWarning('Rough field landing — the airframe took damage', 3);
      }
    } else if (e.type === 'crash') {
      audio.thud();
      game.state = 'crashed';
      document.getElementById('crash-reason').textContent = `Kestrel-7 ${e.reason}.`;
      document.getElementById('crash-lives').textContent =
        flight.lives > 0 ? `${flight.lives} airframe${flight.lives === 1 ? '' : 's'} left — press R to fly again` : 'No airframes left.';
      document.getElementById('btn-respawn').style.display = flight.lives > 0 ? '' : 'none';
      showOverlay('crash');
    } else if (e.type === 'engine-out') {
      hud.showWarning('FUEL EMPTY — engine out! Glide to the field', 5);
      audio.alarm();
    } else if (e.type === 'refuelled') {
      hud.showMessage('Refuelled at Kestrel Field — tanks full', 3);
    } else if (e.type === 'edge') {
      hud.showWarning('Leaving the valley — turn back toward Kestrel Field', 3);
    }
  }
}

function applyInput(inp, dt) {
  game.currentInput = inp;
}

function stepPhysics(dt) {
  const events = [];
  stepFlight(flight, game.currentInput, dt, events);
  handleEvents(events);
  checkRingPass();
  checkGatePass();
}

// --- Overlays ---------------------------------------------------------------

const overlays = {
  title: document.getElementById('overlay-title'),
  crash: document.getElementById('overlay-crash'),
  complete: document.getElementById('overlay-complete'),
  gameover: document.getElementById('overlay-gameover'),
  pause: document.getElementById('overlay-pause'),
};

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('show', key === name);
  }
  document.getElementById('hud').classList.toggle('dim', name === 'title');
}

function startFlying() {
  audio.start();
  audio.click();
  game.state = 'flying';
  showOverlay(null);
  hud.setMission(game.missionIndex, game.missionDone);
  hud.showMessage('Mission 1: Ring Run — fly through all 8 valley rings', 4);
}

document.getElementById('btn-fly').addEventListener('click', startFlying);
document.getElementById('btn-respawn').addEventListener('click', doRespawn);
document.getElementById('btn-again').addEventListener('click', () => location.reload());
document.getElementById('btn-fly-again').addEventListener('click', () => location.reload());
document.getElementById('btn-resume').addEventListener('click', () => {
  if (game.state === 'paused') {
    game.state = 'flying';
    showOverlay(null);
  }
});

function doRespawn() {
  if (flight.lives <= 0) return;
  respawn(flight);
  game.state = 'flying';
  game.landedOnce = false;
  prevRingZ = null;
  prevGateZ = null;
  showOverlay(null);
  hud.showMessage('Fresh airframe on Runway 18 — throttle up and go', 3);
}

// --- Per-frame input ---------------------------------------------------------

function pollKeys() {
  const inp = inputCtl.poll();
  if (inputCtl.consumePressed('KeyG')) {
    flight.gearDown = !flight.gearDown;
    hud.showMessage(flight.gearDown ? 'Gear down' : 'Gear up', 1.5);
  }
  if (inputCtl.consumePressed('KeyF')) {
    flight.flaps = !flight.flaps;
    hud.showMessage(flight.flaps ? 'Flaps down — slower stall, more drag' : 'Flaps up', 1.5);
  }
  if (inputCtl.consumePressed('KeyM')) {
    const on = audio.toggleMute();
    hud.showMessage(on ? 'Sound on' : 'Sound muted', 1.5);
  }
  if (inputCtl.consumePressed('KeyC')) {
    game.camMode = game.camMode === 'chase' ? 'cockpit' : 'chase';
    hud.showMessage(game.camMode === 'chase' ? 'Chase camera' : 'Cockpit camera', 1.5);
  }
  if (inputCtl.consumePressed('KeyP') || inputCtl.consumePressed('Escape')) {
    if (game.state === 'flying') {
      game.state = 'paused';
      showOverlay('pause');
    } else if (game.state === 'paused') {
      game.state = 'flying';
      showOverlay(null);
    }
  }
  if (inputCtl.consumePressed('KeyR')) {
    if (game.state === 'crashed') doRespawn();
    else if (game.state === 'gameover' || game.state === 'complete') location.reload();
  }
  if (inputCtl.consumePressed('Enter')) {
    if (game.state === 'title') startFlying();
    else if (game.state === 'crashed') doRespawn();
  }
  if (inputCtl.isDown('Space') && game.state === 'title') startFlying();
  return inp;
}

// --- Camera ------------------------------------------------------------------

function updateCamera(dt) {
  const f = flight;
  const fx = Math.sin(f.heading), fz = -Math.cos(f.heading);
  if (game.camMode === 'cockpit') {
    // Over the pilot's shoulder: the nose and the panel stay in frame.
    const px = f.x + fx * 1.4;
    const pz = f.z + fz * 1.4;
    camPos.set(px, f.y + 1.1, pz);
    camLook.set(f.x + fx * 60, f.y + Math.sin(f.pitch) * 60, f.z + fz * 60);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = 68;
  } else {
    const back = 13.5 + f.speed * 0.03;
    const up = 4.4 + f.speed * 0.012;
    const tx = f.x - fx * back;
    const tz = f.z - fz * back;
    const ty = f.y + up;
    if (game.camSnap) {
      // Screenshot staging teleports the plane across the valley in one
      // synchronous step; the smoothed camera would need minutes of
      // frames to catch up, so snap it straight onto the chase point.
      camPos.set(tx, ty, tz);
      game.camSnap = false;
    }
    const k = 1 - Math.exp(-dt * 4.5);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (ty - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
    // Keep the camera out of the hillside.
    const groundAtCam = terrainHeight(camPos.x, camPos.z) + 2.5;
    if (camPos.z !== undefined && camPos.y < groundAtCam) camPos.y = groundAtCam;
    camLook.set(f.x + fx * 24, f.y + 1 + Math.sin(f.pitch) * 12, f.z + fz * 24);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = 60 + (f.speed / CONFIG.maxSpeed) * 14;
  }
  camera.updateProjectionMatrix();
}

// --- HUD hints ----------------------------------------------------------------

function nextTargetHint() {
  if (game.missionDone) return '';
  if (game.missionIndex === 0) {
    const r = nextRing();
    if (!r) return '';
    const d = Math.round(Math.hypot(r.x - flight.x, r.z - flight.z));
    return `NEXT RING ${game.ringsPassed + 1}/8 — ${d} m`;
  }
  if (game.missionIndex === 1) {
    const g = nextGate();
    if (!g) return '';
    const d = Math.round(Math.abs(g.z - flight.z));
    return `NEXT GATE ${game.gatesPassed + 1}/6 — ${d} m · STAY LOW`;
  }
  if (!game.landedOnce) return 'LAND ON RUNWAY 18 — GEAR DOWN (G), FLAPS (F)';
  return 'TAKE OFF AGAIN — FULL THROTTLE, PULL UP';
}

// --- Main loop -----------------------------------------------------------------

const clock = new THREE.Clock();
let shotStaged = false;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // Screenshot staging runs once, before the first rendered frame.
  if (shotMode && !shotStaged) {
    shotStaged = true;
    stageShot(game, shotMode);
    game.camSnap = true;
    if (shotMode === 'start') showOverlay('title');
    else if (shotMode === 'end') showOverlay('complete');
    else showOverlay(null);
  }

  // Keys are polled in every state: P must unpause, R must respawn, and
  // Enter must start from the title screen.
  const inp = pollKeys();

  if (game.state === 'flying') {
    applyInput(inp, dt);
    stepPhysics(dt);
    // Warnings.
    const stall = (flight.flaps ? CONFIG.stallSpeedFlaps : CONFIG.stallSpeed) + 4;
    if (flight.airborne && flight.speed < stall) {
      hud.showWarning('STALL — NOSE DOWN, POWER UP', 0.4);
    }
    if (flight.fuel < 20 && flight.fuel > 0 && t - lastAlarm > 5) {
      lastAlarm = t;
      hud.showWarning('LOW FUEL — head for Kestrel Field', 3);
      audio.alarm();
    }
    if (flight.lives <= 0 && flight.crashed) {
      game.state = 'gameover';
      showOverlay('gameover');
    }
  } else if (game.state === 'title') {
    // The title screen idles on the runway with the engine turning over.
    flight.throttle = 0.22;
    audio.setEngine(0.22, 0);
  }

  // Pose the aircraft mesh from the flight model.
  plane.group.position.set(flight.x, flight.y, flight.z);
  plane.group.rotation.order = 'YXZ';
  plane.group.rotation.y = -flight.heading;
  plane.group.rotation.x = flight.pitch;
  plane.group.rotation.z = -flight.roll;
  plane.prop.rotation.z -= dt * (8 + flight.throttle * 55);
  plane.group.visible = true;

  // The sun follows the aircraft so shadows stay local.
  const sun = scene.children.find((o) => o.isDirectionalLight);
  if (sun) {
    sun.position.set(flight.x + 900, 1400, flight.z + 600);
    sun.target.position.set(flight.x, 0, flight.z);
    sun.target.updateMatrixWorld();
  }

  world.update(t, game.ringsPassed);
  updateCamera(dt);

  // Audio follows the engine and the wind.
  if (game.state === 'flying' || game.state === 'title') {
    audio.setEngine(flight.throttle, flight.speed / CONFIG.maxSpeed);
    audio.setWind(flight.airborne ? flight.speed / CONFIG.maxSpeed : 0);
  } else {
    audio.setEngine(0, 0);
    audio.setWind(0);
  }

  hud.update(flight, dt, game.missionIndex, game.missionDone, nextTargetHint(), null);
  renderer.render(scene, camera);

  if (!game.firstFrame) {
    game.firstFrame = true;
    window.__shotReady = true;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug/test hook: the live state, for the headless play-test.
window.__flight = {
  get state() { return game.state; },
  get flight() { return flight; },
  get missionIndex() { return game.missionIndex; },
  get ringsPassed() { return game.ringsPassed; },
  get gatesPassed() { return game.gatesPassed; },
  get score() { return flight.score; },
};

hud.setMission(0, false);
showOverlay('title');
frame();
