// =============================================================================
// artemis-path.js  (Colby)
// -----------------------------------------------------------------------------
// The Artemis II mission: its timeline, its events, and where Orion is at any
// moment of the 9-day flight. artemis.js uses this to draw and animate it.
//
// Based on NASA's published timeline for Artemis II (1 to 11 April 2026, UTC):
// launch from Launch Complex 39B at Kennedy, about a day in Earth orbit,
// trans-lunar injection, four days out, a flyby behind the far side of the
// Moon about 6,400 km above the surface (setting a new record distance from
// Earth of 406,771 km), a free-return trajectory home, and a Pacific
// splashdown off San Diego 9 days, 1 hour and 32 minutes after launch.
//
// The path is an illustration built to match those facts, not navigation
// data. Distances in space are true scale: the Earth is 100 units in radius
// (1 unit = 63.71 km) and the Moon is at its real distance and size.
// =============================================================================


import * as THREE from 'three';


// 1 globe unit in kilometres (the Earth's radius is 6,371 km = 100 units)
export const KM_PER_UNIT = 63.71;

const HOUR = 3600;
const DAY = 86400;


// =============================================================================
// KEY TIMES (seconds after launch, "mission elapsed time" or MET)
// =============================================================================

export const MET = {
  launch: 0,
  boosterSep: 132,                  // solid rocket boosters separate (~2 min)
  coreSep: 480,                     // core stage separates (~8 min)
  apogeeRaise: 2.28 * HOUR,         // burn into the high, stretched Earth orbit
  tli: 25 * HOUR + 37 * 60,         // trans-lunar injection: leave for the Moon
  flybyStart: 4.86 * DAY,           // lunar flyby window opens (about 7 hours long)
  closest: 4.99 * DAY,              // closest to the Moon, farthest from Earth
  flybyEnd: 5.15 * DAY,
  entry: 9 * DAY + 1 * HOUR + 10 * 60,   // entry interface: hits the atmosphere
  splashdown: 9 * DAY + 1 * HOUR + 32 * 60,
};

// Launch: 1 April 2026, 22:35 UTC
export const LAUNCH_DATE = new Date(Date.UTC(2026, 3, 1, 22, 35, 0));

// Where things are
export const LAUNCH_PAD = { name: 'Launch Complex 39B, Kennedy', lat: 28.627, lon: -80.621 };
export const SPLASHDOWN = { name: 'Pacific Ocean, off San Diego', lat: 32.4, lon: -118.6 };

// The crew
export const CREW = [
  { name: 'Reid Wiseman', role: 'Commander, NASA' },
  { name: 'Victor Glover', role: 'Pilot, NASA' },
  { name: 'Christina Koch', role: 'Mission specialist, NASA' },
  { name: 'Jeremy Hansen', role: 'Mission specialist, Canadian Space Agency' },
];


// =============================================================================
// EVENTS (shown on the timeline and as they happen)
// =============================================================================

export const EVENTS = [
  { t: MET.launch, label: 'Liftoff', detail: 'SLS lifts off from Launch Complex 39B with four astronauts aboard Orion.' },
  { t: MET.boosterSep, label: 'Booster separation', detail: 'The two solid rocket boosters burn out and fall away.' },
  { t: MET.coreSep, label: 'Core stage separation', detail: 'The orange core stage separates. Orion and its upper stage are in orbit.' },
  { t: MET.apogeeRaise, label: 'High Earth orbit', detail: 'The upper stage stretches the orbit out to about 70,000 km for a full day of systems checks.' },
  { t: MET.tli, label: 'Trans-lunar injection', detail: 'Orion fires its engine and leaves Earth orbit for the Moon.' },
  { t: MET.closest, label: 'Lunar flyby', detail: 'Behind the far side, about 6,400 km above the surface: a new record distance from Earth for humans, 406,771 km.' },
  { t: MET.entry, label: 'Re-entry', detail: 'Orion hits the atmosphere at about 11 km/s, protected by its heat shield.' },
  { t: MET.splashdown, label: 'Splashdown', detail: 'Parachutes lower Orion into the Pacific off San Diego. Mission complete.' },
];


// =============================================================================
// PHASES (what's happening, and how long each takes on screen at 1× speed)
// -----------------------------------------------------------------------------
// The real mission is 9 days long, so each phase is sped up by a different
// amount: the 8-minute launch gets 16 seconds, the 4-day coasts get about 18.
// =============================================================================

