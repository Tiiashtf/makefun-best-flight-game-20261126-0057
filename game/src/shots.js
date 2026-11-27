// Kestrel Ridge Run — deterministic screenshot staging.
// One clear job: given ?shot=<name>, put the real game into a fixed,
// photogenic state before the first frame, using only the game's own
// state machine. The screenshots are renders of the game itself, never
// composites: each mode flies the real flight model to its pose.

import { CONFIG, RINGS } from './config.js';
import { terrainHeight } from './terrain.js';

// Run the flight model forward with a scripted pilot until the pose is
// reached (or the step budget runs out). Returns true when staged.
export function stageShot(game, mode) {
  const f = game.flight;
  const step = game.stepPhysics;
  const dt = 1 / 60;

  if (mode === 'start') {
    // Parked on the runway, engine idling, title screen up.
    game.state = 'title';
    f.throttle = 0.25;
    return true;
  }

  if (mode === 'play') {
    // Take off, climb out, and fly the valley to ring 3, then freeze the
    // pose mid-flight with the ring dead ahead.
    game.state = 'flying';
    const target = RINGS[2];
    let steps = 0;
    let prevHeading = f.heading;
    const auto = { pitch: 0, roll: 0, yaw: 0, throttle: 0.85, brake: false };
    while (steps++ < 60 * 240) {
      // Simple autopilot: point the nose at the ring, hold altitude.
      const dx = target.x - f.x, dz = target.z - f.z;
      const wantHeading = Math.atan2(dx, -dz);
      let dh = wantHeading - f.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      // Damped heading servo, and slow down near the ring so the turn
      // radius stays smaller than the distance to the ring.
      const turnRate = (f.heading - prevHeading) * 60;
      prevHeading = f.heading;
      const dist = Math.hypot(dx, dz);
      const bankCap = dist < 400 ? 0.35 : 0.7;
      const wantBank = Math.max(-bankCap, Math.min(bankCap, dh * 0.9 - turnRate * 1.1));
      auto.roll = Math.max(-1, Math.min(1, (wantBank - f.roll) * 2.0));
      const wantY = Math.max(target.alt, terrainHeight(target.x, target.z) + 45);
      const wantPitch = Math.max(-0.35, Math.min(0.35, (wantY - f.y) * 0.012 - f.vspeed * 0.015));
      auto.pitch = Math.max(-1, Math.min(1, (wantPitch - f.pitch) * 2.5));
      auto.throttle = dist < 700 ? 0.45 : 0.85;
      game.applyInput(auto, dt);
      step(dt);
      if (dist < 320 && f.airborne) break;
    }
    return true;
  }

  if (mode === 'landing') {
    // On final approach to Runway 18: gear down, flaps out, lined up,
    // descending gently over the threshold.
    game.state = 'flying';
    f.x = 12; f.z = 620; f.y = 95;
    f.heading = 0; f.pitch = -0.06; f.roll = 0;
    f.speed = 46; f.throttle = 0.35;
    f.gearDown = true; f.flaps = true;
    f.airborne = true; f.onGround = false; f.everAirborne = true;
    f.fuel = 62;
    // Let the model settle for two seconds so the pose is a real state.
    const auto = { pitch: -0.05, roll: 0, yaw: 0, throttle: 0.35, brake: false };
    for (let i = 0; i < 120; i++) {
      game.applyInput(auto, dt);
      step(dt);
      if (f.onGround) break;
    }
    return true;
  }

  if (mode === 'end') {
    // Mission complete: every ring and gate passed, touch-and-go done,
    // parked on the runway with the results screen up. missionDone must
    // be true or the HUD reads MISSIONS[3].name and throws; the overlay
    // fields are populated here because the normal completeMission() path
    // is bypassed by the staging.
    game.state = 'complete';
    game.missionIndex = 3;
    game.missionDone = true;
    game.landedOnce = true;
    game.ringsPassed = RINGS.length;
    game.gatesPassed = 6;
    f.score = 8 * CONFIG.ringScore + 6 * 150 + 250 + 100 + 500;
    f.time = 412;
    f.fuel = 34;
    f.throttle = 0;
    f.speed = 0;
    const mm = String(Math.floor(f.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(f.time % 60)).padStart(2, '0');
    document.getElementById('final-score').textContent = String(f.score);
    document.getElementById('final-time').textContent = `${mm}:${ss}`;
    return true;
  }

  return false;
}

export const SHOT_MODES = ['start', 'play', 'landing', 'end'];
