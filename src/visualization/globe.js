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
//   showLaunch(launch, trajectory, weather)  -> show ONE launch: path, full orbit,
//                                               and animate the ascent + one lap
//   showMultiview(flights)                   -> show SEVERAL launches at once,
//                                               all flying at the same time
//   setFocus(index)                          -> in multiview, which rocket the
//                                               Side / Cockpit cameras follow
//   setWeather(rating)                       -> recolour the flight path
//   replay()                                 -> restart the rocket animation
//   showViewingAreas(areas) / clearZones()   -> the three viewing zones (bonus)
//   showSpots(spots) / flyToSpot(spot)       -> viewing spot pins (bonus)
//   setCameraMode('globe' | 'side' | 'cockpit')
//                                            -> normal globe view, a view from the
//                                               ground that follows the rocket, or
//                                               the view out of the rocket's window
//
// Each rocket on screen is a "flight": its launch, its trajectory, its orbit,
// its 3D rocket model, and a soft glow that makes it easy to spot.
// A single launch is just a list with one flight in it.
//
// The scene also has the Sun (in its real position for the launch time, which
// lights the Earth with a day side and a night side) and the Moon.
// =============================================================================


import Globe from 'globe.gl';
import * as THREE from 'three';

import { orbitElements, keplerState, heightAtAngle } from '../launches/orbits.js';


// =============================================================================
// SETTINGS YOU CAN TWEAK
// =============================================================================

// Earth's radius in kilometres
const EARTH_R_KM = 6371;

// Multiplies low altitudes so a 200 km climb is actually visible.
// 1 = true scale (very flat), higher = more dramatic.
const ALT_SCALE = 3;

// Above this height, the exaggeration stops: extra height is drawn at true
// scale, so high orbits (like GTO's 35,786 km) aren't drawn 3× too far out
const ALT_SCALE_UNTIL_KM = 1000;

// How long the ascent takes on screen (14 seconds)
const PLAYBACK_MS = 14000;

// After reaching orbit, how long one full lap around the Earth takes on screen
const ORBIT_LAP_MS = 24000;

// Pause at the end (back over the insertion point) before the animation loops
const PAUSE_MS = 1500;

// How big the rocket model is drawn: globe units per real metre.
// The Earth is 100 units in radius, so true scale would be invisible.
// 0.06 makes a 70 m Falcon 9 about 4 units tall. Scroll to zoom in for detail.
const ROCKET_SIZE = 0.06;

// The soft glow around each flying rocket: its size on screen (fraction of
// the screen height, roughly), and how much it gently pulses
const GLOW_SIZE = 0.05;
const GLOW_PULSE = 0.15;

// After stage separation, how many seconds (of flight time) the falling
// stage takes to fade out completely
const STAGE_FADE_S = 90;

// How long camera glides between views take
const CAMERA_MOVE_MS = 1800;

// Side view: the camera stays at this height above the ground (globe units),
// this far to the side of the rocket, and follows it along
const SIDE_HEIGHT = 3;
const SIDE_DISTANCE = 24;

// The Moon: how far away and how big. (The real Moon is 60 Earth radii away
// and would look tiny, so it's closer and bigger here.)
const MOON_DISTANCE = 3000;
const MOON_RADIUS = 190;

// The Sun: how far away its glow is drawn, and how big the glow is
const SUN_DISTANCE = 9000;
const SUN_GLOW_SIZE = 2600;

// Lighting: a dim light everywhere (so the night side isn't pitch black),
// plus bright sunlight from the Sun's direction
const AMBIENT_LIGHT = 1.1;
const SUN_LIGHT = 2.6;

// Colour of the flight path for each weather rating (single launch view)
const RATING_COLORS = {
  green: '#3ddc84',
  yellow: '#ffcc33',
  red: '#ff4d4d',

  // used before any weather data arrives
  none: '#9fd3ff',
};

// Colours for each launch in multiview (main.js uses the same list for its
// key). There are 12, so multiview can show up to 12 launches without any
// two sharing a colour.
export const MULTI_COLORS = [
  '#ffb547', '#7fd1ff', '#ff7ab6', '#9dff8a', '#c49bff', '#ffe36e',
  '#ff8a5c', '#5ef0d4', '#f59bff', '#c6e36b', '#8fa8ff', '#ffc7a1',
];

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
// the same coordinates. Real launch data may not include ids.
const samePad = (a, b) =>
  a && b && (a.id ? a.id === b.id : a.lat === b.lat && a.lon === b.lon);

// globe.gl measures altitude in "Earth radii" (1 = one Earth radius above the
// surface), not kilometres. This converts km to that unit, exaggerating low
// heights by ALT_SCALE and drawing anything above ALT_SCALE_UNTIL_KM at true
// scale (so a 550 km orbit is clearly above a 420 km one, and GTO's top is
// the right distance out).
const altFromKm = (km) => {

  const drawnKm = km <= ALT_SCALE_UNTIL_KM
    ? km * ALT_SCALE
    : ALT_SCALE_UNTIL_KM * ALT_SCALE + (km - ALT_SCALE_UNTIL_KM);

  return drawnKm / EARTH_R_KM;
};

// lat/lon (degrees) <-> a direction from the Earth's centre [x, y, z]
// (plain maths coordinates, used for the orbit calculations)
const toXYZ = (lat, lon) => [
  Math.cos(toRad(lat)) * Math.cos(toRad(lon)),
  Math.cos(toRad(lat)) * Math.sin(toRad(lon)),
  Math.sin(toRad(lat)),
];

const toLatLon = ([x, y, z]) => ({
  lat: toDeg(Math.asin(Math.max(-1, Math.min(1, z)))),
  lon: toDeg(Math.atan2(y, x)),
});

// A colour like '#ffb547' with some transparency, e.g. for faint orbit rings
function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}


