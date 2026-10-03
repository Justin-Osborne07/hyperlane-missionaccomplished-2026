// =============================================================================
// globe.js  (Colby)
// -----------------------------------------------------------------------------
// Everything 3D lives in this file. It uses globe.gl, a library that draws an
// interactive 3D Earth using three.js (the 3D graphics library underneath).
//
// The rest of the app never touches globe.gl directly. Instead it calls the
// small set of functions returned at the bottom of createGlobe():
//
//   setPads(pads)                            -> show every launch site as a clickable label
//   setRocket(rocket)                        -> choose which 3D rocket model flies
//   showLaunch(launch, trajectory, weather)  -> draw a launch and animate it
//   setWeather(rating)                       -> recolour the flight path
//   replay()                                 -> restart the rocket animation
//   showViewingAreas(areas) / clearZones()   -> the three viewing zones (bonus)
//   showSpots(spots) / flyToSpot(spot)       -> viewing spot pins (bonus)
//   setCameraMode('globe' | 'side' | 'cockpit')
//                                            -> normal globe view, a side-on view
//                                               showing the arc, or the view out of
//                                               the rocket's side window
//   showZones(zones)                         -> older circle-style zones (unused now)
//
// Keeping it this way means the rest of the team can change their code freely
// without breaking the globe, and vice versa.
// =============================================================================


import Globe from 'globe.gl';
import * as THREE from 'three';


// =============================================================================
// SETTINGS YOU CAN TWEAK
// =============================================================================

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

// How long camera moves between views take
const CAMERA_MOVE_MS = 1800;

// Colour of the flight path for each weather rating
const RATING_COLORS = {
  green: '#3ddc84',
  yellow: '#ffcc33',
  red: '#ff4d4d',

  // used before any weather data arrives
  none: '#9fd3ff',
};

// Colours for the three viewing zones (see viewing-areas.js)
const AREA_STYLES = {
  low: { fill: 'rgba(143, 176, 255, 0.10)', stroke: 'rgba(170, 195, 255, 0.45)', alt: 0.003 },
  high: { fill: 'rgba(143, 176, 255, 0.26)', stroke: 'rgba(200, 215, 255, 0.75)', alt: 0.005 },
  liftoff: { fill: 'rgba(255, 181, 71, 0.40)', stroke: 'rgba(255, 181, 71, 0.95)', alt: 0.007 },
};

// Pin colours for viewing spots, by cost (matches the price tags in style.css)
export const COST_COLORS = {
  free: '#3ddc84',
  fee: '#8fb0ff',
  admission: '#b59cff',
  ticket: '#ffb547',
};

// Earth textures (satellite photo, terrain bumps, starry background) hosted online
const IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img';


// =============================================================================
// SMALL HELPER FUNCTIONS
// =============================================================================

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


// =============================================================================
// createGlobe(container, options)
// -----------------------------------------------------------------------------
//   container:
//     the HTML element to draw the globe inside (the #globe div)
//
//   options.onTick(simT, tMax):
//     optional function called every animation frame with the rocket's
//     current flight time, so other parts of the page (like the ascent
//     timeline) can stay in sync with the animation.
//
//   options.onPadClick(pad):
//     optional function called when someone clicks a launch site on the globe.
//
//   options.onSpotClick(spot):
//     optional function called when someone clicks a viewing spot pin.
//
//   options.onCameraChange(mode):
//     optional function called when the globe switches camera mode by itself
//     (e.g. leaving side view to zoom in on a viewing spot).
// =============================================================================

