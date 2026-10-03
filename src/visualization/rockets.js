// Approximate rocket models built from Three.js shapes, with separable stages.
// Geometry uses metres; globe.js enlarges the models for display.

import * as THREE from 'three';

// Real rockets are very thin. This widens every part a little so the
// rockets don't look like needles from far away. 1 = true proportions.
const WIDTH = 1.4;

// COLOURS

const WHITE = '#f2f2ee';
const BLACK = '#1d1f24';
const DARK_GREY = '#3a3d44';
const LIGHT_GREY = '#b9bcc2';
const SLS_ORANGE = '#d9772b';   // the foam insulation on the SLS core stage
const STEEL = '#c9ccd1';        // Starship's stainless steel

// Shape helpers place each part upright (+Y), with its bottom at y.

// A material (surface look) for a part.
// "emissive" makes it glow slightly, so the rocket is still visible on the
// night side of the Earth.
function material(color, { metal = 0.15, rough = 0.55 } = {}) {

  return new THREE.MeshStandardMaterial({
    color: color,
    metalness: metal,
    roughness: rough,
    emissive: new THREE.Color(color).multiplyScalar(0.25),
  });
}

// A cylinder (or a tapered cylinder if rTop and rBottom differ)
function cylinder(rTop, rBottom, height, color, y, options) {

  const geometry = new THREE.CylinderGeometry(
    rTop * WIDTH,
    rBottom * WIDTH,
    height,
    32  // smoothness around the edge
  );

  const mesh = new THREE.Mesh(geometry, material(color, options));

  // three.js centres cylinders on their middle, so lift it by half its height
  mesh.position.y = y + height / 2;

  return mesh;
}

// A cone pointing up (used for nose cones)
function cone(radius, height, color, y, options) {
  return cylinder(0.001, radius, height, color, y, options);
}

// A rounded nose cone (ogive), like a payload fairing or Starship's nose.
// Made by spinning a curved outline around the vertical axis ("lathe").
function ogive(radius, height, color, y, options) {

  const outline = [];
  const steps = 16;

  for (let i = 0; i <= steps; i++) {

    const f = i / steps;   // 0 at the base, 1 at the tip

    // A curve that stays wide near the base, then narrows smoothly to a point
    const r = radius * WIDTH * Math.pow(Math.cos(f * Math.PI / 2), 0.7);

    outline.push(new THREE.Vector2(Math.max(r, 0.001), f * height));
  }

  const geometry = new THREE.LatheGeometry(outline, 32);
  const mesh = new THREE.Mesh(geometry, material(color, options));

  mesh.position.y = y;

  return mesh;
}

// A flat box (used for fins, legs, grid fins, flaps)
function box(width, height, depth, color, x, y, z) {

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material(color));

  mesh.position.set(x, y + height / 2, z);

  return mesh;
}

// Place copies of a part evenly around the rocket (e.g. 4 fins at 90° apart).
//   makePart(angle): builds one part and positions it for that angle
function around(count, makePart, startAngle = 0) {

  const parts = [];

  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / count) * Math.PI * 2;
    parts.push(makePart(angle));
  }

  return parts;
}

