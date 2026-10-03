// Colby's globe module.
// Everything 3D lives here. The rest of the app only calls the functions returned by createGlobe().

import Globe from 'globe.gl';
import * as THREE from 'three';

const EARTH_R_KM = 6371;
const ALT_SCALE = 3;         // exaggerate altitude so a 200 km ascent is visible from orbit view
const PLAYBACK_MS = 10000;   // how long the ascent animation takes on screen
const PAUSE_MS = 1500;       // pause before the animation loops

const RATING_COLORS = {
  green: '#3ddc84',
  yellow: '#ffcc33',
  red: '#ff4d4d',
  none: '#9fd3ff',
};

const IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img';
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const altFromKm = (km) => (km / EARTH_R_KM) * ALT_SCALE; // globe.gl altitude is in Earth radii

export function createGlobe(container) {
  const rocketMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );

  const globe = Globe()(container)
    .globeImageUrl(`${IMG}/earth-blue-marble.jpg`)
    .bumpImageUrl(`${IMG}/earth-topology.png`)
    .backgroundImageUrl(`${IMG}/night-sky.png`)
    .atmosphereColor('#7fb8ff')
    .atmosphereAltitude(0.18)

    // Launch pad label + dot
    .labelsData([])
    .labelLat((d) => d.lat)
    .labelLng((d) => d.lon)
    .labelText((d) => d.name)
    .labelSize(0.6)
    .labelDotRadius(0.35)
    .labelColor(() => '#ffffff')
    .labelResolution(2)

    // Pulsing rings at the pad
    .ringsData([])
    .ringLat((d) => d.lat)
    .ringLng((d) => d.lon)
    .ringColor(() => (t) => `rgba(255,255,255,${1 - t})`)
    .ringMaxRadius(3)
    .ringPropagationSpeed(1.5)
    .ringRepeatPeriod(1200)

    // Trajectory arc
    .pathsData([])
    .pathPoints('points')
    .pathPointLat((p) => p.lat)
    .pathPointLng((p) => p.lon)
    .pathPointAlt((p) => altFromKm(p.altKm))
    .pathColor((d) => d.color)
    .pathStroke(3)
    .pathDashLength(0.06)
    .pathDashGap(0.015)
    .pathDashAnimateTime(4000)
    .pathTransitionDuration(0)

    // Viewing zones (bonus)
    .polygonsData([])
    .polygonCapColor((d) => `rgba(120, 200, 255, ${0.08 + 0.3 * d.properties.quality})`)
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(170, 220, 255, 0.7)')
    .polygonAltitude((d) => d.properties.alt)
    .polygonsTransitionDuration(300)

    // Rocket
    .objectsData([])
    .objectLat('lat')
    .objectLng('lon')
    .objectAltitude('alt')
    .objectThreeObject(() => rocketMesh);

  // Slow spin until a launch is selected
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.4;

  // Keep the canvas sized to its container
  const resize = () => globe.width(container.clientWidth).height(container.clientHeight);
  window.addEventListener('resize', resize);
  resize();

  // ---------- internal state ----------
  let current = { launch: null, trajectory: [], rating: 'none' };
  let rafId = null;

  function drawPath() {
    globe.pathsData(
      current.trajectory.length
        ? [{ points: current.trajectory, color: RATING_COLORS[current.rating] || RATING_COLORS.none }]
        : []
    );
  }

  function positionAt(trajectory, simT) {
    let i = trajectory.findIndex((p) => p.t >= simT);
    if (i <= 0) i = i === 0 ? 1 : trajectory.length - 1;
    const a = trajectory[i - 1];
    const b = trajectory[i];
    const f = b.t === a.t ? 0 : (simT - a.t) / (b.t - a.t);
    return {
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      alt: altFromKm(a.altKm + (b.altKm - a.altKm) * f),
    };
  }

  function playAscent() {
    cancelAnimationFrame(rafId);
    const traj = current.trajectory;
    if (traj.length < 2) return;
    const tMax = traj[traj.length - 1].t;
    const start = performance.now();

    const frame = (now) => {
      const elapsed = (now - start) % (PLAYBACK_MS + PAUSE_MS);
      const simT = Math.min(elapsed / PLAYBACK_MS, 1) * tMax;
      globe.objectsData([positionAt(traj, simT)]);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function flyTo(trajectory, ms = 2000) {
    const mid = trajectory[Math.floor(trajectory.length / 2)];
    globe.pointOfView({ lat: mid.lat - 5, lng: mid.lon, altitude: 1.3 }, ms);
  }

  // Circle of radiusKm around (lat, lon) as a GeoJSON polygon ring
  function circleRing(lat, lon, radiusKm, steps = 64) {
    const phi = toRad(lat);
    const lambda = toRad(lon);
    const delta = radiusKm / EARTH_R_KM;
    const ring = [];
    for (let k = 0; k <= steps; k++) {
      const brg = (2 * Math.PI * k) / steps;
      const lat2 = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(brg));
      const lon2 = lambda + Math.atan2(
        Math.sin(brg) * Math.sin(delta) * Math.cos(phi),
        Math.cos(delta) - Math.sin(phi) * Math.sin(lat2)
      );
      ring.push([toDeg(lon2), toDeg(lat2)]);
    }
    return ring;
  }

  // ---------- public API ----------
  return {
    /** Show a launch: pad marker, trajectory arc, rocket animation, camera move. */
    showLaunch(launch, trajectory, weather) {
      current = { launch, trajectory, rating: weather?.rating || 'none' };
      globe.controls().autoRotate = false;
      globe.labelsData([launch.pad]);
      globe.ringsData([launch.pad]);
      drawPath();
      flyTo(trajectory);
      playAscent();
    },

    /** Recolour the arc when the weather rating changes: 'green' | 'yellow' | 'red'. */
    setWeather(rating) {
      current.rating = rating;
      drawPath();
    },

    /** Restart the rocket animation from liftoff. */
    replay() {
      playAscent();
    },

    /** Bonus: draw viewing zones [{ lat, lon, radiusKm, quality }]. */
    showZones(zones) {
      // Biggest circles at the bottom, smaller ones stacked slightly higher,
      // so overlapping circles never sit at the same height (avoids z-fighting).
      const sorted = [...zones].sort((a, b) => b.radiusKm - a.radiusKm);
      globe.polygonsData(
        sorted.map((z, i) => ({
          type: 'Feature',
          properties: { quality: z.quality, alt: 0.004 + i * 0.002 },
          geometry: { type: 'Polygon', coordinates: [circleRing(z.lat, z.lon, z.radiusKm)] },
        }))
      );
    },

    clearZones() {
      globe.polygonsData([]);
    },

    /** Access to the raw globe.gl instance if you need it. */
    raw: globe,
  };
}