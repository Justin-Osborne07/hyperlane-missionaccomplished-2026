// =============================================================================
// globe.js  (Colby)
// -----------------------------------------------------------------------------
// Everything 3D lives in this file. It uses globe.gl, a library that draws an
// interactive 3D Earth using three.js (the 3D graphics library underneath).
//
// The rest of the app never touches globe.gl directly. Instead it calls the
// small set of functions returned at the bottom of createGlobe():
//
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

// ---------- Settings you can tweak ----------

const EARTH_R_KM = 6371;     // Earth's radius in kilometres
const ALT_SCALE = 3;         // Multiplies altitude so a 200 km climb is actually visible.
                             // 1 = true scale (very flat), higher = more dramatic.
const PLAYBACK_MS = 10000;   // How long the full ascent takes on screen (10 seconds)
const PAUSE_MS = 1500;       // Pause at the end before the animation loops

// Colour of the flight path for each weather rating
const RATING_COLORS = {
  green: '#3ddc84',
  yellow: '#ffcc33',
  red: '#ff4d4d',
  none: '#9fd3ff', // used before any weather data arrives
};

// Earth textures (satellite photo, terrain bumps, starry background) hosted on a CDN
const IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img';

// ---------- Small helper functions ----------

// Convert degrees <-> radians (JavaScript's Math functions use radians)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// globe.gl measures altitude in "Earth radii" (1 = one Earth radius above the surface),
// not kilometres. This converts km to that unit and applies the exaggeration.
const altFromKm = (km) => (km / EARTH_R_KM) * ALT_SCALE;

