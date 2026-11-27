// Kestrel Ridge Run — flight model.
// Pure state + math, no rendering: the browser game and the headless
// winnability test run the same step function.
//
// The model is arcade on the surface and disciplined underneath: speed
// comes from the throttle, lift needs speed, a banked turn spends lift to
// change heading, and a slow wing sinks. Throttle and turn discipline are
// what the missions reward — firewalling everywhere burns the fuel dry,
// and a steep bank at low speed stalls the wing.

import { CONFIG, START } from './config.js';
import { terrainHeight, RUNWAY, RUNWAY_Y } from './terrain.js';

const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function createFlight() {
  return {
    // Pose.
    x: START.x, y: START.y, z: START.z,
    heading: START.heading, pitch: 0, roll: 0,
    // Energy.
    speed: 0, throttle: 0, vspeed: 0,
    // Systems.
    fuel: CONFIG.fuelMax,
    damage: 0,
    gearDown: true,
    flaps: false,
    airborne: false,
    onGround: true,
    engineOut: false,
    // Run state.
    lives: CONFIG.lives,
    score: 0,
    time: 0,
    crashed: false,
    crashReason: '',
    landed: false, // wheels on the runway right now
    everAirborne: false,
  };
}

// input: { pitch: -1..1 (pull up positive), roll: -1..1, yaw: -1..1,
//          throttle: 0..1 (absolute target), brake: bool,
//          gearToggle, flapsToggle } — toggles are edge-triggered by main.js.
// events: an array the step appends {type, ...} to (ring/gate/landing/crash).
export function stepFlight(s, input, dt, events) {
  if (s.crashed) return;
  s.time += dt;

  // --- Throttle and fuel ---
  const wantThrottle = s.engineOut ? 0 : clamp(input.throttle, 0, 1);
  s.throttle += clamp(wantThrottle - s.throttle, -dt * 1.4, dt * 0.9);
  const burn = CONFIG.fuelBurnIdle + (CONFIG.fuelBurn - CONFIG.fuelBurnIdle) * s.throttle;
  s.fuel = Math.max(0, s.fuel - burn * dt);
  if (s.fuel <= 0 && !s.engineOut) {
    s.engineOut = true;
    events.push({ type: 'engine-out' });
  }

  // --- Speed: throttle pulls toward its target, drag pulls back ---
  const targetSpeed = s.throttle * CONFIG.maxSpeed;
  if (targetSpeed > s.speed) {
    s.speed = Math.min(targetSpeed, s.speed + CONFIG.accel * dt);
  } else {
    s.speed = Math.max(targetSpeed, s.speed - CONFIG.drag * 22 * dt);
  }
  s.speed = clamp(s.speed, 0, CONFIG.maxSpeed * 1.05);

  // --- Attitude: the pilot commands rates, the wing answers by speed ---
  const authority = clamp(s.speed / 45, 0.15, 1);
  s.roll = clamp(
    s.roll + input.roll * CONFIG.rollRate * authority * dt,
    -CONFIG.maxBank, CONFIG.maxBank,
  );
  // Rolling back toward level when the stick is centred (a stable trainer).
  if (Math.abs(input.roll) < 0.05) s.roll *= Math.max(0, 1 - dt * 0.9);
  s.pitch = clamp(
    s.pitch + input.pitch * CONFIG.pitchRate * authority * dt,
    -CONFIG.maxPitch, CONFIG.maxPitch,
  );
  if (Math.abs(input.pitch) < 0.05) s.pitch *= Math.max(0, 1 - dt * 1.2);
  // A banked wing turns: heading rate grows with bank and falls with speed.
  const turnRate = (9.81 * Math.tan(s.roll) / Math.max(s.speed, 12)) * CONFIG.turnAuthority;
  s.heading = wrapAngle(s.heading + turnRate * dt + input.yaw * CONFIG.yawRate * dt);

  // --- Lift: above stall speed the wing flies, below it the wing sinks ---
  const stall = s.flaps ? CONFIG.stallSpeedFlaps : CONFIG.stallSpeed;
  const flying = s.speed > stall;
  const ground = terrainHeight(s.x, s.z);

  if (!s.onGround) {
    const climb = s.speed * Math.sin(s.pitch) * CONFIG.climbFactor;
    const sink = flying ? 0 : CONFIG.sinkRate * (1 - s.speed / stall);
    // A steep bank costs lift.
    const bankSink = Math.abs(s.roll) > 0.6 ? (Math.abs(s.roll) - 0.6) * 6 : 0;
    s.vspeed = climb - sink - bankSink;
    s.y += s.vspeed * dt;
  } else {
    s.vspeed = 0;
    // Rolling takeoff: once fast enough the wing lifts off by itself.
    if (flying && s.pitch > 0.03) {
      s.onGround = false;
      s.airborne = true;
      s.everAirborne = true;
      s.y = ground + 1.4;
      events.push({ type: 'takeoff' });
    }
  }

  // --- Move along the nose ---
  const fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
  const horiz = s.speed * Math.cos(s.pitch);
  s.x += fx * horiz * dt;
  s.z += fz * horiz * dt;

  // --- Ground contact ---
  const groundNow = terrainHeight(s.x, s.z);
  const clearance = s.y - groundNow;
  if (clearance <= 1.2) {
    const onRunway =
      Math.abs(s.x - RUNWAY.x) < RUNWAY.halfWid &&
      Math.abs(s.z - RUNWAY.z) < RUNWAY.halfLen;
    const gentle = s.vspeed > -CONFIG.landingMaxVs && s.speed < CONFIG.landingMaxSpeed;
    const inWater = groundNow < 8.2; // the river: never a landing
    if (s.onGround) {
      s.y = groundNow + 1.2;
    } else if (onRunway && gentle && s.gearDown && !inWater) {
      // A proper touchdown: roll it out, and the field crew refuels her.
      s.onGround = true;
      s.airborne = false;
      s.y = RUNWAY_Y + 1.2;
      s.pitch = 0;
      s.roll *= 0.4;
      s.landed = true;
      if (s.fuel < CONFIG.fuelMax) {
        s.fuel = CONFIG.fuelMax;
        s.engineOut = false;
        events.push({ type: 'refuelled' });
      }
      events.push({ type: 'touchdown', onRunway: true });
    } else if (gentle && s.gearDown && !inWater && Math.abs(s.pitch) < 0.25) {
      // A survivable field landing, but rough: it costs the airframe.
      s.onGround = true;
      s.airborne = false;
      s.y = groundNow + 1.2;
      s.pitch = 0;
      s.damage += CONFIG.damageHardLanding;
      events.push({ type: 'touchdown', onRunway: false });
      if (s.damage >= 100) crash(s, events, 'broke up in a rough field landing');
    } else {
      // Anything else is a crash: too fast, too steep, gear up, or water.
      crash(s, events, inWater ? 'ditched in the river' : 'flew into the ground');
    }
  } else {
    s.landed = false;
  }

  // --- Rolling on the ground: brakes and drag bleed speed ---
  if (s.onGround) {
    const decel = input.brake ? 26 : 6;
    s.speed = Math.max(0, s.speed - decel * dt);
    if (s.speed < 4 && s.throttle < 0.1) s.speed = 0;
  }

  // --- Map edges: turn the pilot back, gently ---
  const r = Math.hypot(s.x, s.z);
  if (r > 2050) {
    events.push({ type: 'edge' });
    // Steer back toward the field by easing the heading home.
    const home = Math.atan2(-s.x, s.z);
    s.heading = wrapAngle(s.heading + wrapAngle(home - s.heading) * dt * 0.5);
  }
}

function crash(s, events, reason) {
  s.crashed = true;
  s.crashReason = reason;
  s.lives -= 1;
  s.score = Math.max(0, s.score - CONFIG.crashPenalty);
  events.push({ type: 'crash', reason });
}

// Respawn on the runway, fresh airframe, score kept minus the penalty.
export function respawn(s) {
  const keep = s.score;
  const lives = s.lives;
  const time = s.time;
  Object.assign(s, createFlight());
  s.score = keep;
  s.lives = lives;
  s.time = time;
  s.fuel = CONFIG.fuelMax;
}

// Heading in degrees, 0 = north, clockwise.
export function headingDeg(s) {
  return ((s.heading * 180) / Math.PI + 360) % 360;
}

// Height above the ground under the wheels.
export function altitudeAGL(s) {
  return Math.max(0, s.y - terrainHeight(s.x, s.z));
}
