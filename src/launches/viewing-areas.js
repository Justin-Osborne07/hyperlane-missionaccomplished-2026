// =============================================================================
// viewing-areas.js  (Colby)
// -----------------------------------------------------------------------------
// Works out WHERE on the ground you could see the launch, and HOW WELL.
//
// Instead of drawing one circle per trajectory point (which overlapped into a
// confusing white blob), this produces three clean, nested zones:
//
//   liftoff:  close enough to watch the rocket leave the pad
//   high:     the rocket climbs high in your sky (20° or more above the horizon)
//   low:      you'd see it low on the horizon (3° or more), on a clear day
//
// How it works: for any spot on the ground, we check every point of the
// flight path and find the HIGHEST angle above the horizon the rocket ever
// reaches from that spot. That one number decides which zone the spot is in.
//
// This builds on the same idea as Justin's visibility.js (the horizon distance
// for a rocket at a given height), but measures how high in the sky the
// rocket appears instead of just whether it's above the horizon.
//
// These are geometric estimates. Real visibility also depends on clouds,
// haze, daylight, and hills or buildings in the way.
// =============================================================================


const EARTH_R_KM = 6371;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;


// =============================================================================
// THE THREE ZONES
// -----------------------------------------------------------------------------
// Listed from biggest to smallest so the smaller ones are drawn on top.
// =============================================================================

export const VIEW_TIERS = [
  {
    id: 'low',
    label: 'Low on the horizon',
    description: 'Visible as a moving light near the horizon on a clear day.',
    minElevation: 3,
  },
  {
    id: 'high',
    label: 'High in the sky',
    description: 'The rocket climbs well above the horizon. A great view.',
    minElevation: 20,
  },
  {
    id: 'liftoff',
    label: 'See liftoff',
    description: 'Close enough to watch the rocket leave the pad.',
    maxDistanceKm: 40,
  },
];


// =============================================================================
// GEOMETRY HELPERS
// =============================================================================

// The angle (in radians, measured from the Earth's centre) between two spots.
// Multiply by the Earth's radius to get the distance along the ground.
// This is the "haversine" formula.
function centralAngle(lat1, lon1, lat2, lon2) {

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}


// Distance along the ground between two spots, in km
export function distanceKm(lat1, lon1, lat2, lon2) {
  return EARTH_R_KM * centralAngle(lat1, lon1, lat2, lon2);
}


// The spot you reach by travelling distanceKm from (lat, lon) in a compass
// direction (bearing in radians, 0 = north, clockwise).
// Returns [longitude, latitude] because that's the order map shapes use.
function destination(lat, lon, bearing, distanceKmValue) {

  const phi = toRad(lat);
  const lambda = toRad(lon);
  const delta = distanceKmValue / EARTH_R_KM;

  const lat2 = Math.asin(
    Math.sin(phi) * Math.cos(delta) +
    Math.cos(phi) * Math.sin(delta) * Math.cos(bearing)
  );

  const lon2 = lambda + Math.atan2(
    Math.sin(bearing) * Math.sin(delta) * Math.cos(phi),
    Math.cos(delta) - Math.sin(phi) * Math.sin(lat2)
  );

  return [toDeg(lon2), toDeg(lat2)];
}


// =============================================================================
// maxElevation(lat, lon, trajectory)
// -----------------------------------------------------------------------------
// Standing at (lat, lon), how high above the horizon does the rocket ever get?
// Returns degrees: 90 = straight overhead, 0 = right on the horizon,
// negative = hidden below the horizon the whole time.
//
// For a rocket at height h, at ground angle θ away from you:
//
//     elevation = atan2( cos θ − R / (R + h),  sin θ )
//
// (This accounts for the Earth curving away beneath it.)
// =============================================================================

export function maxElevation(lat, lon, trajectory) {

  let best = -90;

  for (const p of trajectory) {

    const theta = centralAngle(lat, lon, p.lat, p.lon);
    const ratio = EARTH_R_KM / (EARTH_R_KM + p.altKm);

    const elevation = toDeg(Math.atan2(Math.cos(theta) - ratio, Math.sin(theta)));

    if (elevation > best) {
      best = elevation;
    }
  }

  return best;
}


// Describe the view from a spot in plain words (used for the viewing spot list)
export function viewQuality(lat, lon, trajectory, pad) {

  if (distanceKm(lat, lon, pad.lat, pad.lon) <= VIEW_TIERS[2].maxDistanceKm) {
    return 'See liftoff';
  }

  const elevation = maxElevation(lat, lon, trajectory);

  if (elevation >= VIEW_TIERS[1].minElevation) return 'High in the sky';
  if (elevation >= VIEW_TIERS[0].minElevation) return 'Low on the horizon';

  return 'Probably not visible';
}


// =============================================================================
// getViewingAreas(trajectory, pad)
// -----------------------------------------------------------------------------
// Returns the outline of each zone as a list of [lon, lat] points:
//
//   [{ id, label, ring: [[lon, lat], ...] }, ...]
//
// How the outlines are found: from the launch pad, we look out in 120
// directions (every 3°). Along each direction we step outwards 20 km at a
// time, checking the view at every step, and remember the farthest step that
// still counts for each zone. Joining those farthest points all the way
// round gives the zone's outline.
// =============================================================================

export function getViewingAreas(trajectory, pad) {

  const DIRECTIONS = 120;     // how many directions to look in
  const STEP_KM = 20;         // how far apart the checks are along each direction
  const MAX_KM = 3600;        // stop looking after this far

  // Checking every trajectory point is slow; every 2nd point is plenty
  const path = trajectory.filter((_, i) => i % 2 === 0);

  const [lowTier, highTier, liftoffTier] = VIEW_TIERS;

  const rings = { low: [], high: [], liftoff: [] };

  for (let k = 0; k <= DIRECTIONS; k++) {

    // Compass direction for this ray (the last one repeats the first to close the loop)
    const bearing = (2 * Math.PI * (k % DIRECTIONS)) / DIRECTIONS;

    // The farthest distance along this ray that still counts for each zone
    let farthestLow = 0;
    let farthestHigh = 0;

    for (let d = STEP_KM; d <= MAX_KM; d += STEP_KM) {

      const [lon, lat] = destination(pad.lat, pad.lon, bearing, d);
      const elevation = maxElevation(lat, lon, path);

      if (elevation >= lowTier.minElevation) farthestLow = d;
      if (elevation >= highTier.minElevation) farthestHigh = d;
    }

    rings.low.push(destination(pad.lat, pad.lon, bearing, farthestLow));
    rings.high.push(destination(pad.lat, pad.lon, bearing, farthestHigh));
    rings.liftoff.push(destination(pad.lat, pad.lon, bearing, liftoffTier.maxDistanceKm));
  }

  return VIEW_TIERS.map((tier) => ({
    id: tier.id,
    label: tier.label,
    ring: rings[tier.id],
  }));
}