// =============================================================================
// createGlobe(container, options)
//   container: the HTML element to draw the globe inside (the #globe div)
//   options.onTick(simT, tMax): optional function called every animation frame
//     with the rocket's current flight time, so other parts of the page
//     (like the ascent timeline) can stay in sync with the animation.
// =============================================================================
export function createGlobe(container, { onTick } = {}) {
  // The rocket is just a small glowing sphere. MeshBasicMaterial ignores lighting,
  // so it always looks bright no matter which side of the Earth it's on.
  const rocketMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 16), // radius, then smoothness (segments)
    new THREE.MeshBasicMaterial({ color: '#fff1d6' })
  );

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
    .globeImageUrl(`${IMG}/earth-blue-marble.jpg`)  // satellite photo of Earth
    .bumpImageUrl(`${IMG}/earth-topology.png`)      // makes mountains look raised
    .backgroundImageUrl(`${IMG}/night-sky.png`)     // stars behind the globe
    .atmosphereColor('#8fb0ff')                     // blue glow around the edge
    .atmosphereAltitude(0.18)                       // how thick that glow is

    // --- Launch pad label + dot ---
    .labelsData([])
    .labelLat((d) => d.lat)
    .labelLng((d) => d.lon)
    .labelText((d) => d.name)
    .labelSize(0.45)
    .labelDotRadius(0.3)
    .labelColor(() => 'rgba(230, 236, 255, 0.85)')
    .labelResolution(2)

    // --- Pulsing orange rings at the pad (like a radar ping) ---
    .ringsData([])
    .ringLat((d) => d.lat)
    .ringLng((d) => d.lon)
    // ringColor returns a function of t (0 = ring just started, 1 = fully expanded),
    // so the ring fades out as it grows.
    .ringColor(() => (t) => `rgba(255, 181, 71, ${1 - t})`)
    .ringMaxRadius(3)          // how far each ring expands (in degrees)
    .ringPropagationSpeed(1.5) // how fast it expands
    .ringRepeatPeriod(1200)    // a new ring every 1.2 seconds

    // --- Flight path (the dashed line) ---
    .pathsData([])
    .pathPoints('points')                            // each path object has a "points" array
    .pathPointLat((p) => p.lat)
    .pathPointLng((p) => p.lon)
    .pathPointAlt((p) => altFromKm(p.altKm))         // lift each point off the surface
    .pathColor((d) => d.color)
    .pathStroke(3)                                   // line thickness
    .pathDashLength(0.06)                            // dash length (fraction of the path)
    .pathDashGap(0.015)                              // gap between dashes
    .pathDashAnimateTime(4000)                       // dashes flow along the path every 4 s
    .pathTransitionDuration(0)                       // redraw instantly when recoloured

    // --- Viewing zones (bonus): see-through circles on the ground ---
    .polygonsData([])
    // More transparent for low-quality zones, more solid for high-quality ones
    .polygonCapColor((d) => `rgba(200, 215, 255, ${0.06 + 0.22 * d.properties.quality})`)
    .polygonSideColor(() => 'rgba(0,0,0,0)')        // no visible "walls" on the sides
    .polygonStrokeColor(() => 'rgba(230, 236, 255, 0.55)')
    .polygonAltitude((d) => d.properties.alt)        // each circle gets its own height (see showZones)
    .polygonsTransitionDuration(300)

    // --- The rocket (a custom 3D object) ---
    .objectsData([])
    .objectLat('lat')
    .objectLng('lon')
    .objectAltitude('alt')
    .objectThreeObject(() => rocketMesh);

  // Slowly spin the Earth until a launch is selected
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.4;

  // Keep the 3D canvas the same size as its container, including when the window resizes
  const resize = () => globe.width(container.clientWidth).height(container.clientHeight);
  window.addEventListener('resize', resize);
  resize();

  // ---------- Internal state (what's currently shown) ----------
  let current = { launch: null, trajectory: [], rating: 'none' };
  let rafId = null; // ID of the running animation loop, so we can stop it

  // Draw (or redraw) the flight path in the colour matching the current weather
  function drawPath() {
    globe.pathsData(
      current.trajectory.length
        ? [{ points: current.trajectory, color: RATING_COLORS[current.rating] || RATING_COLORS.none }]
        : []
    );
  }

  // Work out where the rocket is at flight time simT (seconds after liftoff).
  // The trajectory is a list of points, so we find the two points either side
  // of simT and blend between them ("linear interpolation").
  function positionAt(trajectory, simT) {
    let i = trajectory.findIndex((p) => p.t >= simT); // first point at or after simT
    if (i <= 0) i = i === 0 ? 1 : trajectory.length - 1; // handle the very start / end
    const a = trajectory[i - 1];
    const b = trajectory[i];
    const f = b.t === a.t ? 0 : (simT - a.t) / (b.t - a.t); // 0 = at a, 1 = at b
    return {
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      alt: altFromKm(a.altKm + (b.altKm - a.altKm) * f),
    };
  }

  // Run the rocket animation. requestAnimationFrame calls `frame` about 60 times
  // a second; each time we move the rocket to where it should be right now.
  function playAscent() {
    cancelAnimationFrame(rafId); // stop any animation already running
    const traj = current.trajectory;
    if (traj.length < 2) return;
    const tMax = traj[traj.length - 1].t; // total flight time in seconds
    const start = performance.now();       // when the animation started (ms)

    const frame = (now) => {
      // `%` (remainder) makes the animation loop: it restarts after PLAYBACK_MS + PAUSE_MS
      const elapsed = (now - start) % (PLAYBACK_MS + PAUSE_MS);
      // Map real elapsed time to flight time, holding at the end during the pause
      const simT = Math.min(elapsed / PLAYBACK_MS, 1) * tMax;
      globe.objectsData([positionAt(traj, simT)]); // move the rocket
      onTick?.(simT, tMax);                        // tell the page (timeline) where we are
      rafId = requestAnimationFrame(frame);        // schedule the next frame
    };
    rafId = requestAnimationFrame(frame);
  }

  // Smoothly move the camera to look at the middle of the flight path.
  // lat - 5 tilts the view slightly so we look "up" the path; altitude is zoom
  // (lower = closer). ms = how long the camera move takes.
  function flyTo(trajectory, ms = 2000) {
    const mid = trajectory[Math.floor(trajectory.length / 2)];
    globe.pointOfView({ lat: mid.lat - 5, lng: mid.lon, altitude: 1.3 }, ms);
  }

  // Build a circle of radiusKm around (lat, lon) as a list of [lon, lat] points.
  // You can't just draw a circle in degrees on a sphere, so we walk around the
  // centre in 64 steps, using the "destination point" formula to find the spot
  // radiusKm away in each direction (bearing).
  function circleRing(lat, lon, radiusKm, steps = 64) {
    const phi = toRad(lat);
    const lambda = toRad(lon);
    const delta = radiusKm / EARTH_R_KM; // radius as an angle on the sphere
    const ring = [];
    for (let k = 0; k <= steps; k++) {
      const brg = (2 * Math.PI * k) / steps; // direction: 0 = north, going clockwise
      const lat2 = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(brg));
      const lon2 = lambda + Math.atan2(
        Math.sin(brg) * Math.sin(delta) * Math.cos(phi),
        Math.cos(delta) - Math.sin(phi) * Math.sin(lat2)
      );
      ring.push([toDeg(lon2), toDeg(lat2)]); // GeoJSON wants [longitude, latitude]
    }
    return ring;
  }

  // ===========================================================================
  // Public functions: the only things the rest of the app can call
  // ===========================================================================
  return {
    /** Show a launch: pad marker, flight path, rocket animation, camera move. */
    showLaunch(launch, trajectory, weather) {
      current = { launch, trajectory, rating: weather?.rating || 'none' };
      globe.controls().autoRotate = false; // stop spinning so the user can look
      globe.labelsData([launch.pad]);
      globe.ringsData([launch.pad]);
      drawPath();
      flyTo(trajectory);
      playAscent();
    },

    /** Recolour the path when the weather rating changes: 'green' | 'yellow' | 'red'. */
    setWeather(rating) {
      current.rating = rating;
      drawPath();
    },

    /** Restart the rocket animation from liftoff. */
    replay() {
      playAscent();
    },

    /** Bonus: draw viewing zones, a list of { lat, lon, radiusKm, quality }. */
    showZones(zones) {
      // Sort biggest first, then give each circle a slightly higher altitude.
      // If two flat shapes sit at exactly the same height, the graphics card
      // can't decide which is on top and they flicker in stripes ("z-fighting").
      const sorted = [...zones].sort((a, b) => b.radiusKm - a.radiusKm);
      globe.polygonsData(
        sorted.map((z, i) => ({
          // Each circle is a GeoJSON "Feature", the standard format for map shapes
          type: 'Feature',
          properties: { quality: z.quality, alt: 0.004 + i * 0.002 },
          geometry: { type: 'Polygon', coordinates: [circleRing(z.lat, z.lon, z.radiusKm)] },
        }))
      );
    },

    /** Remove all viewing-zone circles. */
    clearZones() {
      globe.polygonsData([]);
    },

    /** The raw globe.gl object, in case you need a setting not wrapped above. */
    raw: globe,
  };
}