// Kestrel Ridge Run — the aircraft.
// "Kestrel-7", a high-wing bush plane, built from primitives: no borrowed
// model, no texture files, every part placed by hand so the silhouette
// reads at a glance from the chase camera.

export function buildAircraft(THREE) {
  const group = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: 0xd84a2b, roughness: 0.55, metalness: 0.25 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.6, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fd8e8, roughness: 0.12, metalness: 0.4,
    emissive: 0x1a3a4a, emissiveIntensity: 0.6,
  });
  const propMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.4, metalness: 0.5 });

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  // Fuselage: a tapered body, nose forward (-z is forward in our frame).
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 5.6, 12), paint);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, 0.4);
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 12), dark);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -2.9);
  group.add(nose);
  // Cabin glasshouse.
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), glass);
  cabin.scale.set(0.85, 0.75, 1.5);
  cabin.position.set(0, 0.55, -0.4);
  group.add(cabin);
  // Cream cheatline stripe along the fuselage.
  box(0.06, 0.28, 5.2, cream, 0.82, 0.1, 0.4);
  box(0.06, 0.28, 5.2, cream, -0.82, 0.1, 0.4);

  // High wing with a slight dihedral, plus struts.
  const wing = box(10.4, 0.18, 1.7, cream, 0, 0.78, -0.3);
  wing.rotation.z = 0; // kept level; the dihedral is in the tips below
  const tipL = box(1.4, 0.12, 1.5, paint, -5.4, 0.86, -0.3);
  tipL.rotation.z = 0.1;
  const tipR = box(1.4, 0.12, 1.5, paint, 5.4, 0.86, -0.3);
  tipR.rotation.z = -0.1;
  const strutL = box(0.08, 1.5, 0.08, dark, -1.6, 0.1, -0.3);
  strutL.rotation.z = 0.5;
  const strutR = box(0.08, 1.5, 0.08, dark, 1.6, 0.1, -0.3);
  strutR.rotation.z = -0.5;

  // Tail: horizontal stabiliser and fin, Kestrel-red.
  box(3.4, 0.14, 1.1, paint, 0, 0.25, 3.0);
  const fin = box(0.14, 1.5, 1.4, paint, 0, 0.85, 3.1);
  fin.rotation.x = -0.25;
  // Tail number plate.
  box(0.16, 0.5, 0.7, cream, 0, 0.9, 3.15);

  // Propeller: spinner + two blades, spun by main.js.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -3.7);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), cream);
  spinner.rotation.x = -Math.PI / 2;
  prop.add(spinner);
  const bladeGeo = new THREE.BoxGeometry(0.22, 2.6, 0.08);
  const blade1 = new THREE.Mesh(bladeGeo, propMat);
  prop.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo, propMat);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade2);
  group.add(prop);

  // Fixed tricycle gear: two mains, one nose wheel, with fairings.
  function wheel(x, y, z) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    group.add(w);
    const leg = box(0.1, 0.9, 0.1, dark, x, y + 0.55, z);
    return w;
  }
  wheel(-0.95, -0.95, -0.6);
  wheel(0.95, -0.95, -0.6);
  wheel(0, -0.95, -2.2);

  // Navigation lights: red left, green right, white tail — emissive so
  // they read as lit in the screenshots.
  function navLight(color, x, y, z) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 }),
    );
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  navLight(0xff2a22, -6.1, 0.85, -0.3);
  navLight(0x22ff66, 6.1, 0.85, -0.3);
  navLight(0xffffff, 0, 0.3, 3.6);

  // Landing light in the left wing root.
  const landing = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 3 }),
  );
  landing.position.set(-1.9, 0.72, -1.1);
  group.add(landing);

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  return { group, prop, landing };
}
