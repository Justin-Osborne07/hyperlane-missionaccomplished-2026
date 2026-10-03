// =============================================================================
// mock-data.js
// -----------------------------------------------------------------------------
// Fake data so everyone can build without waiting on each other.
// Every object here matches the team's DATA CONTRACT (see the roles PDF).
// Yosry's and Justin's real functions should return these exact same shapes,
// so swapping mock -> real is a one-line change in main.js.
// =============================================================================

const EARTH_R_KM = 6371;                       // Earth's radius in km
const toRad = (d) => (d * Math.PI) / 180;      // degrees -> radians
const toDeg = (r) => (r * 180) / Math.PI;      // radians -> degrees

// -----------------------------------------------------------------------------
// LAUNCH (Yosry's shape)
// A fake Starlink launch from Cape Canaveral, 3 hours from whenever the page loads.
// -----------------------------------------------------------------------------
export const mockLaunch = {
  id: 'mock-1',
  name: 'Starlink Group 99 (mock)',
  rocket: 'Falcon 9',
  windowStart: new Date(Date.now() + 3 * 3600e3).toISOString(), // now + 3 hours
  windowEnd: new Date(Date.now() + 4 * 3600e3).toISOString(),   // now + 4 hours
  pad: { name: 'SLC-40, Cape Canaveral', lat: 28.5618, lon: -80.5772 },
  orbit: 'LEO',
  inclination: 45.1, // degrees; LEO value from the challenge brief
};

// -----------------------------------------------------------------------------
// TRAJECTORY (Yosry's shape): [{ t, lat, lon, altKm }, ...]
// TEMPORARY stand-in for Yosry's getTrajectory(launch).
// -----------------------------------------------------------------------------
export function makeMockTrajectory(launch, steps = 80) {
  const phi = toRad(launch.pad.lat);    // pad latitude in radians
  const lambda = toRad(launch.pad.lon); // pad longitude in radians

  // Launch direction (azimuth) needed to reach the target inclination:
  //   sin(azimuth) = cos(inclination) / cos(latitude)
  // Math.max/min clamps the value to [-1, 1] so asin never breaks.
  const ratio = Math.max(-1, Math.min(1, Math.cos(toRad(launch.inclination)) / Math.cos(phi)));
  const az = Math.asin(ratio); // about 54 degrees (north-east) for this mock launch

  const totalKm = 1800; // how far downrange the path goes
  const totalAlt = 200; // final altitude in km
  const totalT = 540;   // seconds from liftoff to orbit (9 minutes)

  const points = [];
  for (let k = 0; k < steps; k++) {
    const f = k / (steps - 1); // progress from 0 (liftoff) to 1 (orbit)

    // Distance travelled so far, as an angle on the sphere. Raising f to the
    // power 1.6 makes the rocket move slowly at first and speed up, like a real launch.
    const delta = (totalKm * Math.pow(f, 1.6)) / EARTH_R_KM;

    // "Destination point" formula: where you end up after travelling
    // distance delta from the pad in direction az.
    const lat2 = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(az));
    const lon2 = lambda + Math.atan2(
      Math.sin(az) * Math.sin(delta) * Math.cos(phi),
      Math.cos(delta) - Math.sin(phi) * Math.sin(lat2)
    );

    points.push({
      t: f * totalT,                                  // seconds after liftoff
      lat: toDeg(lat2),
      lon: toDeg(lon2),
      altKm: totalAlt * (1 - Math.pow(1 - f, 2.5)),   // climbs steeply early, levels off near orbit
    });
  }
  return points;
}

export const mockTrajectory = makeMockTrajectory(mockLaunch);

// -----------------------------------------------------------------------------
// WEATHER (Justin's shape)
// -----------------------------------------------------------------------------
export const mockWeather = {
  rating: 'green',                       // 'green' | 'yellow' | 'red'
  reasons: ['Light winds', 'Clear skies'],
  windKt: 8,     // wind speed, knots
  gustKt: 12,    // gust speed, knots
  cloudPct: 15,  // cloud cover, percent
  precipMm: 0,   // rain, mm per hour
  cape: 50,      // thunderstorm energy, J/kg (higher = stormier)
};

// -----------------------------------------------------------------------------
// VIEWING ZONES (Justin's shape): [{ lat, lon, radiusKm, quality }, ...]
// TEMPORARY stand-in for Justin's getViewingZones(trajectory).
// Picks 4 points along the path and uses the horizon-distance formula
//   d = sqrt(2 * R * h)
// to find how far away the rocket is visible at each one.
// -----------------------------------------------------------------------------
export const mockZones = [10, 25, 45, 79].map((i) => {
  const p = mockTrajectory[i];
  return {
    lat: p.lat,
    lon: p.lon,
    radiusKm: Math.sqrt(2 * EARTH_R_KM * p.altKm),
    quality: 1 - i / 100, // earlier in the flight = closer to the pad = better view
  };
});