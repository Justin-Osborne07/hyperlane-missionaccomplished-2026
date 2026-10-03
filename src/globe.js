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
//   showLaunch(launch, trajectory, weather)  -> draw a launch and animate it
//   setWeather(rating)                       -> recolour the flight path
//   replay()                                 -> restart the rocket animation
//   showZones(zones) / clearZones()          -> viewing-zone circles (bonus)
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

// How long the full ascent takes on screen (10 seconds)
const PLAYBACK_MS = 10000;

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
// =============================================================================

export function createGlobe(container, { onTick, onPadClick } = {}) {

  // ---------------------------------------------------------------------------
  // The rocket
  // ---------------------------------------------------------------------------
  // Just a small glowing sphere. MeshBasicMaterial ignores lighting, so it
  // always looks bright no matter which side of the Earth it's on.

  const rocketGeometry = new THREE.SphereGeometry(
    1.1,  // radius
    16,   // smoothness around
    16    // smoothness top-to-bottom
  );

  const rocketMaterial = new THREE.MeshBasicMaterial({ color: '#fff1d6' });

  const rocketMesh = new THREE.Mesh(rocketGeometry, rocketMaterial);


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


    // --- Viewing zones (bonus): see-through circles on the ground ---

    .polygonsData([])

    // more transparent for low-quality zones, more solid for high-quality ones
    .polygonCapColor((d) => `rgba(200, 215, 255, ${0.06 + 0.22 * d.properties.quality})`)

    // no visible "walls" on the sides
    .polygonSideColor(() => 'rgba(0, 0, 0, 0)')

    .polygonStrokeColor(() => 'rgba(230, 236, 255, 0.55)')

    // each circle gets its own height (see showZones below)
    .polygonAltitude((d) => d.properties.alt)

    .polygonsTransitionDuration(300)


    // --- The rocket (a custom 3D object) ---

    .objectsData([])
    .objectLat('lat')
    .objectLng('lon')
    .objectAltitude('alt')
    .objectThreeObject(() => rocketMesh);


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

      // Move the rocket
      globe.objectsData([positionAt(traj, simT)]);

      // Tell the page (the timeline) where we are
      if (onTick) {
        onTick(simT, tMax);
      }

      // Schedule the next frame
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
  }


  // ---------------------------------------------------------------------------
  // flyTo(trajectory, ms)
  // Smoothly move the camera to look at the middle of the flight path.
  //
  //   lat - 5   tilts the view slightly so we look "up" the path
  //   altitude  is zoom (lower = closer)
  //   ms        is how long the camera move takes
  // ---------------------------------------------------------------------------

  function flyTo(trajectory, ms = 2000) {

    const mid = trajectory[Math.floor(trajectory.length / 2)];

    globe.pointOfView(
      { lat: mid.lat - 5, lng: mid.lon, altitude: 1.3 },
      ms
    );
  }


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
      playAscent();
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


    // -------------------------------------------------------------------------
    // Remove all viewing-zone circles
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