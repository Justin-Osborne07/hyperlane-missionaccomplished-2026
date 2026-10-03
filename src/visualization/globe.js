// Renders the globe, flight path, viewing zones and staged rocket animation.
// Other modules use the methods returned by createGlobe().

import Globe from 'globe.gl';
import * as THREE from 'three';

// SETTINGS YOU CAN TWEAK

// Earth's radius in kilometres
const EARTH_R_KM = 6371;

// Multiplies altitude so a 200 km climb is actually visible.
// 1 = true scale (very flat), higher = more dramatic.
const ALT_SCALE = 3;

// How long the full ascent takes on screen (14 seconds)
const PLAYBACK_MS = 14000;

// How big the rocket model is drawn: globe units per real metre.
// The Earth is 100 units in radius, so true scale would be invisible.
// 0.06 makes a 70 m Falcon 9 about 4 units tall. Scroll to zoom in for detail.
const ROCKET_SIZE = 0.06;

// After stage separation, how many seconds (of flight time) the falling
// stage takes to fade out completely
const STAGE_FADE_S = 90;

// Pause at the end before the animation loops
const PAUSE_MS = 1500;

// Colour of the flight path for each weather rating
const RATING_COLORS = {
  green: '#3ddc84',
  yellow: '#ffcc33',
  red: '#ff4d4d',

  // used before any weather data arrives
  none: '#9fd3ff',
};

// Earth textures (satellite photo, terrain bumps, starry background) hosted online
const IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img';

// SMALL HELPER FUNCTIONS

// Convert degrees <-> radians (JavaScript's Math functions use radians)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Shorten a launch site name for the globe label:
// "Canso — Spaceport Nova Scotia, NS" -> "Canso"
// (cuts at the first long dash or comma)
const shortName = (name) => name.split(/\s+—\s+|,/)[0].trim();

// Two pads are "the same" if they share an id, or (if there's no id)
// the same coordinates. Yosry's real launch data may not include ids.
const samePad = (a, b) =>
  a && b && (a.id ? a.id === b.id : a.lat === b.lat && a.lon === b.lon);

// globe.gl measures altitude in "Earth radii" (1 = one Earth radius above the
// surface), not kilometres. This converts km to that unit and applies the
// exaggeration from ALT_SCALE.
const altFromKm = (km) => (km / EARTH_R_KM) * ALT_SCALE;

// createGlobe(container, { onTick, onPadClick })
// Callbacks report animation time and launch-site clicks.