// =============================================================================
// createGlobe(container, options)
// -----------------------------------------------------------------------------
//   container:
//     the HTML element to draw the globe inside (the #globe div)
//
//   options.onTick(simT, tMax):
//     optional function called every animation frame with the first rocket's
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
  // Each visual feature is a "layer" (labels, rings, paths, polygons, points).
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


    // --- Launch site labels + dots (clickable) ---

    .labelsData([])
    .labelLat((d) => d.lat)
    .labelLng((d) => d.lon)
    .labelText((d) => d.text)

    // the selected site is bigger, the others smaller
    .labelSize((d) => (d.selected ? 0.6 : 0.45))
    .labelDotRadius((d) => (d.selected ? 0.4 : 0.3))
    .labelColor((d) => d.color)

    .labelResolution(2)

    // clicking a site tells main.js, which then switches to that site
    .onLabelClick((d) => {
      if (onPadClick) {
        onPadClick(d.pad);
      }
    })


    // --- Pulsing rings at the launch pad(s) (like a radar ping) ---

    .ringsData([])
    .ringLat((d) => d.lat)
    .ringLng((d) => d.lon)

    // ringColor returns a function of t (0 = ring just started, 1 = fully
    // expanded), so the ring fades out as it grows.
    .ringColor((d) => (t) => withAlpha(d.color, 1 - t))

    // how far each ring expands (in degrees), how fast, and how often
    .ringMaxRadius(3)
    .ringPropagationSpeed(1.5)
    .ringRepeatPeriod(1200)


    // --- Flight paths and orbit rings (dashed lines) ---

    .pathsData([])

    // each path object has a "points" array
    .pathPoints('points')

    .pathPointLat((p) => p.lat)
    .pathPointLng((p) => p.lon)

    // lift each point off the surface
    .pathPointAlt((p) => altFromKm(p.altKm))

    // Each path sets its own look: colour, line thickness, dash length and
    // gap (as fractions of the whole path), and how fast the dashes flow
    .pathColor((d) => d.color)
    .pathStroke((d) => d.stroke)
    .pathDashLength((d) => d.dash)
    .pathDashGap((d) => d.gap)
    .pathDashAnimateTime((d) => d.flow)

    // redraw instantly when recoloured
    .pathTransitionDuration(0)


    // --- Viewing zones (bonus): see-through shapes on the ground ---
    // Each shape carries its own fill colour, outline colour and height
    // in its "properties" (set in showViewingAreas below).

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


  // The rockets aren't a globe.gl layer: we add them to the 3D scene ourselves
  // (see "Rockets" below), so we can rotate them and split them into stages.

  const scene = globe.scene();


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


  // ===========================================================================
  // STATE: what's currently on screen
  // ===========================================================================

  // Every launch site to show as a label (set with setPads)
  let pads = [];

  // The rockets currently flying. Each flight is:
  //   {
  //     launch, trajectory, tMax (flight time to orbit, seconds),
  //     orbit (see computeOrbit), color,
  //     rig (the 3D rocket, see buildRig), glow (the soft highlight),
  //     pos, dir (where it is and which way it's heading, updated every frame)
  //   }
  // flights[focus] is the "main" one: the timeline and the Side / Cockpit
  // cameras follow it. (Always 0 for a single launch; in multiview it's
  // changed with setFocus.)
  let flights = [];
  let focus = 0;

  // The flight the cameras follow
  const mainFlight = () => flights[focus] || flights[0];

  // 'single' (one launch) or 'multi' (several at once)
  let viewMode = 'single';

  // Single launch view: the weather rating (colours the path) and the
  // rocket model chosen with setRocket()
  let rating = 'none';
  let singleRocket = null;

  // ID of the running animation loop, so we can stop it later
  let rafId = null;


  // ===========================================================================
  // LAUNCH SITE LABELS AND RINGS
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // drawPads()
  //   Single view: a label for every launch site, with the selected one
  //                highlighted in orange.
  //   Multiview:   a label at each flying launch's pad, showing the mission
  //                name in that launch's colour.
  // Pulsing rings mark the pad(s) of whatever is flying.
  // ---------------------------------------------------------------------------

  function drawPads() {

    if (viewMode === 'multi') {

      globe.labelsData(flights.map((f, i) => ({
        lat: f.launch.pad.lat,
        lon: f.launch.pad.lon,
        text: f.launch.name,
        color: f.color,

        // the followed launch's label is bigger
        selected: i === focus,
        pad: f.launch.pad,
      })));

      globe.ringsData(flights.map((f) => ({ ...f.launch.pad, color: f.color })));
      return;
    }

    const selectedPad = flights[0]?.launch.pad;

    // Make sure the current launch's pad is shown even if it isn't in the list
    // (for example, a real launch at a site we didn't list)
    const allPads = [...pads];

    if (selectedPad && !allPads.some((p) => samePad(p, selectedPad))) {
      allPads.push(selectedPad);
    }

    globe.labelsData(allPads.map((p) => {

      const selected = samePad(p, selectedPad);

      return {
        lat: p.lat,
        lon: p.lon,
        text: shortName(p.name),
        selected: selected,
        color: selected ? '#ffb547' : 'rgba(230, 236, 255, 0.8)',
        pad: p, // the original pad, passed back on click
      };
    }));

    globe.ringsData(selectedPad ? [{ ...selectedPad, color: '#ffb547' }] : []);
  }


  // ===========================================================================
  // FLIGHT PATHS AND ORBIT RINGS
  // ===========================================================================

  function drawPaths() {

    const paths = [];

    for (const f of flights) {

      // Single view: coloured by the weather. Multiview: each launch's own colour.
      const color = viewMode === 'single'
        ? RATING_COLORS[rating] || RATING_COLORS.none
        : f.color;

      // The ascent: thick, dashes flowing upwards
      paths.push({
        points: f.trajectory,
        color: color,
        stroke: viewMode === 'single' ? 3 : 2,
        dash: 0.06,
        gap: 0.015,
        flow: 4000,
      });

      // The full orbit around the Earth: thin, faint, finely dashed
      paths.push({
        points: f.orbit.ring,
        color: viewMode === 'single' ? 'rgba(170, 205, 255, 0.55)' : withAlpha(f.color, 0.4),
        stroke: 1.2,
        dash: 0.006,
        gap: 0.006,
        flow: 60000,
      });
    }

    globe.pathsData(paths);
  }


  // ===========================================================================
  // THE ORBIT
  // ---------------------------------------------------------------------------
  // Once a rocket reaches the end of its trajectory, it's in orbit. An orbit
  // (ignoring the Earth spinning underneath) is a circle around the Earth's
  // centre, in the plane of the rocket's position and its direction of travel
  // at that moment.
  //
  // We describe that circle with two directions from the Earth's centre:
  //   P: towards the orbit insertion point (end of the trajectory)
  //   D: the direction the rocket is travelling there (at right angles to P)
  // A point on the orbit, an angle θ further round, is:
  //   P × cos θ  +  D × sin θ
  // ===========================================================================

  // shape: { perigeeKm, apogeeKm } (see orbits.js). Without one, the orbit
  // is a circle at the height where the trajectory ends.
  function computeOrbit(trajectory, shape) {

    const last = trajectory[trajectory.length - 1];

    // The orbit's lowest point (perigee) is where the trajectory ends
    const orbitShape = shape
      ? { perigeeKm: last.altKm, apogeeKm: Math.max(shape.apogeeKm, last.altKm) }
      : { perigeeKm: last.altKm, apogeeKm: last.altKm };
    const prev = trajectory[trajectory.length - 2];

    const P = toXYZ(last.lat, last.lon);
    const Q = toXYZ(prev.lat, prev.lon);

    // Direction of travel: from the second-last point to the last point,
    // with any part pointing up or down removed (so it's at right angles to P)
    let D = [P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]];
    const along = D[0] * P[0] + D[1] * P[1] + D[2] * P[2];
    D = [D[0] - along * P[0], D[1] - along * P[1], D[2] - along * P[2]];
    const len = Math.hypot(D[0], D[1], D[2]) || 1;
    D = D.map((v) => v / len);

    // How long one lap takes, from the orbit's size (Kepler's third law,
    // see orbits.js). A circle has the same height all the way round; an
    // ellipse (like GTO) climbs to its highest point on the far side.
    const orbit = {
      P: P,
      D: D,
      altKm: last.altKm,
      shape: orbitShape,
      periodS: orbitElements(orbitShape).periodS,
      ring: [],
    };

    // Points every 2° all the way round, for drawing the ring, each at its
    // own height
    for (let deg = 0; deg <= 360; deg += 2) {
      const angle = toRad(deg);
      orbit.ring.push({ ...orbitPoint(orbit, angle), altKm: heightAtAngle(orbitShape, angle) });
    }

    return orbit;
  }


  // The lat/lon an angle θ (radians) further round an orbit
  function orbitPoint(orbit, theta) {

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    return toLatLon([
      orbit.P[0] * c + orbit.D[0] * s,
      orbit.P[1] * c + orbit.D[1] * s,
      orbit.P[2] * c + orbit.D[2] * s,
    ]);
  }


  // ---------------------------------------------------------------------------
  // positionAt(trajectory, simT)
  // Where the rocket is at flight time simT (seconds after liftoff), during
  // the ascent. The trajectory is a list of points, so we find the two points
  // either side of simT and blend between them ("linear interpolation").
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

    return {
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      alt: altFromKm(a.altKm + (b.altKm - a.altKm) * f),
    };
  }


  // ---------------------------------------------------------------------------
  // flightPosition(flight, simT)
  // Where a rocket is at ANY flight time: on its trajectory during the
  // ascent, then on its orbit after that.
  // ---------------------------------------------------------------------------

  function flightPosition(flight, simT) {

    if (simT <= flight.tMax) {
      return positionAt(flight.trajectory, simT);
    }

    // In orbit: where it is, from Kepler's law (orbits.js). On a stretched
    // orbit like GTO it races low past perigee and crawls round the top.
    const state = keplerState(flight.orbit.shape, simT - flight.tMax);

    return { ...orbitPoint(flight.orbit, state.angle), alt: altFromKm(state.altKm) };
  }


  // ===========================================================================
  // ROCKETS
  // ---------------------------------------------------------------------------
  // A "rig" is one 3D rocket model:
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


  // Build a rig from one entry of ROCKETS in rockets.js, and add it to the scene
  function buildRig(rocket) {

    const model = rocket.build();

    // Attach each flame to its own stage, so it moves with that stage
    model.lower.add(model.lowerFlame);
    model.upper.add(model.upperFlame);

    const root = new THREE.Group();
    root.add(model.lower, model.upper);

    // Make it visible from space (see ROCKET_SIZE)
    root.scale.setScalar(ROCKET_SIZE);

    scene.add(root);

    const rig = {
      rocket: rocket,
      height: model.height,   // metres, used for the glow and Cockpit view
      root: root,
      lower: model.lower,
      upper: model.upper,
      lowerFlame: model.lowerFlame,
      upperFlame: model.upperFlame,
      sep: null,
    };

    resetStages(rig);

    return rig;
  }


  // Remove a rig from the scene and free its memory
  function removeRig(rig) {

    scene.remove(rig.root);
    scene.remove(rig.lower); // in case it had already separated

    const dispose = (obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    };

    rig.root.traverse(dispose);
    rig.lower.traverse(dispose);
  }


  // Put the lower stage back on the rocket (used when the animation loops)
  function resetStages(rig) {

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


  // ---------------------------------------------------------------------------
  // separateStages(rig, dir)
  // The moment of stage separation. The lower stage is moved from the rocket
  // into the scene, keeping exactly where it is right now, so it can fall
  // away on its own while the upper stage keeps flying.
  //   dir: the direction the rocket is travelling at this moment
  // ---------------------------------------------------------------------------

  function separateStages(rig, dir) {

    // attach() moves an object to a new parent without it jumping position
    scene.attach(rig.lower);

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


  // ===========================================================================
  // THE GLOW
  // ---------------------------------------------------------------------------
  // A soft, gently pulsing halo around each flying rocket, so it's easy to
  // spot from far away. It's a "sprite": a flat picture that always faces the
  // camera. sizeAttenuation: false keeps it the same size on screen however
  // far away the rocket is.
  // ===========================================================================

  const glowTexture = makeGlowTexture();

  function makeGlow(color) {

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.85,

      // Additive blending makes it glow like light, brightening what's behind
      blending: THREE.AdditiveBlending,
      depthWrite: false,

      sizeAttenuation: false,
    }));

    sprite.scale.setScalar(GLOW_SIZE);
    scene.add(sprite);

    return sprite;
  }


  // ===========================================================================
  // ADDING AND REMOVING FLIGHTS
  // ===========================================================================

  // Remove every flight from the screen
  function clearFlights() {

    for (const f of flights) {
      removeRig(f.rig);
      scene.remove(f.glow);
      f.glow.material.dispose();
    }

    flights = [];
  }


  // Build a flight: work out its orbit, and add its rocket and glow
  function makeFlight(launch, trajectory, rocket, color) {
    return {
      launch: launch,
      trajectory: trajectory,
      tMax: trajectory[trajectory.length - 1].t,
      orbit: computeOrbit(trajectory, launch.orbitShape),
      color: color,
      rig: buildRig(rocket),
      glow: makeGlow(color),
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 1, 0),
    };
  }


  // ===========================================================================
  // THE ANIMATION LOOP
  // ---------------------------------------------------------------------------
  // requestAnimationFrame calls `frame` about 60 times a second. Each time,
  // every rocket is moved to where it should be right now.
  //
  // One loop of the animation is:
  //   1. the ascent           (PLAYBACK_MS)
  //   2. one lap of the orbit (ORBIT_LAP_MS): a real ~90 minute lap, sped up
  //   3. a short pause        (PAUSE_MS)
  // All rockets go through these at the same time, each with its own timings.
  // ===========================================================================

  function playAscent() {

    // Stop any animation that's already running
    cancelAnimationFrame(rafId);

    if (flights.length === 0) {
      return;
    }

    // When the animation started, in milliseconds
    const start = performance.now();

    const frame = (now) => {

      // Nothing left to animate (e.g. the secret Artemis II replay took over
      // the globe): stop this loop
      if (flights.length === 0) {
        return;
      }

      // `%` (remainder) makes the animation loop
      const elapsed = (now - start) % (PLAYBACK_MS + ORBIT_LAP_MS + PAUSE_MS);

      for (const f of flights) {
        updateFlight(f, flightTime(f, elapsed), now);
      }

      // The cameras that ride along follow the main flight
      const main = mainFlight();
      const mainT = flightTime(main, elapsed);

      if (cameraMode === 'cockpit') {
        placeCockpitCamera(main, mainT);
      } else if (cameraMode === 'side') {
        followSide(main);
      }

      // Tell the page (the timeline) where the main flight is
      if (onTick) {
        onTick(mainT, main.tMax);
      }

      // Schedule the next frame
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
  }


  // Turn real time since the loop started into a flight's own flight time
  // (seconds after liftoff)
  function flightTime(flight, elapsed) {

    // 1. The ascent
    if (elapsed < PLAYBACK_MS) {
      return (elapsed / PLAYBACK_MS) * flight.tMax;
    }

    // 2. Going round the orbit
    if (elapsed < PLAYBACK_MS + ORBIT_LAP_MS) {
      const lap = (elapsed - PLAYBACK_MS) / ORBIT_LAP_MS;
      return flight.tMax + lap * flight.orbit.periodS;
    }

    // 3. The pause, after one full lap
    return flight.tMax + flight.orbit.periodS;
  }


  // ---------------------------------------------------------------------------
  // animateFallingStage(rig, tSince)
  // After separation, the lower stage drifts on briefly, falls, tumbles and
  // fades out. tSince = seconds (of flight time) since separation.
  // ---------------------------------------------------------------------------

  function animateFallingStage(rig, tSince) {

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


  // ---------------------------------------------------------------------------
  // updateFlight(flight, simT, now)
  // Moves one rocket to where it should be at flight time simT, points it the
  // way it's going, handles stage separation, flickers the flames, and moves
  // its glow.
  // ---------------------------------------------------------------------------

  // Reusable vectors (creating new ones 60 times a second wastes memory)
  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();
  const tumble = new THREE.Quaternion();
  const X_AXIS = new THREE.Vector3(1, 0, 0);

  function updateFlight(flight, simT, now) {

    const rig = flight.rig;


    // --- Where is it now, and which way is it heading? ---

    // Look 3 seconds ahead to find the direction of travel.
    // (Near the end of the ascent, look 3 seconds behind instead, so the
    // direction doesn't jump at the moment the orbit takes over.)
    const tA = simT < flight.tMax - 3 ? simT : simT - 3;
    const tB = tA + 3;

    const here = flightPosition(flight, simT);
    const a = flightPosition(flight, tA);
    const b = flightPosition(flight, tB);

    // getCoords turns latitude/longitude/altitude into a 3D position (x, y, z)
    flight.pos.copy(globe.getCoords(here.lat, here.lon, here.alt));

    posA.copy(globe.getCoords(a.lat, a.lon, a.alt));
    posB.copy(globe.getCoords(b.lat, b.lon, b.alt));
    flight.dir.copy(posB).sub(posA).normalize();


    // --- Move the rocket and point its nose along the direction of travel ---

    rig.root.position.copy(flight.pos);
    rig.root.quaternion.setFromUnitVectors(UP, flight.dir);


    // --- Stage separation ---

    const sepT = rig.rocket.separationT;

    // The animation looped back to before separation: put the stage back
    if (rig.sep && simT < sepT) {
      resetStages(rig);
    }

    // Separation moment
    if (!rig.sep && simT >= sepT) {
      separateStages(rig, flight.dir);
    }

    // After separation: the lower stage falls away (see animateFallingStage)
    if (rig.sep) {
      animateFallingStage(rig, simT - sepT);
    }


    // --- Engine shutdown at orbit ---

    if (simT >= flight.tMax) {
      rig.upperFlame.visible = false;
    }


    // --- Flicker the flames ---
    // Stretch them slightly up and down using a fast wave plus a little randomness

    const flicker = 1 + 0.12 * Math.sin(now / 35) + 0.08 * Math.random();

    rig.lowerFlame.scale.set(1, flicker, 1);
    rig.upperFlame.scale.set(1, flicker, 1);


    // --- The glow: centred on the part of the rocket still flying ---

    // Before separation: the middle of the whole rocket.
    // After: the middle of the upper stage (higher up).
    const centre = rig.sep ? 0.75 : 0.5;

    flight.glow.position.copy(flight.pos)
      .addScaledVector(flight.dir, rig.height * centre * ROCKET_SIZE);

    // Gentle pulse (each flight slightly out of step, so they don't blink together)
    const pulse = 1 + GLOW_PULSE * Math.sin(now / 400 + flights.indexOf(flight));
    flight.glow.scale.setScalar(GLOW_SIZE * pulse);

    // No glow for the main rocket in Cockpit view (we're inside it)
    flight.glow.visible = !(cameraMode === 'cockpit' && flight === mainFlight());
  }


  // ===========================================================================
  // THE SUN
  // ---------------------------------------------------------------------------
  // The Sun is placed in its REAL direction for the launch time, so the Earth
  // has a realistic day side and night side. You can see at a glance whether
  // a launch happens in daylight, at night, or at twilight (the best time to
  // watch: the rocket's exhaust is lit by sunlight against a dark sky).
  //
  // Two parts:
  //   - sunLight: bright light shining from the Sun's direction
  //   - sunGlow:  a big soft glowing disc far away, so you can see the Sun
  // ===========================================================================

  const ambientLight = new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT);
  const sunLight = new THREE.DirectionalLight(0xfff4e0, SUN_LIGHT);

  // Replace globe.gl's default lights with ours
  globe.lights([ambientLight, sunLight]);

  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSunTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));

  sunGlow.scale.setScalar(SUN_GLOW_SIZE);
  scene.add(sunGlow);


  // ---------------------------------------------------------------------------
  // subsolarPoint(date)
  // The spot on Earth where the Sun is directly overhead at a given moment.
  //
  //   latitude:  swings between 23.44°N (June) and 23.44°S (December) over
  //              the year, because the Earth is tilted
  //   longitude: the Sun is overhead at 0° longitude at 12:00 UTC, and moves
  //              15° west every hour as the Earth turns
  //
  // (A simple approximation, accurate to within a degree or so.)
  // ---------------------------------------------------------------------------

  function subsolarPoint(date) {

    // Day of the year (1 = January 1st)
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayOfYear = (date.getTime() - startOfYear) / 86400000;

    const lat = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);

    const hoursUTC = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    let lon = -15 * (hoursUTC - 12);

    // Keep longitude between -180° and 180°
    lon = ((lon + 540) % 360) - 180;

    return { lat, lon };
  }


  // Move the Sun (and its light) to where it is at a given time
  function setSunTime(date) {

    const { lat, lon } = subsolarPoint(date);

    // Direction from the Earth's centre towards the Sun
    const dir = toVec(globe.getCoords(lat, lon, 0)).normalize();

    sunLight.position.copy(dir).multiplyScalar(1000);
    sunGlow.position.copy(dir).multiplyScalar(SUN_DISTANCE);
  }

  // Start with the Sun where it is right now
  setSunTime(new Date());


  // ===========================================================================
  // THE MOON
  // ---------------------------------------------------------------------------
  // A sphere far behind the Earth, with a surface painted in code (see
  // makeMoonTexture below), so there's no image to download. It's lit by the
  // Sun, so it shows a phase. It turns very slowly. For each launch it's
  // moved so it appears behind the Earth, up and to the left, in the starting
  // globe view.
  // ===========================================================================

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(MOON_RADIUS, 48, 48),
    new THREE.MeshStandardMaterial({
      map: makeMoonTexture(),
      roughness: 1,
      metalness: 0,

      // a faint glow of its own, so its dark side isn't completely black
      emissive: new THREE.Color('#2a2a2a'),
    })
  );

  scene.add(moon);

  // Slow spin, on its own animation loop (so it turns even between launches)
  (function spinMoon() {
    moon.rotation.y += 0.0004;
    requestAnimationFrame(spinMoon);
  })();


  // Put the Moon behind the Earth, up and to the left, as seen from a camera
  // position looking at the Earth's centre
  function placeMoon(camPos) {

    const forward = camPos.clone().negate().normalize();
    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    // Straight behind the Earth, nudged up and left
    const direction = forward.clone()
      .addScaledVector(up, 0.3)
      .addScaledVector(right, -0.42)
      .normalize();

    moon.position.copy(direction).multiplyScalar(MOON_DISTANCE);
  }


  // ===========================================================================
  // CAMERA
  // ---------------------------------------------------------------------------
  // Three camera modes:
  //
  //   'globe':   the normal view. globe.gl's controls let you spin and zoom
  //              the Earth, always looking at its centre.
  //
  //   'side':    a camera near the ground, off to the side of the rocket,
  //              that FOLLOWS it along its flight (and round its orbit),
  //              staying at the same height above the ground. You see the
  //              arc of the climb from the side, like a chase plane.
  //
  //   'cockpit': inside the rocket, looking out of a side window.
  //
  // globe.gl's controls always aim the camera at the Earth's centre, so in
  // side and cockpit modes we switch them off and aim the camera ourselves.
  // ===========================================================================

  const camera = globe.camera();
  const controls = globe.controls();

  // 'globe', 'side' or 'cockpit'
  let cameraMode = 'globe';

  // Where the camera is currently looking (needed to blend between views)
  const lookPoint = new THREE.Vector3(0, 0, 0);

  // ID of the running camera glide, so a new one can cancel it
  let camMoveId = null;

  // Straight up in world space (the normal "up" for the globe view)
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  // Turn {x, y, z} into a three.js vector
  function toVec(p) {
    return new THREE.Vector3(p.x, p.y, p.z);
  }


  // ---------------------------------------------------------------------------
  // globePose()
  // Where the camera sits for the normal globe view, looking at the Earth's
  // centre:
  //   single launch: above the middle of the flight path, tilted slightly
  //                  (lat - 5) so we look "up" the path
  //   multiview:     above the average position of all the launch pads,
  //                  zoomed out to fit them in
  // ---------------------------------------------------------------------------

  function globePose() {

    let lat;
    let lon;
    let altitude;

    if (viewMode === 'multi') {

      // Average the pads' directions from the Earth's centre
      const sum = [0, 0, 0];

      for (const f of flights) {
        const v = toXYZ(f.launch.pad.lat, f.launch.pad.lon);
        sum[0] += v[0];
        sum[1] += v[1];
        sum[2] += v[2];
      }

      // If the pads are spread all round the world the average is near the
      // centre; that's fine, any direction works then
      const centre = Math.hypot(...sum) > 0.01 ? toLatLon(sum) : { lat: 20, lon: 0 };

      lat = centre.lat;
      lon = centre.lon;
      altitude = 2.6;

    } else {

      const traj = flights[0].trajectory;
      const mid = traj[Math.floor(traj.length / 2)];

      lat = mid.lat - 5;
      lon = mid.lon;
      altitude = 0.9;
    }

    return {
      position: toVec(globe.getCoords(lat, lon, altitude)),
      look: new THREE.Vector3(0, 0, 0),
      up: WORLD_UP.clone(),
    };
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


  // Give the camera back to globe.gl's controls (spin and zoom the globe)
  function handBackControls() {
    camera.up.copy(WORLD_UP);
    lookPoint.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
  }


  // ---------------------------------------------------------------------------
  // flyTo()
  // Point the camera at what's flying, in whichever mode is active.
  // ---------------------------------------------------------------------------

  function flyTo() {

    if (flights.length === 0) {
      return;
    }

    // Side view and Cockpit: the animation loop moves the camera every
    // frame. Just stop any glide and switch globe.gl's controls off.
    if (cameraMode === 'side' || cameraMode === 'cockpit') {
      cancelAnimationFrame(camMoveId);
      controls.enabled = false;
      return;
    }

    // Globe view: glide there, then hand control back to globe.gl
    const pose = globePose();
    moveCamera(pose, handBackControls);
    placeMoon(pose.position);
  }


  // ---------------------------------------------------------------------------
  // groundDirection(flight)
  // The direction a rocket is heading along the ground, at its position.
  // Once it has tipped over, that's just its travel direction flattened.
  // Near liftoff it's pointing almost straight up, so flattening doesn't
  // work; then use the overall direction of its trajectory instead.
  // ---------------------------------------------------------------------------

  function groundDirection(flight) {

    const localUp = flight.pos.clone().normalize();
    const along = flight.dir.clone().addScaledVector(localUp, -flight.dir.dot(localUp));

    if (along.length() > 0.2) {
      return along.normalize();
    }

    const traj = flight.trajectory;
    const first = traj[0];
    const last = traj[traj.length - 1];

    along.copy(toVec(globe.getCoords(last.lat, last.lon, 0)))
      .sub(toVec(globe.getCoords(first.lat, first.lon, 0)));

    return along.addScaledVector(localUp, -along.dot(localUp)).normalize();
  }


  // ---------------------------------------------------------------------------
  // followSide(flight)
  // Side view, every frame: the camera flies alongside the rocket, staying
  // SIDE_HEIGHT above the ground and SIDE_DISTANCE off to one side, looking
  // at the rocket.
  //
  // It eases towards that spot each frame instead of jumping there, so it
  // glides smoothly into position when Side view is switched on, and when
  // the animation loops back to the launch pad.
  //
  // Drag left/right to swing round the rocket; scroll to move closer/further.
  // ---------------------------------------------------------------------------

  // Changed by dragging and scrolling (see below)
  let sideAngle = 0;
  let sideDistance = SIDE_DISTANCE;

  const sideTarget = new THREE.Vector3();
  const sideLook = new THREE.Vector3();
  const sideUp = new THREE.Vector3();

  function followSide(flight) {

    const R = globe.getGlobeRadius();
    const localUp = flight.pos.clone().normalize();

    // Off to the side of the flight direction, swung round by sideAngle
    const side = new THREE.Vector3()
      .crossVectors(groundDirection(flight), localUp)
      .applyAxisAngle(localUp, sideAngle)
      .normalize();

    // The camera spot: step sideways from the point under the rocket, then
    // put it exactly SIDE_HEIGHT above the ground there
    sideTarget.copy(localUp).multiplyScalar(R)
      .addScaledVector(side, sideDistance)
      .setLength(R + SIDE_HEIGHT);

    // Look at the middle of the rocket
    sideLook.copy(flight.pos).addScaledVector(flight.dir, flight.rig.height * 0.5 * ROCKET_SIZE);

    // Keep the horizon level: "up" is straight up at the camera's spot
    sideUp.copy(sideTarget).normalize();

    // Ease towards the target (or jump, if it's very far away, e.g. on the
    // other side of the planet, so the camera never passes through the Earth)
    if (camera.position.distanceTo(sideTarget) > 150) {
      camera.position.copy(sideTarget);
      lookPoint.copy(sideLook);
    } else {
      camera.position.lerp(sideTarget, 0.1);
      lookPoint.lerp(sideLook, 0.25);
    }

    // Easing between two points cuts the corner of the Earth's curve, which
    // would drop the camera slightly. Put it back at exactly the right height.
    camera.position.setLength(R + SIDE_HEIGHT);

    camera.up.lerp(sideUp, 0.1).normalize();
    camera.lookAt(lookPoint);
  }


  // Side view: drag to swing round the rocket, scroll to zoom
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

    sideAngle -= (e.clientX - dragX) * 0.005;
    dragX = e.clientX;
  });

  container.addEventListener('wheel', (e) => {

    if (cameraMode !== 'side') {
      return;
    }

    e.preventDefault();

    // Scroll down = move away, up = move closer, within sensible limits
    const factor = e.deltaY > 0 ? 1.08 : 0.92;
    sideDistance = Math.min(Math.max(sideDistance * factor, 6), 80);
  }, { passive: false });


  // ---------------------------------------------------------------------------
  // placeCockpitCamera(flight, simT)
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

  function placeCockpitCamera(flight, simT) {

    const rig = flight.rig;
    const localUp = flight.pos.clone().normalize();

    // Out of the window: sideways, at right angles to the flight direction
    const side = new THREE.Vector3().crossVectors(groundDirection(flight), localUp).normalize();

    // Look out sideways, tilted 15° down towards the Earth
    const tilt = 15 * (Math.PI / 180);
    camForward.copy(side).multiplyScalar(Math.cos(tilt))
      .addScaledVector(localUp, -Math.sin(tilt))
      .normalize();

    // The window sits near the top of the rocket (the capsule) on its side
    const capsuleHeight = rig.height * 0.82 * ROCKET_SIZE;

    camera.position.copy(flight.pos)
      .addScaledVector(flight.dir, capsuleHeight)
      .addScaledVector(side, 0.6);

    // Shake: strong at liftoff (fading over 35 s), plus a jolt at separation
    const sepT = rig.rocket.separationT;
    const strength =
      0.05 * Math.max(0, 1 - simT / 35) +
      0.08 * Math.exp(-Math.abs(simT - sepT) / 4);

    shake.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(strength);

    camera.position.add(shake);

    // Camera "up" = the rocket's nose direction, straightened so it's at
    // right angles to where the camera looks
    camUp.copy(flight.dir).addScaledVector(camForward, -flight.dir.dot(camForward)).normalize();
    camera.up.copy(camUp);

    // Look out of the window
    lookPoint.copy(camera.position).addScaledVector(camForward, 10);
    camera.lookAt(lookPoint);
  }


  // ===========================================================================
  // PUBLIC FUNCTIONS
  // The only things the rest of the app can call.
  // ===========================================================================

  return {

    // -------------------------------------------------------------------------
    // Show ONE launch: its rocket (set with setRocket first), flight path,
    // full orbit, the Sun at launch time, and start the animation.
    // -------------------------------------------------------------------------
    showLaunch(launch, trajectory, weather) {

      viewMode = 'single';
      focus = 0;
      rating = weather?.rating || 'none';

      clearFlights();
      flights = [makeFlight(launch, trajectory, singleRocket, '#ffb547')];

      // Stop spinning so the user can look at the launch
      controls.autoRotate = false;

      // The Sun where it will be at launch time: day, night or twilight?
      setSunTime(new Date(launch.windowStart));

      drawPads();
      drawPaths();
      flyTo();
      playAscent();
    },


    // -------------------------------------------------------------------------
    // Show SEVERAL launches at once, all flying at the same time.
    //   list: [{ launch, trajectory, rocket }, ...]
    // Each gets its own colour from MULTI_COLORS (in the same order).
    // The Side and Cockpit cameras follow list[focusIndex] (the first one
    // unless told otherwise; see setFocus).
    // -------------------------------------------------------------------------
    showMultiview(list, focusIndex = 0) {

      viewMode = 'multi';
      focus = focusIndex;

      clearFlights();
      flights = list.map((item, i) =>
        makeFlight(item.launch, item.trajectory, item.rocket, MULTI_COLORS[i % MULTI_COLORS.length])
      );

      controls.autoRotate = false;

      // The Sun as it is right now (the launches are at different times)
      setSunTime(new Date());

      drawPads();
      drawPaths();
      flyTo();
      playAscent();
    },


    // -------------------------------------------------------------------------
    // Multiview: choose which rocket the Side / Cockpit cameras follow
    // (index into the list given to showMultiview). The camera glides over
    // to it; its label on the globe gets bigger.
    // -------------------------------------------------------------------------
    setFocus(index) {

      if (!flights[index]) {
        return;
      }

      focus = index;
      drawPads();
    },


    // -------------------------------------------------------------------------
    // Choose which rocket model flies in the single launch view.
    // rocket: one entry from ROCKETS in rockets.js. Takes effect at the next
    // showLaunch() (main.js always calls them together).
    // -------------------------------------------------------------------------
    setRocket(rocket) {
      singleRocket = rocket;
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
    setWeather(newRating) {
      rating = newRating;
      drawPaths();
    },


    // -------------------------------------------------------------------------
    // Restart the rocket animation from liftoff
    // -------------------------------------------------------------------------
    replay() {
      playAscent();
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
    // Remove the viewing zones
    // -------------------------------------------------------------------------
    clearZones() {
      globe.polygonsData([]);
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

      controls.autoRotate = false;
      globe.pointOfView({ lat: spot.lat, lng: spot.lon, altitude: spot.city ? 0.25 : 0.15 }, 1500);
    },


    // -------------------------------------------------------------------------
    // Fly back out to see the whole flight again
    // -------------------------------------------------------------------------
    flyToLaunch() {
      flyTo();
    },


    // -------------------------------------------------------------------------
    // Switch camera mode: 'globe' (normal), 'side' (follow the rocket from
    // the side) or 'cockpit' (look out of the rocket's window)
    // -------------------------------------------------------------------------
    setCameraMode(mode) {

      cameraMode = mode;
      controls.autoRotate = false;

      // Start each Side view from the default angle and distance
      sideAngle = 0;
      sideDistance = SIDE_DISTANCE;

      flyTo();
    },


    /** Which camera mode is active: 'globe', 'side' or 'cockpit' */
    getCameraMode() {
      return cameraMode;
    },


    // -------------------------------------------------------------------------
    // Behind-the-scenes tools for the secret Artemis II mission (artemis.js).
    // It runs its own animation, so it needs direct access to the 3D scene,
    // the camera, the rocket models, the Moon and the Sun.
    // -------------------------------------------------------------------------
    internals() {
      return {
        scene,
        camera,
        controls,
        moon,
        MOON_RADIUS,
        ROCKET_SIZE,

        // 3D position (a THREE.Vector3) for latitude, longitude, altitude
        getCoords: (lat, lon, alt = 0) => toVec(globe.getCoords(lat, lon, alt)),
        altFromKm,

        computeOrbit,
        orbitPoint,

        buildRig,
        removeRig,
        resetStages,
        separateStages,
        animateFallingStage,
        makeGlow,
        setSunTime,

        // Clear the normal view off the globe and stop its animation
        suspend() {
          cancelAnimationFrame(rafId);
          cancelAnimationFrame(camMoveId);
          clearFlights();
          globe.labelsData([]).ringsData([]).pathsData([]).polygonsData([]).pointsData([]);
          cameraMode = 'globe';
          controls.autoRotate = false;
          controls.enabled = false;
        },

        // Hand the globe back for the normal view (main.js then redraws it)
        resume() {
          moon.scale.setScalar(1);
          drawPads();
          handBackControls();
        },
      };
    },


    // -------------------------------------------------------------------------
    // The raw globe.gl object, in case you need a setting not wrapped above
    // -------------------------------------------------------------------------
    raw: globe,
  };
}


// =============================================================================
// TEXTURES PAINTED IN CODE
// -----------------------------------------------------------------------------
// Small pictures drawn on a canvas (an image made in code), so there are no
// image files to download.
// =============================================================================


// The rocket glow: a soft round blob, bright in the middle, fading out
function makeGlowTexture() {

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  g.addColorStop(0.15, 'rgba(255, 255, 255, 0.5)');
  g.addColorStop(0.45, 'rgba(255, 255, 255, 0.12)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}


// The Sun: a white-hot centre, a warm yellow glow, fading into space
function makeSunTexture() {

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.06, 'rgba(255, 252, 235, 1)');
  g.addColorStop(0.1, 'rgba(255, 236, 180, 0.8)');
  g.addColorStop(0.25, 'rgba(255, 200, 110, 0.25)');
  g.addColorStop(0.55, 'rgba(255, 170, 80, 0.06)');
  g.addColorStop(1, 'rgba(255, 160, 60, 0)');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}


// =============================================================================
// makeMoonTexture()
// -----------------------------------------------------------------------------
// Paints a Moon surface onto a canvas (an image made in code), then turns it
// into a texture for the Moon sphere:
//
//   1. grey base with fine speckle (dust and rock)
//   2. large dark patches (the "seas", old lava plains)
//   3. lots of craters: a darker bowl with a light rim on one side
//
// The random numbers come from a fixed "seed", so the Moon looks the same
// every time the page loads.
// =============================================================================

function makeMoonTexture() {

  const W = 1024;
  const H = 512;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Repeatable random numbers (same Moon every time)
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };


  // 1. Grey base with speckle
  ctx.fillStyle = '#9b9b96';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 12000; i++) {
    const shade = 120 + Math.floor(random() * 70);
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade - 4}, 0.35)`;
    ctx.fillRect(random() * W, random() * H, 2, 2);
  }


  // 2. Dark "seas": soft-edged blotches
  for (let i = 0; i < 9; i++) {

    const x = random() * W;
    const y = H * 0.2 + random() * H * 0.6;
    const r = 40 + random() * 90;

    const sea = ctx.createRadialGradient(x, y, 0, x, y, r);
    sea.addColorStop(0, 'rgba(70, 70, 68, 0.75)');
    sea.addColorStop(0.7, 'rgba(80, 80, 78, 0.45)');
    sea.addColorStop(1, 'rgba(90, 90, 88, 0)');

    ctx.fillStyle = sea;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }


  // 3. Craters: many small ones, a few big ones
  for (let i = 0; i < 260; i++) {

    const x = random() * W;
    const y = random() * H;
    const r = random() < 0.92 ? 2 + random() * 7 : 10 + random() * 22;

    // darker bowl
    ctx.fillStyle = 'rgba(60, 60, 58, 0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // light rim on the lower-right edge, as if lit from the upper left
    ctx.strokeStyle = 'rgba(220, 220, 214, 0.5)';
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, r, -0.2, Math.PI * 0.9);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}