export function createGlobe(container, { onTick, onPadClick, onSpotClick, onCameraChange } = {}) {

  // ---------------------------------------------------------------------------
  // Build the globe
  // ---------------------------------------------------------------------------
  // globe.gl uses "method chaining": each .something() call configures one
  // setting and returns the globe again, so the calls can be stacked.
  //
  // Each visual feature is a "layer" (labels, rings, paths, polygons, objects).
  // For every layer we set:
  //   - xxxData([...])  : the list of things to draw (starts empty, filled later)
  //   - accessor functions telling globe.gl where to find lat/lon/colour/etc.
  //     on each item in that list.

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


    // --- Viewing zones (bonus): see-through shapes on the ground ---
    // Each shape carries its own fill colour, outline colour and height
    // in its "properties" (set in showViewingAreas / showZones below).

    .polygonsData([])
    .polygonCapColor((d) => d.properties.fill)

    // no visible "walls" on the sides
    .polygonSideColor(() => 'rgba(0, 0, 0, 0)')

    .polygonStrokeColor((d) => d.properties.stroke)

    // each shape sits at its own height so overlaps don't flicker (z-fighting)
    .polygonAltitude((d) => d.properties.alt)

    .polygonsTransitionDuration(300)


    // --- Viewing spots (bonus): small coloured pins ---

    .pointsData([])
    .pointLat((d) => d.lat)
    .pointLng((d) => d.lon)

    // colour by cost: free, entrance fee, admission, paid ticket
    .pointColor((d) => COST_COLORS[d.cost.kind])

    // pin size in degrees (cities slightly bigger) and height
    .pointRadius((d) => (d.city ? 0.09 : 0.05))
    .pointAltitude(0.004)

    // tooltip when you hover over a pin
    .pointLabel((d) => `<b>${d.name}</b><br>${d.cost.label}`)

    // clicking a pin tells main.js
    .onPointClick((d) => {
      if (onSpotClick) {
        onSpotClick(d);
      }
    });


  // The rocket isn't a globe.gl layer: we add it to the 3D scene ourselves
  // (see "The rocket" below), so we can rotate it and split it into stages.


  // ---------------------------------------------------------------------------
  // Spin + sizing
  // ---------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // Internal state (what's currently shown)
  // ---------------------------------------------------------------------------

  let current = {
    launch: null,
    trajectory: [],
    rating: 'none',
  };

  // ID of the running animation loop, so we can stop it later
  let rafId = null;

  // Every launch site to show on the globe (set with setPads)
  let pads = [];


  // ---------------------------------------------------------------------------
  // drawPads()
  // Draw a label for every launch site, highlighting the selected one.
  // ---------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // drawPath()
  // Draw (or redraw) the flight path in the colour matching the current weather.
  // ---------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // positionAt(trajectory, simT)
  // Work out where the rocket is at flight time simT (seconds after liftoff).
  //
  // The trajectory is a list of points, so we find the two points either side
  // of simT and blend between them ("linear interpolation").
  // ---------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // playAscent()
  // Run the rocket animation.
  //
  // requestAnimationFrame calls `frame` about 60 times a second. Each time,
  // we move the rocket to where it should be right now.
  // ---------------------------------------------------------------------------

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


  // ===========================================================================
  // THE ROCKET
  // ---------------------------------------------------------------------------
  // The "rig" holds the current 3D rocket model:
  //
  //   root:        a group that moves along the flight path and points the
  //                rocket in the direction it's travelling
  //   lower/upper: the two stages (from rockets.js). At stage separation the
  //                lower stage is detached from root and left to fall away.
  //   lowerFlame / upperFlame: engine flames, switched on and off by stage
  //   sep:         where and how the lower stage separated (filled in later)
  // ===========================================================================

  // Straight up in the model's own coordinates (rockets are built along +Y)
  const UP = new THREE.Vector3(0, 1, 0);

  // The current rocket rig, or null before setRocket() is called
  let rig = null;


  // ---------------------------------------------------------------------------
  // buildRig(rocket)
  // Remove the old rocket (if any) and build a new one from rockets.js
  // ---------------------------------------------------------------------------

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
      height: model.height,   // metres, used to find the capsule for Cockpit view
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


  // ---------------------------------------------------------------------------
  // resetStages()
  // Put the lower stage back on the rocket (used when the animation loops).
  // ---------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // setStageOpacity(stage, opacity)
  // Fade a stage in or out (1 = solid, 0 = invisible). Skips the flames,
  // which have their own see-through glow.
  // ---------------------------------------------------------------------------

  function setStageOpacity(stage, opacity) {

    stage.traverse((obj) => {

      const isFlame = obj.material?.blending === THREE.AdditiveBlending;

      if (obj.isMesh && !isFlame) {
        obj.material.transparent = opacity < 1;
        obj.material.opacity = opacity;
      }
    });
  }


  // ---------------------------------------------------------------------------
  // separateStages(dir)
  // The moment of stage separation. The lower stage is moved from the rocket
  // into the scene, keeping exactly where it is right now, so it can fall
  // away on its own while the upper stage keeps flying.
  //   dir: the direction the rocket is travelling at this moment
  // ---------------------------------------------------------------------------

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


  // ---------------------------------------------------------------------------
  // updateRocket(traj, simT, tMax, now)
  // Called every animation frame. Moves the rocket to where it should be at
  // flight time simT, points it the way it's going, handles stage
  // separation, and makes the flames flicker.
  // ---------------------------------------------------------------------------

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


    // --- Cockpit view: put the camera at the rocket's window ---

    if (cameraMode === 'cockpit') {
      placeCockpitCamera(traj, simT, sepT);
    }
  }


  // ---------------------------------------------------------------------------
  // placeCockpitCamera(traj, simT, sepT)
  // Puts the camera just outside the capsule's side window, looking out
  // sideways and a little down towards the Earth.
  //
  // The camera's "up" is the rocket's nose direction, like a real window
  // fixed to the rocket. So at liftoff the horizon is level, and as the
  // rocket pitches over towards horizontal, the horizon tilts in the window.
  //
  // The camera shakes at liftoff and at stage separation.
  // ---------------------------------------------------------------------------

  const camUp = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const shake = new THREE.Vector3();

  function placeCockpitCamera(traj, simT, sepT) {

    // "Up" at the rocket's position (pointing away from the Earth's centre)
    const localUp = posNow.clone().normalize();

    // The direction along the ground the flight heads in overall
    // (start to end of the trajectory, flattened along the ground)
    const first = traj[0];
    const last = traj[traj.length - 1];
    const startPos = toVec(globe.getCoords(first.lat, first.lon, 0));
    const endPos = toVec(globe.getCoords(last.lat, last.lon, 0));
    const along = endPos.sub(startPos);
    along.addScaledVector(localUp, -along.dot(localUp)).normalize();

    // Out of the window: sideways, at right angles to the flight direction
    const side = new THREE.Vector3().crossVectors(along, localUp).normalize();

    // Look out sideways, tilted 15° down towards the Earth
    const tilt = 15 * (Math.PI / 180);
    camForward.copy(side).multiplyScalar(Math.cos(tilt))
      .addScaledVector(localUp, -Math.sin(tilt))
      .normalize();

    // The window sits near the top of the rocket (the capsule) on its side
    const capsuleHeight = rig.height * 0.82 * ROCKET_SIZE;

    camera.position.copy(posNow)
      .addScaledVector(travelDir, capsuleHeight)
      .addScaledVector(side, 0.6);

    // Shake: strong at liftoff (fading over 35 s), plus a jolt at separation
    const strength =
      0.05 * Math.max(0, 1 - simT / 35) +
      0.08 * Math.exp(-Math.abs(simT - sepT) / 4);

    shake.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(strength);

    camera.position.add(shake);

    // Camera "up" = the rocket's nose direction, straightened so it's at
    // right angles to where the camera looks
    camUp.copy(travelDir).addScaledVector(camForward, -travelDir.dot(camForward)).normalize();
    camera.up.copy(camUp);

    // Look out of the window
    lookPoint.copy(camera.position).addScaledVector(camForward, 10);
    camera.lookAt(lookPoint);
  }


  // ===========================================================================
  // CAMERA
  // ---------------------------------------------------------------------------
  // Two camera modes:
  //
  //   'globe': the normal view. globe.gl's controls let you spin and zoom the
  //            Earth, always looking at its centre.
  //
  //   'side':  a view from low over the ground, off to one side of the flight
  //            path, looking across it so you see the arc of the climb in
  //            profile (like watching from the beach).
  //
  // globe.gl's controls always aim the camera at the Earth's centre, so in
  // side mode we switch them off and aim the camera ourselves. We also add a
  // simple drag-to-orbit and scroll-to-zoom for side mode (see below).
  // ===========================================================================

  const camera = globe.camera();
  const controls = globe.controls();

  // 'globe' or 'side'
  let cameraMode = 'globe';

  // Where the camera is currently looking (needed to blend between views)
  const lookPoint = new THREE.Vector3(0, 0, 0);

  // ID of the running camera move, so a new move can cancel it
  let camMoveId = null;

  // Straight up in world space (the normal "up" for the globe view)
  const WORLD_UP = new THREE.Vector3(0, 1, 0);


  // ---------------------------------------------------------------------------
  // globePose(trajectory)
  // Where the camera sits for the normal globe view: above the middle of the
  // flight path, tilted slightly (lat - 5) so we look "up" the path,
  // looking at the Earth's centre.
  // ---------------------------------------------------------------------------

  function globePose(trajectory) {

    const mid = trajectory[Math.floor(trajectory.length / 2)];
    const p = globe.getCoords(mid.lat - 5, mid.lon, 0.9);

    return {
      position: new THREE.Vector3(p.x, p.y, p.z),
      look: new THREE.Vector3(0, 0, 0),
      up: WORLD_UP.clone(),
    };
  }


  // ---------------------------------------------------------------------------
  // sidePose(trajectory)
  // Where the camera sits for the side view.
  //
  //   1. Find the ground point under the middle of the arc, and "up" there.
  //   2. Find the direction the rocket travels, flattened along the ground.
  //   3. Step sideways from the arc (at right angles to the travel direction)
  //      and a little upwards: that's the camera position.
  //   4. Look at a point halfway up the arc.
  //
  // The camera's "up" is set to the local up, so the horizon looks level.
  // The side is chosen so the rocket flies from left to right on screen.
  // ---------------------------------------------------------------------------

  function sidePose(trajectory) {

    const first = trajectory[0];
    const last = trajectory[trajectory.length - 1];

    // 3D positions of the start (on the pad) and end (in orbit) of the arc
    const start = toVec(globe.getCoords(first.lat, first.lon, altFromKm(first.altKm)));
    const end = toVec(globe.getCoords(last.lat, last.lon, altFromKm(last.altKm)));

    // 1. Ground point under the middle of the arc, and "up" there
    const up = start.clone().add(end).normalize();
    const midGround = up.clone().multiplyScalar(globe.getGlobeRadius());

    // 2. Travel direction, flattened along the ground (remove the "up" part)
    const travel = end.clone().sub(start);
    const along = travel.clone().addScaledVector(up, -travel.dot(up)).normalize();

    // Sideways: at right angles to both "along" and "up".
    // This order (along × up) puts the launch on the left of the screen.
    const side = new THREE.Vector3().crossVectors(along, up).normalize();

    // How long and how tall the arc is (in globe units)
    const arcLength = travel.length();
    const peak = Math.max(...trajectory.map((p) => altFromKm(p.altKm))) * globe.getGlobeRadius();

    // 3. Camera: off to the side, about as far away as the arc is long,
    //    and raised a little so the start of the arc isn't hidden by the
    //    Earth's curve
    const position = midGround.clone()
      .addScaledVector(side, arcLength * 1.05)
      .addScaledVector(up, peak * 0.35);

    // 4. Look halfway up the arc
    const look = midGround.clone().addScaledVector(up, peak * 0.5);

    return { position, look, up };
  }


  // Turn {x, y, z} into a three.js vector
  function toVec(p) {
    return new THREE.Vector3(p.x, p.y, p.z);
  }


  // ---------------------------------------------------------------------------
  // moveCamera(pose, onDone)
  // Smoothly glide the camera to a new pose (position, look point, up),
  // blending all three at once. "Ease in-out" starts and ends gently.
  // ---------------------------------------------------------------------------

  function moveCamera(pose, onDone) {

    cancelAnimationFrame(camMoveId);

    // Our own movement needs globe.gl's controls switched off, otherwise they
    // would keep pulling the camera back to look at the Earth's centre
    controls.enabled = false;

    const fromPos = camera.position.clone();
    const fromLook = lookPoint.clone();
    const fromUp = camera.up.clone();
    const startTime = performance.now();

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const step = (now) => {

      const t = Math.min((now - startTime) / CAMERA_MOVE_MS, 1);
      const e = ease(t);

      camera.position.lerpVectors(fromPos, pose.position, e);
      lookPoint.lerpVectors(fromLook, pose.look, e);
      camera.up.lerpVectors(fromUp, pose.up, e).normalize();
      camera.lookAt(lookPoint);

      if (t < 1) {
        camMoveId = requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
    };

    camMoveId = requestAnimationFrame(step);
  }


  // ---------------------------------------------------------------------------
  // flyTo(trajectory)
  // Move the camera to show a flight path, in whichever mode is active.
  // ---------------------------------------------------------------------------

  function flyTo(trajectory) {

    // Cockpit view: the camera rides with the rocket, so updateRocket()
    // places it every frame. Just stop any glide and switch the controls off.
    if (cameraMode === 'cockpit') {
      cancelAnimationFrame(camMoveId);
      controls.enabled = false;
      return;
    }

    if (cameraMode === 'side') {
      moveCamera(sidePose(trajectory));
      return;
    }

    // Globe view: glide there, then hand control back to globe.gl
    moveCamera(globePose(trajectory), handBackControls);
  }


  // Give the camera back to globe.gl's controls (spin and zoom the globe)
  function handBackControls() {
    camera.up.copy(WORLD_UP);
    lookPoint.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
  }


  // ---------------------------------------------------------------------------
  // Side view: drag to orbit around the arc, scroll to zoom.
  // (globe.gl's own controls are off in side mode, so we add simple ones.)
  // ---------------------------------------------------------------------------

  let dragX = null;

  container.addEventListener('pointerdown', (e) => {
    if (cameraMode === 'side') {
      dragX = e.clientX;
    }
  });

  window.addEventListener('pointerup', () => {
    dragX = null;
  });

  container.addEventListener('pointermove', (e) => {

    if (cameraMode !== 'side' || dragX === null) {
      return;
    }

    // Rotate the camera around the look point, about the local "up" axis
    const angle = -(e.clientX - dragX) * 0.004;
    dragX = e.clientX;

    const offset = camera.position.clone().sub(lookPoint);
    offset.applyAxisAngle(camera.up, angle);

    camera.position.copy(lookPoint).add(offset);
    camera.lookAt(lookPoint);
  });

  container.addEventListener('wheel', (e) => {

    if (cameraMode !== 'side') {
      return;
    }

    e.preventDefault();

    // Scroll down = move away, up = move closer, within sensible limits
    const offset = camera.position.clone().sub(lookPoint);
    const factor = e.deltaY > 0 ? 1.08 : 0.92;
    const newLength = Math.min(Math.max(offset.length() * factor, 4), 150);

    offset.setLength(newLength);
    camera.position.copy(lookPoint).add(offset);
    camera.lookAt(lookPoint);
  }, { passive: false });


  // ---------------------------------------------------------------------------
  // circleRing(lat, lon, radiusKm)
  // Build a circle of radiusKm around (lat, lon) as a list of [lon, lat] points.
  //
  // You can't just draw a circle in degrees on a sphere, so we walk around the
  // centre in 64 steps, using the "destination point" formula to find the spot
  // radiusKm away in each direction (bearing).
  // ---------------------------------------------------------------------------

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


  // ===========================================================================
  // PUBLIC FUNCTIONS
  // The only things the rest of the app can call.
  // ===========================================================================

  return {

    // -------------------------------------------------------------------------
    // Show a launch: pad marker, flight path, rocket animation, camera move.
    // -------------------------------------------------------------------------
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


    // -------------------------------------------------------------------------
    // Choose which rocket model flies. rocket: one entry from ROCKETS in rockets.js
    // -------------------------------------------------------------------------
    setRocket(rocket) {
      buildRig(rocket);
    },


    // -------------------------------------------------------------------------
    // Show every launch site on the globe as a clickable label.
    // pads: a list of { id, name, lat, lon }
    // -------------------------------------------------------------------------
    setPads(newPads) {
      pads = newPads;
      drawPads();
    },


    // -------------------------------------------------------------------------
    // Recolour the path when the weather changes: 'green' | 'yellow' | 'red'
    // -------------------------------------------------------------------------
    setWeather(rating) {
      current.rating = rating;
      drawPath();
    },


    // -------------------------------------------------------------------------
    // Restart the rocket animation from liftoff
    // -------------------------------------------------------------------------
    replay() {
      playAscent();
    },


    // -------------------------------------------------------------------------
    // Bonus: draw viewing zones, a list of { lat, lon, radiusKm, quality }
    // -------------------------------------------------------------------------
    showZones(zones) {

      // Sort biggest first, then give each circle a slightly higher altitude.
      // If two flat shapes sit at exactly the same height, the graphics card
      // can't decide which is on top and they flicker in stripes ("z-fighting").
      const sorted = [...zones].sort((a, b) => b.radiusKm - a.radiusKm);

      // Turn each zone into a GeoJSON "Feature", the standard format for map shapes
      const features = sorted.map((z, i) => ({
        type: 'Feature',

        properties: {
          fill: `rgba(200, 215, 255, ${0.06 + 0.22 * z.quality})`,
          stroke: 'rgba(230, 236, 255, 0.55)',
          alt: 0.004 + i * 0.002,
        },

        geometry: {
          type: 'Polygon',
          coordinates: [circleRing(z.lat, z.lon, z.radiusKm)],
        },
      }));

      globe.polygonsData(features);
    },


    // -------------------------------------------------------------------------
    // Bonus: draw the three viewing zones from viewing-areas.js
    // areas: [{ id: 'low' | 'high' | 'liftoff', ring: [[lon, lat], ...] }]
    // -------------------------------------------------------------------------
    showViewingAreas(areas) {

      const features = areas.map((area) => ({
        type: 'Feature',
        properties: AREA_STYLES[area.id],
        geometry: { type: 'Polygon', coordinates: [area.ring] },
      }));

      globe.polygonsData(features);
    },


    // -------------------------------------------------------------------------
    // Bonus: show viewing spot pins. spots: entries from viewing-spots.js
    // -------------------------------------------------------------------------
    showSpots(spots) {
      globe.pointsData(spots);
    },


    // -------------------------------------------------------------------------
    // Zoom the camera right in on one viewing spot
    // -------------------------------------------------------------------------
    flyToSpot(spot) {

      // Spots are shown from above, so leave side view / cockpit first
      if (cameraMode !== 'globe') {
        cameraMode = 'globe';

        if (onCameraChange) {
          onCameraChange('globe');
        }
      }

      cancelAnimationFrame(camMoveId);
      handBackControls();

      globe.controls().autoRotate = false;
      globe.pointOfView({ lat: spot.lat, lng: spot.lon, altitude: spot.city ? 0.25 : 0.15 }, 1500);
    },


    // -------------------------------------------------------------------------
    // Switch camera mode: 'globe' (normal), 'side' (see the arc side-on)
    // or 'cockpit' (look out of the rocket's window)
    // -------------------------------------------------------------------------
    setCameraMode(mode) {

      cameraMode = mode;
      globe.controls().autoRotate = false;

      if (current.trajectory.length) {
        flyTo(current.trajectory);
      }
    },


    /** Which camera mode is active: 'globe' or 'side' */
    getCameraMode() {
      return cameraMode;
    },


    // -------------------------------------------------------------------------
    // Fly back out to see the whole flight path again
    // -------------------------------------------------------------------------
    flyToLaunch() {
      if (current.trajectory.length) {
        flyTo(current.trajectory);
      }
    },


    // -------------------------------------------------------------------------
    // Remove all viewing-zone shapes
    // -------------------------------------------------------------------------
    clearZones() {
      globe.polygonsData([]);
    },


    // -------------------------------------------------------------------------
    // The raw globe.gl object, in case you need a setting not wrapped above
    // -------------------------------------------------------------------------
    raw: globe,
  };
}