export function createGlobe(container, { onTick, onPadClick } = {}) {

  // Configure the globe and its label, ring, path and polygon layers.

  const globe = Globe()(container)

    // --- The Earth itself ---

    // satellite photo of Earth
    .globeImageUrl(`${IMG}/earth-blue-marble.jpg`)

    // makes mountains look raised
    .bumpImageUrl(`${IMG}/earth-topology.png`)

    // stars behind the globe
    .backgroundImageUrl(`${IMG}/night-sky.png`)

    // blue glow around the edge, and how thick it is
    .atmosphereColor('#8fb0ff')
    .atmosphereAltitude(0.18)

    // --- Launch site labels + dots (every site, clickable) ---

    .labelsData([])
    .labelLat((d) => d.lat)
    .labelLng((d) => d.lon)

    // short name, e.g. "Canso" instead of "Canso — Spaceport Nova Scotia, NS"
    .labelText((d) => shortName(d.name))

    // the selected site is bigger and orange, the others smaller and white
    .labelSize((d) => (d.selected ? 0.6 : 0.45))
    .labelDotRadius((d) => (d.selected ? 0.4 : 0.3))
    .labelColor((d) => (d.selected ? '#ffb547' : 'rgba(230, 236, 255, 0.8)'))

    .labelResolution(2)

    // clicking a site tells main.js, which then switches to that site
    .onLabelClick((d) => {
      if (onPadClick) {
        onPadClick(d.pad);
      }
    })

    // --- Pulsing orange rings at the pad (like a radar ping) ---

    .ringsData([])
    .ringLat((d) => d.lat)
    .ringLng((d) => d.lon)

    // ringColor returns a function of t (0 = ring just started, 1 = fully
    // expanded), so the ring fades out as it grows.
    .ringColor(() => (t) => `rgba(255, 181, 71, ${1 - t})`)

    // how far each ring expands (in degrees)
    .ringMaxRadius(3)

    // how fast it expands
    .ringPropagationSpeed(1.5)

    // a new ring every 1.2 seconds
    .ringRepeatPeriod(1200)

    // --- Flight path (the dashed line) ---

    .pathsData([])

    // each path object has a "points" array
    .pathPoints('points')

    .pathPointLat((p) => p.lat)
    .pathPointLng((p) => p.lon)

    // lift each point off the surface
    .pathPointAlt((p) => altFromKm(p.altKm))

    .pathColor((d) => d.color)

    // line thickness
    .pathStroke(3)

    // dash length and gap (as fractions of the whole path)
    .pathDashLength(0.06)
    .pathDashGap(0.015)

    // dashes flow along the path every 4 seconds
    .pathDashAnimateTime(4000)

    // redraw instantly when recoloured
    .pathTransitionDuration(0)

    // --- Viewing zones (bonus): see-through circles on the ground ---

    .polygonsData([])

    // more transparent for low-quality zones, more solid for high-quality ones
    .polygonCapColor((d) => `rgba(200, 215, 255, ${0.06 + 0.22 * d.properties.quality})`)

    // no visible "walls" on the sides
    .polygonSideColor(() => 'rgba(0, 0, 0, 0)')

    .polygonStrokeColor(() => 'rgba(230, 236, 255, 0.55)')

    // each circle gets its own height (see showZones below)
    .polygonAltitude((d) => d.properties.alt)

    .polygonsTransitionDuration(300);

  // The rocket isn't a globe.gl layer: we add it to the 3D scene ourselves
  // (see "The rocket" below), so we can rotate it and split it into stages.

  // Spin + sizing

  // Slowly spin the Earth until a launch is selected
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.4;

  // Keep the 3D canvas the same size as its container,
  // including when the browser window is resized
  const resize = () => {
    globe.width(container.clientWidth);
    globe.height(container.clientHeight);
  };

  window.addEventListener('resize', resize);
  resize();

  // Internal state (what's currently shown)

  let current = {
    launch: null,
    trajectory: [],
    rating: 'none',
  };

  // ID of the running animation loop, so we can stop it later
  let rafId = null;

  // Every launch site to show on the globe (set with setPads)
  let pads = [];

  // drawPads()
  // Draw a label for every launch site, highlighting the selected one.

  function drawPads() {

    const selectedPad = current.launch?.pad;

    // Make sure the current launch's pad is shown even if it isn't in the list
    // (for example, a real launch from Yosry's data at a site we didn't list)
    const allPads = [...pads];

    if (selectedPad && !allPads.some((p) => samePad(p, selectedPad))) {
      allPads.push(selectedPad);
    }

    // globe.gl needs the "selected" flag on each item to pick colour and size
    const labelItems = allPads.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      name: p.name,
      selected: samePad(p, selectedPad),
      pad: p, // the original pad, passed back on click
    }));

    globe.labelsData(labelItems);
  }

  // drawPath()
  // Draw (or redraw) the flight path in the colour matching the current weather.

  function drawPath() {

    // Nothing to draw yet
    if (current.trajectory.length === 0) {
      globe.pathsData([]);
      return;
    }

    const color = RATING_COLORS[current.rating] || RATING_COLORS.none;

    globe.pathsData([
      { points: current.trajectory, color: color },
    ]);
  }

  // Interpolate between the trajectory points surrounding simT.

  function positionAt(trajectory, simT) {

    // Index of the first point at or after simT
    let i = trajectory.findIndex((p) => p.t >= simT);

    // Handle the very start (i = 0) and the very end (not found, i = -1)
    if (i === 0) {
      i = 1;
    } else if (i === -1) {
      i = trajectory.length - 1;
    }

    // The two points either side of simT
    const a = trajectory[i - 1];
    const b = trajectory[i];

    // How far between a and b we are: 0 = exactly at a, 1 = exactly at b
    const f = (b.t === a.t) ? 0 : (simT - a.t) / (b.t - a.t);

    // Blend each value between a and b
    const lat = a.lat + (b.lat - a.lat) * f;
    const lon = a.lon + (b.lon - a.lon) * f;
    const altKm = a.altKm + (b.altKm - a.altKm) * f;

    return {
      lat: lat,
      lon: lon,
      alt: altFromKm(altKm),
    };
  }

  // playAscent()
  // Run the rocket animation.
  // requestAnimationFrame calls `frame` about 60 times a second. Each time,

  function playAscent() {

    // Stop any animation that's already running
    cancelAnimationFrame(rafId);

    const traj = current.trajectory;

    if (traj.length < 2) {
      return;
    }

    // Total flight time in seconds (time of the last point)
    const tMax = traj[traj.length - 1].t;

    // When the animation started, in milliseconds
    const start = performance.now();

    const frame = (now) => {

      // `%` (remainder) makes the animation loop:
      // it restarts every PLAYBACK_MS + PAUSE_MS milliseconds
      const elapsed = (now - start) % (PLAYBACK_MS + PAUSE_MS);

      // Map real time to flight time, holding at the end during the pause
      const progress = Math.min(elapsed / PLAYBACK_MS, 1);
      const simT = progress * tMax;

      // Move, point and (at the right moment) separate the rocket
      updateRocket(traj, simT, tMax, now);

      // Tell the page (the timeline) where we are
      if (onTick) {
        onTick(simT, tMax);
      }

      // Schedule the next frame
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
  }

  // Rocket rig: root moves along the path; lower detaches at separation.
  // Each stage has a flame, and sep stores the detached stage state.

  // Straight up in the model's own coordinates (rockets are built along +Y)
  const UP = new THREE.Vector3(0, 1, 0);

  // The current rocket rig, or null before setRocket() is called
  let rig = null;

  // buildRig(rocket)
  // Remove the old rocket (if any) and build a new one from rockets.js

  function buildRig(rocket) {

    const scene = globe.scene();

    // --- Remove the old rocket and free its memory ---
    if (rig) {
      scene.remove(rig.root);
      scene.remove(rig.lower); // in case it had already separated

      rig.root.traverse(disposeMesh);
      rig.lower.traverse(disposeMesh);
    }

    // --- Build the new model ---
    const model = rocket.build();

    // Attach each flame to its own stage, so it moves with that stage
    model.lower.add(model.lowerFlame);
    model.upper.add(model.upperFlame);

    const root = new THREE.Group();
    root.add(model.lower, model.upper);

    // Make it visible from space (see ROCKET_SIZE)
    root.scale.setScalar(ROCKET_SIZE);

    // Hidden until a launch is shown
    root.visible = current.trajectory.length > 0;

    scene.add(root);

    rig = {
      rocket: rocket,
      root: root,
      lower: model.lower,
      upper: model.upper,
      lowerFlame: model.lowerFlame,
      upperFlame: model.upperFlame,
      sep: null,
    };

    resetStages();
  }

  // Free the memory used by a mesh's shape and material
  function disposeMesh(obj) {
    if (obj.isMesh) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }

  // resetStages()
  // Put the lower stage back on the rocket (used when the animation loops).

  function resetStages() {

    // Re-attach the lower stage in its original spot
    rig.root.add(rig.lower);
    rig.lower.position.set(0, 0, 0);
    rig.lower.quaternion.identity();
    rig.lower.scale.set(1, 1, 1);
    rig.lower.visible = true;

    // Make it solid again (it was faded out after separating)
    setStageOpacity(rig.lower, 1);

    // First-stage engines on, upper stage engine off
    rig.lowerFlame.visible = true;
    rig.upperFlame.visible = false;

    rig.sep = null;
  }

  // setStageOpacity(stage, opacity)
  // Fade a stage in or out (1 = solid, 0 = invisible). Skips the flames,
  // which have their own see-through glow.

  function setStageOpacity(stage, opacity) {

    stage.traverse((obj) => {

      const isFlame = obj.material?.blending === THREE.AdditiveBlending;

      if (obj.isMesh && !isFlame) {
        obj.material.transparent = opacity < 1;
        obj.material.opacity = opacity;
      }
    });
  }

  // separateStages(dir)
  // The moment of stage separation. The lower stage is moved from the rocket
  // into the scene, keeping exactly where it is right now, so it can fall

  function separateStages(dir) {

    // attach() moves an object to a new parent without it jumping position
    globe.scene().attach(rig.lower);

    rig.sep = {
      // where the lower stage was when it separated
      pos: rig.lower.position.clone(),
      quat: rig.lower.quaternion.clone(),

      // the direction it was moving, and "down" towards the Earth's centre
      dir: dir.clone(),
      down: rig.lower.position.clone().normalize().negate(),
    };

    // First-stage engines cut off, upper stage engine lights
    rig.lowerFlame.visible = false;
    rig.upperFlame.visible = true;
  }

  // updateRocket(traj, simT, tMax, now)
  // Called every animation frame. Moves the rocket to where it should be at
  // flight time simT, points it the way it's going, handles stage

  // Reusable vectors (creating new ones 60 times a second wastes memory)
  const posNow = new THREE.Vector3();
  const posAhead = new THREE.Vector3();
  const travelDir = new THREE.Vector3();
  const tumble = new THREE.Quaternion();
  const X_AXIS = new THREE.Vector3(1, 0, 0);

  function updateRocket(traj, simT, tMax, now) {

    if (!rig) {
      return;
    }

    // --- Where is it now, and where will it be a moment later? ---

    // Look a few seconds ahead to find the direction of travel.
    // Near the end of the flight, look behind instead (there's nothing ahead).
    const tA = Math.min(simT, tMax - 3);
    const tB = tA + 3;

    const here = positionAt(traj, simT);
    const a = positionAt(traj, tA);
    const b = positionAt(traj, tB);

    // getCoords turns latitude/longitude/altitude into a 3D position (x, y, z)
    posNow.copy(globe.getCoords(here.lat, here.lon, here.alt));
    travelDir.copy(globe.getCoords(b.lat, b.lon, b.alt))
      .sub(posAhead.copy(globe.getCoords(a.lat, a.lon, a.alt)))
      .normalize();

    // --- Move the rocket and point its nose along the direction of travel ---

    rig.root.position.copy(posNow);
    rig.root.quaternion.setFromUnitVectors(UP, travelDir);

    // --- Stage separation ---

    const sepT = rig.rocket.separationT;

    // The animation looped back to before separation: put the stage back
    if (rig.sep && simT < sepT) {
      resetStages();
    }

    // Separation moment
    if (!rig.sep && simT >= sepT) {
      separateStages(travelDir);
    }

    // After separation: the lower stage drifts on briefly, falls, tumbles and fades
    if (rig.sep) {

      const tSince = simT - sepT;   // seconds since separation

      // Keeps coasting forward a little, slowing down (levels off at 2.5 units)
      const coast = 2.5 * (1 - Math.exp(-tSince / 15));

      // Falls faster and faster (like gravity: distance grows with time squared)
      const fall = 0.0004 * tSince * tSince;

      rig.lower.position.copy(rig.sep.pos)
        .addScaledVector(rig.sep.dir, coast)
        .addScaledVector(rig.sep.down, fall);

      // Slowly tumble end over end
      tumble.setFromAxisAngle(X_AXIS, 0.015 * tSince);
      rig.lower.quaternion.copy(rig.sep.quat).multiply(tumble);

      // Fade out, then hide
      const opacity = Math.max(0, 1 - tSince / STAGE_FADE_S);
      setStageOpacity(rig.lower, opacity);
      rig.lower.visible = opacity > 0;
    }

    // --- Engine shutdown at orbit ---

    // Once the rocket reaches orbit (the pause at the end), the engine stops
    if (simT >= tMax) {
      rig.upperFlame.visible = false;
    }

    // --- Flicker the flames ---
    // Stretch them slightly up and down using a fast wave plus a little randomness

    const flicker = 1 + 0.12 * Math.sin(now / 35) + 0.08 * Math.random();

    rig.lowerFlame.scale.set(1, flicker, 1);
    rig.upperFlame.scale.set(1, flicker, 1);
  }

  // Move the camera toward the middle of the trajectory.

  function flyTo(trajectory, ms = 2000) {

    const mid = trajectory[Math.floor(trajectory.length / 2)];

    globe.pointOfView(
      { lat: mid.lat - 5, lng: mid.lon, altitude: 0.9 },
      ms
    );
  }

  // Build a geographic circle as [longitude, latitude] points.
  // Use spherical destination points at evenly spaced bearings.

  function circleRing(lat, lon, radiusKm, steps = 64) {

    const phi = toRad(lat);
    const lambda = toRad(lon);

    // The radius as an angle on the sphere
    const delta = radiusKm / EARTH_R_KM;

    const ring = [];

    for (let k = 0; k <= steps; k++) {

      // Direction: 0 = north, going clockwise all the way round
      const brg = (2 * Math.PI * k) / steps;

      const lat2 = Math.asin(
        Math.sin(phi) * Math.cos(delta) +
        Math.cos(phi) * Math.sin(delta) * Math.cos(brg)
      );

      const lon2 = lambda + Math.atan2(
        Math.sin(brg) * Math.sin(delta) * Math.cos(phi),
        Math.cos(delta) - Math.sin(phi) * Math.sin(lat2)
      );

      // GeoJSON wants [longitude, latitude], in that order
      ring.push([toDeg(lon2), toDeg(lat2)]);
    }

    return ring;
  }

  // PUBLIC FUNCTIONS
  // The only things the rest of the app can call.

  return {

    // Show a launch: pad marker, flight path, rocket animation, camera move.
    showLaunch(launch, trajectory, weather) {

      current = {
        launch: launch,
        trajectory: trajectory,
        rating: weather?.rating || 'none',
      };

      // Stop spinning so the user can look at the launch
      globe.controls().autoRotate = false;

      // Highlight the selected site, and pulse rings around it
      drawPads();
      globe.ringsData([launch.pad]);

      drawPath();
      flyTo(trajectory);

      if (rig) {
        rig.root.visible = true;
      }

      playAscent();
    },

    // Choose which rocket model flies. rocket: one entry from ROCKETS in rockets.js
    setRocket(rocket) {
      buildRig(rocket);
    },

    // Show every launch site on the globe as a clickable label.
    // pads: a list of { id, name, lat, lon }
    setPads(newPads) {
      pads = newPads;
      drawPads();
    },

    // Recolour the path when the weather changes: 'green' | 'yellow' | 'red'
    setWeather(rating) {
      current.rating = rating;
      drawPath();
    },

    // Restart the rocket animation from liftoff
    replay() {
      playAscent();
    },

    // Bonus: draw viewing zones, a list of { lat, lon, radiusKm, quality }
    showZones(zones) {

      // Sort biggest first, then give each circle a slightly higher altitude.
      // If two flat shapes sit at exactly the same height, the graphics card
      // can't decide which is on top and they flicker in stripes ("z-fighting").
      const sorted = [...zones].sort((a, b) => b.radiusKm - a.radiusKm);

      // Turn each zone into a GeoJSON "Feature", the standard format for map shapes
      const features = sorted.map((z, i) => ({
        type: 'Feature',

        properties: {
          quality: z.quality,
          alt: 0.004 + i * 0.002,
        },

        geometry: {
          type: 'Polygon',
          coordinates: [circleRing(z.lat, z.lon, z.radiusKm)],
        },
      }));

      globe.polygonsData(features);
    },

    // Remove all viewing-zone circles
    clearZones() {
      globe.polygonsData([]);
    },

    // The raw globe.gl object, in case you need a setting not wrapped above
    raw: globe,
  };
}