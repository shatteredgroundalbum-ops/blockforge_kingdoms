import * as THREE from 'three';

// A glowing vertical beacon + hovering diamond used to mark points of interest
// (survivors to rescue, the recovered relic). Emissive so bloom picks it up.
export interface Beacon {
  group: THREE.Group;
  update: (t: number) => void;
}

export function createBeacon(color: number): Beacon {
  const group = new THREE.Group();

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 12, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    }),
  );
  beam.position.y = 6;
  group.add(beam);

  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, roughness: 0.4 }),
  );
  diamond.position.y = 2.6;
  group.add(diamond);

  return {
    group,
    update: (t: number) => {
      diamond.rotation.y = t * 1.6;
      diamond.position.y = 2.6 + Math.sin(t * 2) * 0.2;
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.24 + Math.sin(t * 3) * 0.1;
    },
  };
}

// The Verdant Crown of Greenhaven: a hovering, rotating royal relic.
export interface Relic {
  group: THREE.Group;
  update: (t: number) => void;
}

export function createVerdantCrown(): Relic {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffcf5a,
    emissive: 0x6a4a00,
    metalness: 0.9,
    roughness: 0.25,
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 14, 1, true), gold);
  group.add(band);
  // Crown points with green gems.
  const gem = new THREE.MeshStandardMaterial({
    color: 0x4fd66a,
    emissive: 0x1f7a35,
    emissiveIntensity: 2.0,
    metalness: 0.3,
    roughness: 0.2,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 5), gold);
    point.position.set(Math.cos(a) * 0.6, 0.32, Math.sin(a) * 0.6);
    group.add(point);
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), gem);
    g.position.set(Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6);
    group.add(g);
  }
  const glow = new THREE.PointLight(0x8fffa0, 2.0, 12, 2);
  glow.position.y = 0.4;
  group.add(glow);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });

  return {
    group,
    update: (t: number) => {
      group.rotation.y = t * 0.9;
      group.position.y = group.userData.baseY + 1.4 + Math.sin(t * 1.8) * 0.18;
      glow.intensity = 1.6 + Math.sin(t * 4) * 0.5;
    },
  };
}
