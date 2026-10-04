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

// lat/lon -> direction from the Earth's centre, in plain maths coordinates
// (the same kind globe.js uses to describe orbits)
const mathXYZ = (lat, lon) => {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};

const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];


// =============================================================================
// KEY TIMES (seconds after launch, "mission elapsed time" or MET)
// =============================================================================

export const MET = {
  launch: 0,
  boosterSep: 132,                  // solid rocket boosters separate (~2 min)
  coreSep: 480,                     // core stage separates (~8 min)
  apogeeRaise: 2.28 * HOUR,         // burn into the high, stretched Earth orbit
                                    // (fine-tuned by buildMissionPath, see below)
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

// buildMissionPath() works out the exact moment to raise the orbit (so the
// return lands off San Diego). This updates every list that uses that time.
function setApogeeRaise(t) {
  MET.apogeeRaise = t;
  PHASES.find((p) => p.id === 'leo').to = t;
  PHASES.find((p) => p.id === 'heo').from = t;
  EVENTS.find((e) => e.label === 'High Earth orbit').t = t;
}


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

  const unitAt = (theta) => {
    const p = orbitPoint(orbit, theta);
    return toScene(p.lat, p.lon, 0).normalize();
  };


  // --- Planning the mission (like real mission planners do) ---
  //
  // The figure-8 trip leaves Earth from the LOWEST point of the high orbit
  // (perigee) and comes back over the OPPOSITE side of the Earth. So to come
  // home over the Pacific, perigee must be on the far side of the Earth from
  // the re-entry point. We choose re-entry about 16° (1,780 km) before the
  // splashdown point, then work out how long to stay in low orbit so that
  // the orbit is raised at exactly the right spot.

  // How far round the low orbit (as an angle) the splashdown point is.
  // orbit.P and orbit.D are the two directions that describe the orbit.
  const sd = mathXYZ(SPLASHDOWN.lat, SPLASHDOWN.lon);
  const thetaSplash = Math.atan2(dot(sd, orbit.D), dot(sd, orbit.P));

  const ENTRY_ARC = 16 * (Math.PI / 180);
  const thetaEntry = thetaSplash - ENTRY_ARC;
  const thetaPerigee = thetaEntry - Math.PI;

  // Time to raise the orbit: when the low orbit reaches thetaPerigee,
  // sometime between 1.4 and about 3 hours after launch
  const fullTurn = 2 * Math.PI;
  const turns = (((thetaPerigee % fullTurn) + fullTurn) % fullTurn) / fullTurn;
  let raiseAt = MET.coreSep + turns * orbit.periodS;

  while (raiseAt < 1.4 * HOUR) {
    raiseAt += orbit.periodS;
  }

  setApogeeRaise(raiseAt);

  const thetaEnd = (2 * Math.PI * (MET.apogeeRaise - MET.coreSep)) / orbit.periodS;


  // --- The mission's flat "plane" ---
  // Everything after the low orbit happens in one flat plane. We describe
  // points in it with two directions:
  //   X: the direction Orion is moving at perigee (and towards the Moon)
  //   Y: away from the perigee point (so perigee is at (0, -r), and the
  //      re-entry point is straight across the Earth at (0, +r))
  const xAxis = unitAt(thetaEnd + Math.PI / 2);
  const yAxis = unitAt(thetaEnd).negate();
  const planeNormal = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

  const fromPlane = (x, y) =>
    new THREE.Vector3().addScaledVector(xAxis, x).addScaledVector(yAxis, y);


  // --- 3. High Earth orbit (an ellipse with the Earth at one focus) ---

  const rPerigee = leoAt(MET.apogeeRaise).length();
  const heoPeriod = MET.tli - MET.apogeeRaise;        // one lap, ending at TLI

  // The orbit's size follows from its period (Kepler's third law):
  //   a = ∛( μ × (period / 2π)² )
  const aKm = Math.cbrt(398600 * Math.pow(heoPeriod / (2 * Math.PI), 2));
  const a = aKm / KM_PER_UNIT;                        // semi-major axis
  const rApogee = 2 * a - rPerigee;                   // ~70,000 km up
  const e = (rApogee - rPerigee) / (rApogee + rPerigee);   // how stretched
  const b = a * Math.sqrt(1 - e * e);                 // semi-minor axis

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


  // --- 4. The figure-8: to the Moon and back ---
  //
  //          ↗ ─────────╮
  //   Earth      ✕       Moon      out below, round the far side of the
  //          ↖ ─────────╯          Moon, back over the top, crossing the
  //                                outbound path halfway
  //
  // Waypoint times near the Earth come from how long a free fall from that
  // height takes, so Orion speeds up realistically as it nears Earth.

  const D = moonDist;
  const r = flybyR;
  const day = (d) => d * DAY;
  const entryR = 100 + 122 / KM_PER_UNIT;

  const waypoints = [

    // leaving Earth from perigee, heading +X
    [MET.tli, fromPlane(0, -rPerigee)],
    [day(1.12), fromPlane(600, -175)],
    [day(1.4), fromPlane(1500, -250)],

    // crossing the middle, climbing to pass over the top of the Moon
    [day(2.3), fromPlane(D * 0.45, 0)],
    [day(3.4), fromPlane(D * 0.7, D * 0.07)],
    [day(4.3), fromPlane(D * 0.88, D * 0.06)],

    // round the far side of the Moon (the points beside the Moon are pushed
    // out a little, because the smooth curve cuts slightly inside them)
    [day(4.8), fromPlane(D - 170, 225)],
    [day(4.92), fromPlane(D + r * 0.55, r * 0.97)],
    [MET.closest, fromPlane(D + r, 0)],
    [day(5.06), fromPlane(D + r * 0.55, -r * 0.97)],
    [day(5.2), fromPlane(D - 170, -240)],

    // heading home below the Moon, crossing the middle again
    [day(5.7), fromPlane(D * 0.88, -D * 0.06)],
    [day(6.6), fromPlane(D * 0.7, -D * 0.07)],
    [day(7.6), fromPlane(D * 0.45, 0)],

    // falling back to Earth over the top, arriving at a shallow angle
    [day(8.4), fromPlane(D * 0.25, D * 0.035)],
    [day(8.86), fromPlane(D * 0.1, D * 0.05)],
    [day(8.99), fromPlane(450, 150)],
    [MET.entry, fromPlane(0, entryR)],

    // (never reached: only steers the curve's direction at the entry point
    // so it joins the re-entry smoothly)
    [MET.entry + HOUR, fromPlane(-Math.sin(ENTRY_ARC / 2) * 100.6, Math.cos(ENTRY_ARC / 2) * 100.6)],
  ];

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


  // --- 5. Re-entry ---
  // From the entry point over the Pacific to the splashdown point, curving
  // smoothly (a curve with a "pull" point halfway along the orbit's
  // direction), coming down from 122 km to sea level.

  const splashDir = toScene(SPLASHDOWN.lat, SPLASHDOWN.lon, 0).normalize();
  const entryDir = yAxis.clone();
  const pullDir = fromPlane(-Math.sin(ENTRY_ARC / 2), Math.cos(ENTRY_ARC / 2)).normalize();

  const reentryAt = (met) => {

    const f = Math.min(Math.max((met - MET.entry) / (MET.splashdown - MET.entry), 0), 1);

    // Curved blend of the three directions (a "quadratic Bézier")
    const dir = new THREE.Vector3()
      .addScaledVector(entryDir, (1 - f) * (1 - f))
      .addScaledVector(pullDir, 2 * f * (1 - f))
      .addScaledVector(splashDir, f * f)
      .normalize();

    // Altitude: 122 km -> 0, falling fastest at the start (then parachutes)
    const altUnits = (entryR - 100) * Math.pow(1 - f, 1.6);

    return dir.multiplyScalar(100.02 + altUnits);
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