export const PHASES = [
  { id: 'ascent', name: 'Launch and ascent', from: MET.launch, to: MET.coreSep, screen: 16 },
  { id: 'leo', name: 'Low Earth orbit', from: MET.coreSep, to: MET.apogeeRaise, screen: 8 },
  { id: 'heo', name: 'High Earth orbit checkout', from: MET.apogeeRaise, to: MET.tli, screen: 14 },
  { id: 'outbound', name: 'Coasting to the Moon', from: MET.tli, to: MET.flybyStart, screen: 18 },
  { id: 'flyby', name: 'Lunar flyby', from: MET.flybyStart, to: MET.flybyEnd, screen: 14 },
  { id: 'return', name: 'Coasting home', from: MET.flybyEnd, to: MET.entry, screen: 16 },
  { id: 'entry', name: 'Re-entry and splashdown', from: MET.entry, to: MET.splashdown, screen: 10 },
];

// Total length of the replay at 1× speed, in seconds
export const PLAY_LENGTH = PHASES.reduce((sum, p) => sum + p.screen, 0);


// Replay time (seconds) -> mission time (seconds after launch)
export function metFromPlay(play) {

  let start = 0;

  for (const phase of PHASES) {

    if (play <= start + phase.screen) {
      const f = (play - start) / phase.screen;
      return phase.from + f * (phase.to - phase.from);
    }

    start += phase.screen;
  }

  return MET.splashdown;
}


// Mission time -> replay time (the reverse, used by the timeline slider)
export function playFromMet(met) {

  let start = 0;

  for (const phase of PHASES) {

    if (met <= phase.to) {
      const f = (met - phase.from) / (phase.to - phase.from);
      return start + Math.max(0, f) * phase.screen;
    }

    start += phase.screen;
  }

  return PLAY_LENGTH;
}


// Which phase a mission time falls in
export function phaseAt(met) {
  return PHASES.find((p) => met <= p.to) || PHASES[PHASES.length - 1];
}


// =============================================================================
// THE FLIGHT PATH
// -----------------------------------------------------------------------------
// buildMissionPath(ctx) works out the whole path once. ctx gives it the
// globe's geometry (from globe.js):
//
//   getCoords(lat, lon, alt) -> THREE.Vector3   3D position for lat/lon/altitude
//   altFromKm(km)                               altitude in globe units (as drawn)
//   ascent                                      the ascent trajectory (t in MET seconds)
//   orbit                                       the low orbit it ends in (computeOrbit)
//   orbitPoint(orbit, θ) -> { lat, lon }        a point θ radians round that orbit
//
// It returns { positionAt(met), moonPosition, moonRadius, planeNormal, ... }.
//
// The parts of the flight:
//   1. Ascent:   the rocket's trajectory from the pad
//   2. LEO:      round and round the low orbit it reached
//   3. HEO:      a day-long stretched ellipse (perigee low, apogee ~70,000 km),
//                timed with Kepler's equation so it really slows down at the top
//   4. To the Moon and back: a smooth curve through waypoints, looping behind
//      the Moon and crossing its own path on the way home (the "figure 8")
//   5. Re-entry: along the ground and down to the sea off San Diego
// =============================================================================

