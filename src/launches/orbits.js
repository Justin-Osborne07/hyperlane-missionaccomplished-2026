// =============================================================================
// orbits.js  (Colby)
// -----------------------------------------------------------------------------
// Orbit maths shared by the globe (to draw and animate orbits), the cockpit
// instruments, and the launch adapter (to estimate real launches' orbits).
//
// An orbit's SHAPE is described by its lowest and highest points:
//   { perigeeKm, apogeeKm }   (heights above the ground, in km)
// A circular orbit has both the same, e.g. { perigeeKm: 550, apogeeKm: 550 }.
// A transfer orbit to geostationary (GTO) is a long ellipse:
//   { perigeeKm: 200, apogeeKm: 35786 }
// =============================================================================


// Earth's radius (km) and gravity constant (km³/s²)
export const R_EARTH = 6371;
export const MU = 398600;

// Typical real orbit heights (km), used for estimates
export const HEIGHTS = {
  station: 420,      // International Space Station
  starlink: 550,
  sso: 600,
  polar: 800,
  meo: 20200,        // GPS, Galileo
  geo: 35786,        // geostationary
};


// A circular orbit at one height
export const circular = (km) => ({ perigeeKm: km, apogeeKm: km });

// A transfer orbit from a low perigee up to geostationary height
export const GTO = { perigeeKm: 200, apogeeKm: HEIGHTS.geo };


// -----------------------------------------------------------------------------
// orbitElements(shape)
// The numbers that describe an orbit's size and stretch:
//   a:       semi-major axis (half the longest width), km from Earth's centre
//   e:       eccentricity (0 = circle, close to 1 = very stretched)
//   periodS: time for one lap, in seconds (Kepler's third law: 2π√(a³/μ))
// -----------------------------------------------------------------------------

export function orbitElements(shape) {

  const rp = R_EARTH + shape.perigeeKm;
  const ra = R_EARTH + shape.apogeeKm;

  const a = (rp + ra) / 2;
  const e = (ra - rp) / (ra + rp);
  const periodS = 2 * Math.PI * Math.sqrt((a * a * a) / MU);

  return { a, e, periodS };
}


// -----------------------------------------------------------------------------
// keplerState(shape, t)
// Where a spacecraft is, t seconds after passing perigee (its lowest point):
//
//   angle:    how far round the orbit it is, from perigee (radians)
//             (astronomers call this the "true anomaly")
//   altKm:    its height above the ground
//   speedKmS: its speed
//
// On a stretched orbit it races round the low end and crawls round the high
// end. Kepler's equation, M = E − e·sin(E), handles that: M grows steadily
// with time, and we solve for E with Newton's method.
// -----------------------------------------------------------------------------

export function keplerState(shape, t) {

  const { a, e, periodS } = orbitElements(shape);

  // Mean anomaly: grows steadily from 0 to 2π over one lap
  const M = (2 * Math.PI * (((t % periodS) + periodS) % periodS)) / periodS;

  // Solve Kepler's equation (start from π for very stretched orbits)
  let E = e < 0.8 ? M : Math.PI;

  for (let i = 0; i < 12; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }

  // From E to the actual angle round the orbit, and the distance
  const angle = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E));

  // Speed from the "vis-viva" equation: v = √(μ (2/r − 1/a))
  const speedKmS = Math.sqrt(MU * (2 / r - 1 / a));

  return { angle, altKm: r - R_EARTH, speedKmS, periodS };
}


// -----------------------------------------------------------------------------
// heightAtAngle(shape, angle)
// Height above the ground at an angle round the orbit from perigee.
// (Used to draw the full orbit ring.)  r = a(1 − e²) / (1 + e·cos(angle))
// -----------------------------------------------------------------------------

export function heightAtAngle(shape, angle) {
  const { a, e } = orbitElements(shape);
  return (a * (1 - e * e)) / (1 + e * Math.cos(angle)) - R_EARTH;
}


// -----------------------------------------------------------------------------
// sunSyncInclination(altKm)
// A sun-synchronous orbit is tilted just past the poles by exactly the right
// amount that the Earth's bulge slowly turns it to keep pace with the Sun.
// That tilt depends on the height:  cos(i) = −(a / 12,352 km)^3.5
// e.g. 600 km -> about 97.8°
// -----------------------------------------------------------------------------

export function sunSyncInclination(altKm) {
  const a = R_EARTH + altKm;
  return (Math.acos(-Math.pow(a / 12352, 3.5)) * 180) / Math.PI;
}


// Describe an orbit's height for people, e.g. "550 km" or "200 × 35,786 km"
export function describeShape(shape) {

  const km = (n) => Math.round(n).toLocaleString();

  return shape.perigeeKm === shape.apogeeKm
    ? `${km(shape.perigeeKm)} km`
    : `${km(shape.perigeeKm)} × ${km(shape.apogeeKm)} km`;
}