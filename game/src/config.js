// Kestrel Ridge Run — tuning, course layout and scoring.
// One clear job: every number the game balances on lives here, so the
// flight model, the world builder and the HUD all read the same truth.

export const CONFIG = {
  // Aircraft performance (arcade model with real discipline behind it).
  maxSpeed: 96, // m/s at full throttle, clean
  cruiseSpeed: 62,
  stallSpeed: 30, // below this the wing stops flying (24 with flaps)
  stallSpeedFlaps: 23,
  accel: 14, // m/s^2 toward the throttle's target speed
  drag: 0.35, // extra decel when the throttle is closed
  climbFactor: 0.85, // how much of sin(pitch) becomes climb
  sinkRate: 9, // m/s lost when stalled
  turnAuthority: 4.0, // rad/s of heading per rad of bank, scaled by speed
  pitchRate: 0.65, // rad/s at full elevator
  rollRate: 3.2, // rad/s at full aileron
  yawRate: 0.22, // rad/s of rudder
  maxBank: 1.15, // rad the pilot may hold
  maxPitch: 0.7,
  // Fuel and damage.
  fuelMax: 100,
  fuelBurn: 0.42, // units/s at full throttle (about 4 min of full power)
  fuelBurnIdle: 0.1,
  damageHardLanding: 34, // hitting the ground hard, gear down, off-runway
  damageCrash: 100, // hitting the ground fast, or a mountain
  // Lives and scoring.
  lives: 3,
  ringScore: 100,
  ringCenterBonus: 50,
  gateScore: 150,
  landingScore: 250,
  takeoffBonus: 100,
  missionBonus: 500,
  crashPenalty: 150,
  // Runway landing window.
  landingMaxVs: 6.5, // m/s of descent a touchdown may carry
  landingMaxSpeed: 52, // m/s over the threshold
};

// Ring course: a gentle slalom up the valley floor, hugging the river,
// one wide turn at the top, then a return leg down the east side. y is
// terrain + offset, fixed at build.
export const RINGS = [
  { x: 90, z: -500, alt: 62 },
  { x: -260, z: -900, alt: 78 },
  { x: -210, z: -1300, alt: 66 },
  { x: -280, z: -1650, alt: 95 },
  { x: -250, z: -1750, alt: 80 },
  { x: 140, z: -1500, alt: 100 },
  { x: 250, z: -1050, alt: 110 },
  { x: 200, z: -600, alt: 85 },
];
export const RING_RADIUS = 30;

// Canyon gates: low passes between the pylon pairs, south of the field.
// The last gate stays well clear of the end wall that closes the valley
// past z=1750 — after it the pilot must turn around at low altitude, and
// the ground there has to stay low.
export const GATES = [
  { z: 240, alt: 42 },
  { z: 500, alt: 46 },
  { z: 760, alt: 40 },
  { z: 1020, alt: 52 },
  { z: 1280, alt: 44 },
  { z: 1540, alt: 58 },
];
export const GATE_HALF_WIDTH = 34; // fly between the pylons
export const GATE_MAX_ALT = 78; // and below this height to count

// Mission script, in order.
export const MISSIONS = [
  { id: 'rings', name: 'Ring Run', brief: 'Fly through all 8 valley rings' },
  { id: 'gates', name: 'Canyon Gates', brief: 'Thread the 6 canyon gates, low and fast' },
  { id: 'land', name: 'Touch & Go', brief: 'Land on Runway 18 at Kestrel Field, then take off again' },
];

export const START = {
  x: 0, y: 13.4, z: 190, // parked on the runway, nose north
  heading: 0, // 0 = north (-z)
  pitch: 0, roll: 0,
};

export const PLANE_NAME = 'Kestrel-7';
export const FIELD_NAME = 'Kestrel Field';