export function buildMissionPath(ctx) {

  const { getCoords, altFromKm, ascent, orbit, orbitPoint } = ctx;

  const toScene = (lat, lon, alt) => getCoords(lat, lon, alt);


  // --- 2. Low orbit: the same circle the ascent ended in ---

  const leoAlt = altFromKm(orbit.altKm);

  const leoAt = (met) => {
    const theta = (2 * Math.PI * (met - MET.coreSep)) / orbit.periodS;
    const p = orbitPoint(orbit, theta);
    return toScene(p.lat, p.lon, leoAlt);
  };

  // Where the low orbit is when the high orbit begins (its lowest point, perigee)
  const thetaEnd = (2 * Math.PI * (MET.apogeeRaise - MET.coreSep)) / orbit.periodS;

  const unitAt = (theta) => {
    const p = orbitPoint(orbit, theta);
    return toScene(p.lat, p.lon, 0).normalize();
  };


  // --- The mission's flat "plane" ---
  // Everything after the low orbit happens in one flat plane. We describe
  // points in it with two directions:
  //   X: the direction Orion is moving at perigee (and roughly towards the Moon)
  //   Y: away from the perigee point (so perigee is at (0, -r))
  const xAxis = unitAt(thetaEnd + Math.PI / 2);
  const yAxis = unitAt(thetaEnd).negate();
  const planeNormal = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

  const fromPlane = (x, y) =>
    new THREE.Vector3().addScaledVector(xAxis, x).addScaledVector(yAxis, y);


  // --- 3. High Earth orbit (an ellipse with the Earth at one focus) ---

  const rPerigee = leoAt(MET.apogeeRaise).length();
  const rApogee = (6371 + 70000) / KM_PER_UNIT;     // ~70,000 km up

  const a = (rPerigee + rApogee) / 2;                // semi-major axis
  const e = (rApogee - rPerigee) / (rApogee + rPerigee);   // how stretched
  const b = a * Math.sqrt(1 - e * e);                // semi-minor axis
  const heoPeriod = MET.tli - MET.apogeeRaise;        // one lap, ending at TLI

  const heoAt = (met) => {

    // Kepler's equation: M = E − e·sin(E). M grows steadily with time; we
    // solve for E (Newton's method) to find the true position. This makes
    // the spacecraft race past perigee and crawl around apogee.
    const M = (2 * Math.PI * (met - MET.apogeeRaise)) / heoPeriod;
    let E = M;

    for (let i = 0; i < 8; i++) {
      E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }

    return fromPlane(b * Math.sin(E), -(a * Math.cos(E) - a * e));
  };


  // --- The Moon: on the X axis, placed so the flyby distance is right ---
  // Farthest from Earth = 406,771 km, reached at closest approach, when
  // Orion is 6,437 km above the Moon (8,174 km from its centre).

  const moonRadius = 1737 / KM_PER_UNIT;
  const flybyR = (1737 + 6437) / KM_PER_UNIT;
  const moonDist = 406771 / KM_PER_UNIT - flybyR;
  const moonPosition = fromPlane(moonDist, 0);


  // --- 4 + 5. To the Moon and back: waypoints (time, position) ---
  // Out along +Y, round the far side of the Moon clockwise (seen from the
  // plane's normal), back along -Y, crossing the outbound path near Earth.

  const D = moonDist;
  const r = flybyR;
  const day = (d) => d * DAY;

  // Waypoint times near the Earth are set from how long a free fall from
  // that height takes, so Orion speeds up realistically as it nears Earth.
  // The points beside the Moon are pushed out a little, because the smooth
  // curve cuts slightly inside them.
  const waypoints = [
    [MET.tli, fromPlane(0, -rPerigee)],
    [day(1.15), fromPlane(600, -110)],
    [day(1.35), fromPlane(1500, 80)],
    [day(1.9), fromPlane(2600, 330)],
    [day(2.7), fromPlane(3650, 520)],
    [day(3.6), fromPlane(4750, 560)],
    [day(4.4), fromPlane(5650, 400)],
    [day(4.8), fromPlane(D - 170, 225)],
    [day(4.92), fromPlane(D + r * 0.55, r * 0.97)],
    [MET.closest, fromPlane(D + r, 0)],
    [day(5.06), fromPlane(D + r * 0.55, -r * 0.97)],
    [day(5.2), fromPlane(D - 170, -240)],
    [day(6.0), fromPlane(5000, -560)],
    [day(7.0), fromPlane(3500, -520)],
    [day(8.1), fromPlane(2000, -300)],
    [day(8.75), fromPlane(900, 60)],
  ];


  // Final approach: fall towards the splashdown point from high above it,
  // reaching the top of the atmosphere about 1,500 km before it.
  const splashDir = toScene(SPLASHDOWN.lat, SPLASHDOWN.lon, 0).normalize();
  const lastPlane = waypoints[waypoints.length - 1][1];

  // Entry point: tilted from the splashdown point towards where Orion is
  // coming from, so it arrives at a shallow angle
  const towardsArrival = lastPlane.clone().normalize().sub(splashDir).normalize();
  const entryDir = splashDir.clone().addScaledVector(towardsArrival, 0.24).normalize();
  const entryR = 100 + 122 / KM_PER_UNIT;

  waypoints.push(
    [day(8.95), entryDir.clone().multiplyScalar(560)],
    [MET.entry - 6 * 60, entryDir.clone().multiplyScalar(118)],
    [MET.entry, entryDir.clone().multiplyScalar(entryR)],
  );


  // Re-entry (its own simple curve, so it can't dip below the sea): follow
  // the ground from the entry point to the splashdown point, coming down
  // from 122 km to sea level, falling fastest at the start.
  const reentryAt = (met) => {

    const f = Math.min(Math.max((met - MET.entry) / (MET.splashdown - MET.entry), 0), 1);

    // Blend the direction from entry point to splashdown point
    const dir = entryDir.clone().lerp(splashDir, f).normalize();

    // Altitude: 122 km -> 0, curving down quickly then gently (parachutes)
    const altUnits = (122 / KM_PER_UNIT) * Math.pow(1 - f, 1.6);

    return dir.multiplyScalar(100.05 + altUnits);
  };


  // A smooth curve through all the waypoints ("centripetal" stops it
  // overshooting at tight turns, like going round the Moon)
  const curve = new THREE.CatmullRomCurve3(waypoints.map((w) => w[1]), false, 'centripetal');
  const times = waypoints.map((w) => w[0]);

  const curveAt = (met) => {

    // Find which pair of waypoints the time falls between, then how far
    // along the curve that is (each segment is an equal share of it)
    let i = times.findIndex((t) => t >= met);

    if (i <= 0) {
      i = 1;
    }

    const f = (met - times[i - 1]) / (times[i] - times[i - 1]);
    const u = (i - 1 + Math.min(Math.max(f, 0), 1)) / (times.length - 1);

    return curve.getPoint(u);
  };


  // --- 1. Ascent ---

  const ascentAt = (met) => {

    let i = ascent.findIndex((p) => p.t >= met);

    if (i <= 0) {
      i = 1;
    }

    const p = ascent[i - 1];
    const q = ascent[i];
    const f = Math.min(Math.max((met - p.t) / (q.t - p.t), 0), 1);

    return toScene(
      p.lat + (q.lat - p.lat) * f,
      p.lon + (q.lon - p.lon) * f,
      altFromKm(p.altKm + (q.altKm - p.altKm) * f)
    );
  };


  // --- Where Orion is at any mission time ---

  function positionAt(met) {
    if (met <= MET.coreSep) return ascentAt(met);
    if (met <= MET.apogeeRaise) return leoAt(met);
    if (met <= MET.tli) return heoAt(met);
    if (met <= MET.entry) return curveAt(met);
    return reentryAt(met);
  }


  // ---------------------------------------------------------------------------
  // Real altitude and speed, for the display.
  // Near the Earth (ascent and low orbit) the DRAWN path exaggerates heights
  // so they're visible, so the display uses the real numbers there instead.
  // ---------------------------------------------------------------------------

  // Real altitude during the ascent, from the trajectory's own altitudes
  const ascentAltKm = (met) => {
    let i = ascent.findIndex((p) => p.t >= met);
    if (i <= 0) i = 1;
    const p = ascent[i - 1];
    const q = ascent[i];
    const f = Math.min(Math.max((met - p.t) / (q.t - p.t), 0), 1);
    return p.altKm + (q.altKm - p.altKm) * f;
  };

  // Real position during the ascent (true-scale height), in km from Earth's centre
  const ascentRealKm = (met) => {
    let i = ascent.findIndex((p) => p.t >= met);
    if (i <= 0) i = 1;
    const p = ascent[i - 1];
    const q = ascent[i];
    const f = Math.min(Math.max((met - p.t) / (q.t - p.t), 0), 1);
    const lat = p.lat + (q.lat - p.lat) * f;
    const lon = p.lon + (q.lon - p.lon) * f;
    const alt = p.altKm + (q.altKm - p.altKm) * f;
    return toScene(lat, lon, alt / 6371).multiplyScalar(KM_PER_UNIT);
  };

  function altitudeKm(met) {

    if (met <= MET.coreSep) return ascentAltKm(met);
    if (met <= MET.apogeeRaise) return orbit.altKm;
    if (met >= MET.splashdown) return 0;

    return Math.max(0, positionAt(met).length() * KM_PER_UNIT - 6371);
  }

  function speedKmS(met) {

    // Ascent: from the true-scale path
    if (met <= MET.coreSep) {
      const t0 = Math.max(0, met - 2);
      const t1 = Math.min(MET.coreSep, met + 2);
      return ascentRealKm(t0).distanceTo(ascentRealKm(t1)) / (t1 - t0);
    }

    // Low orbit: the real circular orbit speed, √(μ / r)
    if (met <= MET.apogeeRaise) {
      return Math.sqrt(398600 / (6371 + orbit.altKm));
    }

    // Re-entry: the atmosphere slows Orion from about 11 km/s to a gentle
    // parachute descent, braking hardest at the start
    if (met >= MET.entry) {
      const f = Math.min((met - MET.entry) / (MET.splashdown - MET.entry), 1);
      return 11 * Math.pow(1 - f, 3);
    }

    // Everywhere else the path is true scale
    const t0 = Math.max(0, met - 30);
    const t1 = Math.min(MET.splashdown, met + 30);
    return (positionAt(t0).distanceTo(positionAt(t1)) * KM_PER_UNIT) / (t1 - t0);
  }


  return {
    positionAt,
    altitudeKm,
    speedKmS,
    moonPosition,
    moonRadius,
    planeNormal,
    xAxis,
    yAxis,
    splashDir,
  };
}