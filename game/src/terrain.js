// Kestrel Ridge Run — terrain heightfield.
// Pure math, no rendering dependency: the flight model (flight.js) and the
// 3D world builder (world.js) both call terrainHeight, so the ground the
// pilot sees is exactly the ground the physics collides with.
//
// The valley runs north-south along the Kestrel river. A flat strip at the
// valley floor is Kestrel Field's runway. Ridges rise on both sides and
// mountains wall the far north and south ends of the map.

export const WORLD_HALF = 2100; // playable area is +/- WORLD_HALF metres
export const WATER_Y = 7.5; // river surface
export const RUNWAY_Y = 12; // runway / apron elevation
export const RUNWAY = { x: 0, z: 0, halfLen: 260, halfWid: 16 };

// The river meanders down the valley floor.
export function riverX(z) {
  return 260 * Math.sin(z * 0.0009) + 120 * Math.sin(z * 0.0021 + 2.0);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

export function terrainHeight(x, z) {
  // Rolling foothills.
  let h =
    26 * Math.sin(x * 0.0011 + 1.7) * Math.cos(z * 0.0009) +
    18 * Math.sin(x * 0.0023) * Math.sin(z * 0.0013 + 0.6) +
    8 * Math.sin(x * 0.0051) * Math.cos(z * 0.0042 + 1.1) +
    30;

  // Carve the river valley down to the water.
  const dxRiver = Math.abs(x - riverX(z));
  h = mix(6.5, h, smoothstep(70, 520, dxRiver));

  // The valley walls climb on both flanks, so the flyable floor stays low
  // all the way to the ends of the valley and the mountains wall the sides.
  const flank = smoothstep(520, 1300, dxRiver);
  h += flank * (150 + 60 * Math.sin(x * 0.0016 + z * 0.0011));

  // End walls close the valley far north and south, past the course.
  const endWall = smoothstep(1750, 2100, Math.abs(z));
  h += endWall * 130;

  // Flatten the runway strip and the apron by the hangars.
  const dRun = Math.max(Math.abs(x - RUNWAY.x) / 110, Math.abs(z - RUNWAY.z) / 340);
  h = mix(RUNWAY_Y, h, smoothstep(0.55, 1.0, dRun));
  const dApron = Math.hypot(x - 95, z - 330) / 110;
  h = mix(RUNWAY_Y, h, smoothstep(0.6, 1.0, dApron));

  return h;
}

// Slope (for landing-suitability checks): 0 = flat, 1 = cliff.
export function terrainSlope(x, z) {
  const e = 2;
  const gx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const gz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}
