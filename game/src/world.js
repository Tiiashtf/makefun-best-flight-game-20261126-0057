// Kestrel Ridge Run — the valley, built in three.js.
// One clear job: turn terrain.js's heightfield into a visible place —
// coloured ground, a river, the runway, trees, farmsteads, clouds, and the
// glowing rings and gates the missions ask the pilot to fly through.

import { terrainHeight, riverX, WATER_Y, RUNWAY, RUNWAY_Y, WORLD_HALF } from './terrain.js';
import { RINGS, RING_RADIUS, GATES, GATE_HALF_WIDTH } from './config.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Deterministic pseudo-random from a seed (so the world is the same every run).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWorld(THREE, scene) {
  const api = { rings: [], gates: [], clouds: [], windsock: null, update: () => {} };

  // --- Light and sky ---
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a6b3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(900, 1400, 600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 4200;
  scene.add(sun);
  scene.fog = new THREE.Fog(0xcfe0ee, 700, 3400);
  scene.background = new THREE.Color(0x9fc4e8);

  // A gradient sky dome (painted, no texture file).
  const skyGeo = new THREE.SphereGeometry(4200, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f7fd0) },
      mid: { value: new THREE.Color(0x9fc4e8) },
      low: { value: new THREE.Color(0xf6e3bb) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h))
                         : mix(low, mid, smoothstep(-0.08, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // The sun disc, so the sky has a source of light to look at.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(90, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }),
  );
  sunDisc.position.set(1500, 1900, -3200);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // --- Terrain mesh, vertex-coloured by height and slope ---
  const SEG = 220;
  const SIZE = WORLD_HALF * 2;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x5d8a3c);
  const cGrassDry = new THREE.Color(0x8aa04a);
  const cForest = new THREE.Color(0x3d6b2e);
  const cRock = new THREE.Color(0x8a7f74);
  const cSnow = new THREE.Color(0xeef2f5);
  const cSand = new THREE.Color(0xcbb98a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const dxRiver = Math.abs(x - riverX(z));
    const r = Math.hypot(x, z);
    if (h < 10.5 && dxRiver < 90) tmp.copy(cSand); // riverbank
    else if (h > 165) tmp.copy(cSnow); // high snow
    else if (h > 95) tmp.copy(cRock).lerp(cSnow, (h - 95) / 90); // scree
    else {
      tmp.copy(cGrass).lerp(cGrassDry, 0.5 + 0.5 * Math.sin(x * 0.013 + z * 0.007));
      // Forest patches on the lower flanks.
      const forest = Math.sin(x * 0.021 + 3.1) * Math.sin(z * 0.017 + 1.4);
      if (h > 26 && h < 90 && forest > 0.25) tmp.lerp(cForest, 0.65);
    }
    // Darken the valley floor a touch so the runway reads.
    if (r < 420 && h < 20) tmp.multiplyScalar(0.92);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // --- River ribbon, following the meander ---
  const riverPts = [];
  for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 40) riverPts.push([riverX(z), z]);
  const riverShape = new THREE.Shape();
  riverShape.moveTo(riverPts[0][0] - 42, riverPts[0][1]);
  for (const [x, z] of riverPts) riverShape.lineTo(x - 42, z);
  for (let i = riverPts.length - 1; i >= 0; i--) riverShape.lineTo(riverPts[i][0] + 42, riverPts[i][1]);
  riverShape.closePath();
  const riverGeo = new THREE.ShapeGeometry(riverShape);
  riverGeo.rotateX(-Math.PI / 2);
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.MeshStandardMaterial({ color: 0x2f7fb8, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.92 }),
  );
  river.position.y = WATER_Y;
  scene.add(river);

  // --- Runway: dark strip, white centreline, threshold bars, edge lights ---
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.halfWid * 2, RUNWAY.halfLen * 2),
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, RUNWAY_Y + 0.15, RUNWAY.z);
  strip.receiveShadow = true;
  scene.add(strip);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5ee });
  for (let z = -RUNWAY.halfLen + 40; z < RUNWAY.halfLen - 20; z += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 18), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(RUNWAY.x, RUNWAY_Y + 0.3, z);
    scene.add(dash);
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 12), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(RUNWAY.x + i * 4, RUNWAY_Y + 0.3, end * (RUNWAY.halfLen - 14));
      scene.add(bar);
    }
  }
  // Edge lights: small emissive posts.
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc860, emissiveIntensity: 2 });
  for (let z = -RUNWAY.halfLen + 10; z <= RUNWAY.halfLen - 10; z += 40) {
    for (const x of [-RUNWAY.halfWid - 2, RUNWAY.halfWid + 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.1, 6), edgeMat);
      post.position.set(x, RUNWAY_Y + 0.55, z);
      scene.add(post);
    }
  }
  // Runway numbers, painted as flat white digits "18" / "36" via canvas-free
  // boxes: two simple bars read as numerals from the chase view.
  const numMat = new THREE.MeshBasicMaterial({ color: 0xf5f5ee });
  for (const [z, flip] of [[-RUNWAY.halfLen + 46, 0], [RUNWAY.halfLen - 46, Math.PI]]) {
    const g = new THREE.Group();
    const d1 = new THREE.Mesh(new THREE.PlaneGeometry(2, 10), numMat);
    d1.position.set(-3.4, 0, 0);
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 10), numMat);
    d2.position.set(3.4, 0, 0);
    g.add(d1, d2);
    g.rotation.x = -Math.PI / 2;
    g.rotation.z = flip;
    g.position.set(RUNWAY.x, RUNWAY_Y + 0.32, z);
    scene.add(g);
  }

  // --- Hangars and farmsteads on the apron ---
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x7a8894, roughness: 0.7, metalness: 0.35 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb8452c, roughness: 0.6, metalness: 0.2 });
  function hangar(x, z, w, d, h) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hangarMat);
    body.position.y = h / 2;
    body.castShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 12, 1, false, Math.PI / 2, Math.PI), roofMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = h;
    roof.castShadow = true;
    g.add(roof);
    g.position.set(x, RUNWAY_Y, z);
    scene.add(g);
  }
  hangar(95, 300, 26, 34, 9);
  hangar(95, 345, 20, 26, 7);
  // A red-roofed farmhouse and barn further down the valley.
  function farmhouse(x, z) {
    const g = new THREE.Group();
    const y = terrainHeight(x, z);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 10), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.85 }));
    walls.position.y = 3; walls.castShadow = true;
    g.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 4.5, 4), roofMat);
    roof.position.y = 8.2; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    g.position.set(x, y, z);
    scene.add(g);
  }
  farmhouse(150, -420);
  farmhouse(-190, 620);
  farmhouse(320, 980);

  // --- Trees: instanced cones on cylinders, scattered off the runway ---
  const rng = mulberry32(20261126);
  const treeCount = 650;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  const crownGeo = new THREE.ConeGeometry(2.6, 8, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f5d28, roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const dummy = new THREE.Object3D();
  let placed = 0, guard = 0;
  while (placed < treeCount && guard++ < 20000) {
    const x = (rng() * 2 - 1) * 1900;
    const z = (rng() * 2 - 1) * 1900;
    const h = terrainHeight(x, z);
    if (h < 14 || h > 95) continue; // keep off the river, the field and the peaks
    if (Math.abs(x) < 60 && Math.abs(z) < 380) continue; // keep the runway clear
    if (Math.hypot(x - 95, z - 330) < 90) continue; // and the apron
    const s = 0.8 + rng() * 0.9;
    dummy.position.set(x, h + 1.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + (3 + 4) * s;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunks.count = placed; crowns.count = placed;
  trunks.castShadow = true; crowns.castShadow = true;
  scene.add(trunks, crowns);

  // --- Clouds: soft white clusters drifting slowly ---
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.88 });
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(14 + rng() * 16, 10, 8), cloudMat);
      puff.position.set((rng() - 0.5) * 60, (rng() - 0.5) * 8, (rng() - 0.5) * 30);
      puff.scale.y = 0.45;
      g.add(puff);
    }
    g.position.set((rng() * 2 - 1) * 1800, 260 + rng() * 180, (rng() * 2 - 1) * 1800);
    scene.add(g);
    api.clouds.push(g);
  }

  // --- Windsock by the runway ---
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.set(28, RUNWAY_Y + 4.5, -180);
    scene.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 3.4, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, emissive: 0x903a00, emissiveIntensity: 0.4 }),
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(30, RUNWAY_Y + 8.6, -180);
    scene.add(sock);
    api.windsock = sock;
  }

  // --- Rings: glowing toruses with a light column so the next one reads ---
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 1.6, 12, 40);
  for (const def of RINGS) {
    const y = Math.max(def.alt, terrainHeight(def.x, def.z) + 45);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffb020, emissive: 0xff8c00, emissiveIntensity: 1.4, roughness: 0.4,
    });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.set(def.x, y, def.z);
    // Face along the course (roughly north-south).
    ring.rotation.y = Math.PI / 2;
    scene.add(ring);
    // A faint beacon column so the pilot can spot it from far away.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 260, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(def.x, y + 120, def.z);
    scene.add(beam);
    api.rings.push({ mesh: ring, beam, def, y, passed: false });
  }

  // --- Canyon gates: pylon pairs with a banner between them ---
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x27313d, roughness: 0.6, metalness: 0.3 });
  for (const def of GATES) {
    const x = riverX(def.z);
    const y = terrainHeight(x, def.z);
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.0, 46, 8), pylonMat);
      pylon.position.set(side * GATE_HALF_WIDTH, 23, 0);
      pylon.castShadow = true;
      g.add(pylon);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x37e0ff, emissive: 0x1899bb, emissiveIntensity: 1.6 }),
      );
      tip.position.set(side * GATE_HALF_WIDTH, 47, 0);
      g.add(tip);
    }
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(GATE_HALF_WIDTH * 2, 5),
      new THREE.MeshBasicMaterial({ color: 0x37e0ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    banner.position.set(0, 44, 0);
    g.add(banner);
    g.position.set(x, y, def.z);
    scene.add(g);
    api.gates.push({ group: g, def, x, y: y + 44, passed: false });
  }

  // --- Per-frame ambience: clouds drift, rings pulse, windsock swings ---
  api.update = (t, nextRingIndex) => {
    for (let i = 0; i < api.clouds.length; i++) {
      const c = api.clouds[i];
      c.position.x += 0.55 * 0.016;
      if (c.position.x > 2000) c.position.x = -2000;
    }
    for (let i = 0; i < api.rings.length; i++) {
      const ring = api.rings[i];
      const isNext = i === nextRingIndex;
      const mat = ring.mesh.material;
      if (ring.passed) {
        mat.emissive.setHex(0x2aff66);
        mat.emissiveIntensity = 0.9;
        ring.beam.material.opacity = 0.05;
      } else if (isNext) {
        mat.emissive.setHex(0xff8c00);
        mat.emissiveIntensity = 1.5 + Math.sin(t * 4) * 0.7;
        ring.beam.material.opacity = 0.16;
      } else {
        mat.emissive.setHex(0x8a5a10);
        mat.emissiveIntensity = 0.5;
        ring.beam.material.opacity = 0.07;
      }
    }
    if (api.windsock) api.windsock.rotation.y = Math.sin(t * 0.7) * 0.25;
  };

  return api;
}