// An engine flame: a glowing cone pointing DOWN from height y.
// Two layers: a wide orange outer flame and a bright yellow-white core.
// AdditiveBlending makes overlapping glow add up, like real light.
function flame(radius, length, y) {

  const group = new THREE.Group();

  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(radius * WIDTH, length, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#ff8a2b',
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const core = new THREE.Mesh(
    new THREE.ConeGeometry(radius * WIDTH * 0.5, length * 0.6, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#fff3c4',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  // Cones point up by default; flip them so they point down
  outer.rotation.x = Math.PI;
  core.rotation.x = Math.PI;

  // Hang them below y (the flame's top touches the engines)
  outer.position.y = -length / 2;
  core.position.y = -length * 0.3;

  group.add(outer, core);
  group.position.y = y;

  return group;
}

// Put a list of meshes into a group
function groupOf(parts) {
  const group = new THREE.Group();
  group.add(...parts);
  return group;
}

// Standard timeline for a rocket: liftoff, Max Q, separation, orbit
function events(maxQ, sepT, sepLabel) {
  return [
    { t: 0, label: 'Liftoff' },
    { t: maxQ, label: 'Max Q' },
    { t: sepT, label: sepLabel },
    { t: 540, label: 'Orbit insertion' },
  ];
}

// Each build() returns lower/upper groups and their engine flames.

export const ROCKETS = [

  // FALCON 9 (SpaceX): 70 m, white with a black interstage, landing legs
  {
    id: 'falcon9',
    name: 'Falcon 9',
    separationT: 160,
    events: events(72, 160, 'Stage separation'),

    build() {

      const lower = groupOf([

        // engine section at the base
        cylinder(1.85, 1.95, 1.5, DARK_GREY, 0),

        // first stage
        cylinder(1.85, 1.85, 41, WHITE, 1.5),

        // black interstage on top of the first stage
        cylinder(1.85, 1.85, 5, BLACK, 42.5),

        // 4 folded landing legs
        ...around(4, (a) => {
          const leg = box(0.3, 9, 1.0, BLACK, Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
          leg.rotation.y = -a;
          return leg;
        }),

        // 4 grid fins near the top
        ...around(4, (a) => {
          const fin = box(1.6, 1.2, 0.2, DARK_GREY, Math.cos(a) * 3.1, 40, Math.sin(a) * 3.1);
          fin.rotation.y = -a + Math.PI / 2;
          return fin;
        }, Math.PI / 4),
      ]);

      const upper = groupOf([

        // second stage
        cylinder(1.85, 1.85, 12, WHITE, 47.5),

        // payload fairing: a wider cylinder with a rounded nose
        cylinder(2.6, 2.0, 1.5, WHITE, 59.5),
        cylinder(2.6, 2.6, 5, WHITE, 61),
        ogive(2.6, 6, WHITE, 66),
      ]);

      return {
        lower,
        upper,
        lowerFlame: flame(2.2, 26, 0),
        upperFlame: flame(1.3, 14, 47.5),
      };
    },
  },

  // FALCON HEAVY (SpaceX): three Falcon 9 cores strapped together
  {
    id: 'falconheavy',
    name: 'Falcon Heavy',
    separationT: 150,
    events: events(66, 150, 'Booster separation'),

    build() {

      // Distance from the centre core to each side booster
      const side = 3.85 * WIDTH;

      // One first-stage core, shifted sideways by x
      const core = (x, withNose) => [
        cylinder(1.85, 1.95, 1.5, DARK_GREY, 0),
        cylinder(1.85, 1.85, 41, WHITE, 1.5),
        withNose
          ? cone(1.85, 6, WHITE, 42.5)            // side boosters have nose cones
          : cylinder(1.85, 1.85, 5, BLACK, 42.5), // centre core has the interstage
      ].map((mesh) => {
        mesh.position.x += x;
        return mesh;
      });

      const lower = groupOf([
        ...core(0, false),
        ...core(-side, true),
        ...core(side, true),
      ]);

      const upper = groupOf([
        cylinder(1.85, 1.85, 12, WHITE, 47.5),
        cylinder(2.6, 2.0, 1.5, WHITE, 59.5),
        cylinder(2.6, 2.6, 5, WHITE, 61),
        ogive(2.6, 6, WHITE, 66),
      ]);

      // Three flames for three cores, grouped together
      const lowerFlame = new THREE.Group();

      for (const x of [-side, 0, side]) {
        const f = flame(2.2, 26, 0);
        f.position.x = x;
        lowerFlame.add(f);
      }

      return {
        lower,
        upper,
        lowerFlame,
        upperFlame: flame(1.3, 14, 47.5),
      };
    },
  },

  // SLS BLOCK 1 (NASA Artemis): 98 m, orange core stage, two white solid
  // rocket boosters, and the Orion crew capsule with its escape tower on top
  {
    id: 'sls',
    name: 'SLS (Artemis)',
    separationT: 132,
    events: events(70, 132, 'Booster separation'),

    build() {

      // Distance from the core to each solid rocket booster
      const side = (4.2 + 1.85 + 0.4) * WIDTH;

      // One solid rocket booster, shifted sideways by x
      const booster = (x) => [
        cylinder(1.85, 2.3, 4, WHITE, 0),     // flared skirt at the bottom
        cylinder(1.85, 1.85, 47, WHITE, 4),
        cone(1.85, 6, WHITE, 51),             // nose cone
      ].map((mesh) => {
        mesh.position.x += x;
        return mesh;
      });

      const lower = groupOf([

        // engine section
        cylinder(4.2, 4.2, 4, DARK_GREY, 0),

        // orange core stage
        cylinder(4.2, 4.2, 61, SLS_ORANGE, 4),

        // the two solid rocket boosters
        ...booster(-side),
        ...booster(side),
      ]);

      const upper = groupOf([

        // stage adapter: tapers from the core's width to the upper stage
        cylinder(2.6, 4.2, 8, LIGHT_GREY, 65),

        // upper stage (ICPS)
        cylinder(2.6, 2.6, 6, WHITE, 73),

        // Orion service module
        cylinder(2.5, 2.5, 4, LIGHT_GREY, 79),

        // Orion crew capsule (a squat cone)
        cylinder(1.0, 2.5, 3.3, WHITE, 83),

        // launch abort system: a fairing over the capsule, then the tower
        cone(1.1, 3, WHITE, 86.3),
        cylinder(0.45, 0.45, 6, WHITE, 89),
        cone(0.45, 3, BLACK, 95),
      ]);

      // Core stage engines + both boosters fire together
      const lowerFlame = new THREE.Group();
      lowerFlame.add(flame(3.5, 30, 0));

      for (const x of [-side, side]) {
        const f = flame(2.3, 38, 0);
        f.position.x = x;
        lowerFlame.add(f);
      }

      return {
        lower,
        upper,
        lowerFlame,
        upperFlame: flame(1.6, 14, 65),
      };
    },
  },

  // SATURN V (NASA Apollo): 111 m, white with black roll-pattern bands,
  // four big fins at the base
  {
    id: 'saturnv',
    name: 'Saturn V',
    separationT: 162,
    events: events(83, 162, 'Stage separation'),

    build() {

      const lower = groupOf([

        // engine bells peeking out underneath
        ...around(4, (a) => {
          const bell = cylinder(0.6, 1.9, 3, DARK_GREY, -1, {});
          bell.position.x = Math.cos(a) * 3;
          bell.position.z = Math.sin(a) * 3;
          return bell;
        }, Math.PI / 4),

        // first stage (S-IC) with black bands near the bottom and top
        cylinder(5, 5, 6, BLACK, 2),
        cylinder(5, 5, 26, WHITE, 8),
        cylinder(5, 5, 6, BLACK, 34),
        cylinder(5, 5, 2, WHITE, 40),

        // the four fins
        ...around(4, (a) => {
          const fin = box(4, 9, 0.4, WHITE, Math.cos(a) * 9, 0, Math.sin(a) * 9);
          fin.rotation.y = -a;
          return fin;
        }, Math.PI / 4),
      ]);

      const upper = groupOf([

        // second stage (S-II)
        cylinder(5, 5, 25, WHITE, 42),

        // tapered adapter to the narrower third stage
        cylinder(3.3, 5, 6, WHITE, 67),

        // third stage (S-IVB) with a black band
        cylinder(3.3, 3.3, 14, WHITE, 73),
        cylinder(3.3, 3.3, 2, BLACK, 87),

        // spacecraft adapter, service module, command module
        cylinder(2, 3.3, 8, WHITE, 89),
        cylinder(2, 2, 5, LIGHT_GREY, 97),
        cone(2, 3.5, LIGHT_GREY, 102),

        // launch escape tower
        cylinder(0.3, 0.3, 4, BLACK, 105.5),
        cone(0.5, 2, BLACK, 109.5),
      ]);

      return {
        lower,
        upper,
        lowerFlame: flame(5, 40, -1),
        upperFlame: flame(2.5, 18, 42),
      };
    },
  },

  // STARSHIP (SpaceX): 121 m, all stainless steel. Super Heavy booster on the
  // bottom, Starship on top. Separates by "hot staging": the ship lights its
  // engines while still attached.
  {
    id: 'starship',
    name: 'Starship',
    separationT: 160,
    events: events(62, 160, 'Hot staging'),

    build() {

      const steel = { metal: 0.8, rough: 0.35 };

      const lower = groupOf([

        // Super Heavy booster
        cylinder(4.5, 4.5, 69, STEEL, 0, steel),

        // dark hot-staging ring on top
        cylinder(4.5, 4.5, 2, DARK_GREY, 69),

        // 4 grid fins near the top
        ...around(4, (a) => {
          const fin = box(3, 2.5, 0.4, DARK_GREY, Math.cos(a) * 7.2, 64, Math.sin(a) * 7.2);
          fin.rotation.y = -a + Math.PI / 2;
          return fin;
        }, Math.PI / 4),
      ]);

      const upper = groupOf([

        // Starship body and rounded nose
        cylinder(4.5, 4.5, 40, STEEL, 71, steel),
        ogive(4.5, 10, STEEL, 111, steel),

        // two big rear flaps and two small front flaps (black heat shield side)
        ...[-1, 1].map((side) => box(4, 9, 0.5, BLACK, side * 8.3, 72, 0)),
        ...[-1, 1].map((side) => box(2.5, 5, 0.4, BLACK, side * 7.5, 106, 0)),
      ]);

      return {
        lower,
        upper,
        lowerFlame: flame(4.5, 38, 0),
        upperFlame: flame(3, 22, 71),
      };
    },
  },
];

// rocketFor(name)
// Find the model for a rocket name, e.g. from Yosry's real launch data
// ("Falcon 9 Block 5" -> Falcon 9). Falls back to Falcon 9 if unknown.

export function rocketFor(name = '') {

  const n = name.toLowerCase();

  // Starship first, because "Super Heavy" also contains the word "heavy"
  if (n.includes('starship') || n.includes('super heavy')) return ROCKETS.find((r) => r.id === 'starship');
  if (n.includes('heavy')) return ROCKETS.find((r) => r.id === 'falconheavy');
  if (n.includes('falcon')) return ROCKETS.find((r) => r.id === 'falcon9');
  if (n.includes('sls') || n.includes('artemis')) return ROCKETS.find((r) => r.id === 'sls');
  if (n.includes('saturn')) return ROCKETS.find((r) => r.id === 'saturnv');

  // Exact id match (e.g. 'sls'), otherwise the default
  return ROCKETS.find((r) => r.id === n) || ROCKETS[0];
}