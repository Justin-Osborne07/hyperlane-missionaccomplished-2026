// =============================================================================
// mock-data.js
// -----------------------------------------------------------------------------
// Fake data so everyone can build without waiting on each other.
//
// Every object here matches the team's DATA CONTRACT (see the roles PDF).
// Yosry's and Justin's real functions should return these exact same shapes,
// so swapping mock -> real is a one-line change in main.js.
// =============================================================================


// Earth's radius in km
const EARTH_R_KM = 6371;

// Convert degrees <-> radians
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;


// =============================================================================
// LAUNCH  (Yosry's shape)
// -----------------------------------------------------------------------------
// A fake Starlink launch from Cape Canaveral,
// 3 hours from whenever the page loads.
// =============================================================================

const ONE_HOUR_MS = 3600 * 1000;

export const mockLaunch = {

  id: 'mock-1',
  name: 'Starlink Group 99 (mock)',
  rocket: 'Falcon 9',

  // window opens in 3 hours and closes in 4 hours
  windowStart: new Date(Date.now() + 3 * ONE_HOUR_MS).toISOString(),
  windowEnd: new Date(Date.now() + 4 * ONE_HOUR_MS).toISOString(),

  pad: {
    name: 'SLC-40, Cape Canaveral',
    lat: 28.5618,
    lon: -80.5772,
  },

  orbit: 'LEO',

  // degrees; the LEO value from the challenge brief
  inclination: 45.1,
};


// =============================================================================
// TRAJECTORY  (Yosry's shape)  ->  [{ t, lat, lon, altKm }, ...]
// -----------------------------------------------------------------------------
// TEMPORARY stand-in for Yosry's getTrajectory(launch).
// =============================================================================

export function makeMockTrajectory(launch, steps = 80) {

  // Pad position in radians
  const phi = toRad(launch.pad.lat);
  const lambda = toRad(launch.pad.lon);


  // Launch direction (azimuth) needed to reach the target inclination:
  //
  //     sin(azimuth) = cos(inclination) / cos(latitude)
  //
  // Math.max / Math.min clamp the value to [-1, 1] so asin never breaks.
  const rawRatio = Math.cos(toRad(launch.inclination)) / Math.cos(phi);
  const ratio = Math.max(-1, Math.min(1, rawRatio));

  // About 54 degrees (north-east) for this mock launch
  const az = Math.asin(ratio);


  // How far downrange the path goes, in km
  const totalKm = 1800;

  // Final altitude, in km
  const totalAlt = 200;

  // Seconds from liftoff to orbit (9 minutes)
  const totalT = 540;


  const points = [];

  for (let k = 0; k < steps; k++) {

    // Progress from 0 (liftoff) to 1 (orbit)
    const f = k / (steps - 1);


    // Distance travelled so far, as an angle on the sphere.
    // Raising f to the power 1.6 makes the rocket move slowly at first
    // and speed up, like a real launch.
    const delta = (totalKm * Math.pow(f, 1.6)) / EARTH_R_KM;


    // "Destination point" formula: where you end up after travelling
    // distance delta from the pad in direction az
    const lat2 = Math.asin(
      Math.sin(phi) * Math.cos(delta) +
      Math.cos(phi) * Math.sin(delta) * Math.cos(az)
    );

    const lon2 = lambda + Math.atan2(
      Math.sin(az) * Math.sin(delta) * Math.cos(phi),
      Math.cos(delta) - Math.sin(phi) * Math.sin(lat2)
    );


    // Altitude climbs steeply early, then levels off near orbit
    const altKm = totalAlt * (1 - Math.pow(1 - f, 2.5));


    points.push({
      t: f * totalT,   // seconds after liftoff
      lat: toDeg(lat2),
      lon: toDeg(lon2),
      altKm: altKm,
    });
  }

  return points;
}


export const mockTrajectory = makeMockTrajectory(mockLaunch);


// =============================================================================
// WEATHER  (Justin's shape)
// =============================================================================

export const mockWeather = {

  // 'green' | 'yellow' | 'red'
  rating: 'green',

  reasons: ['Light winds', 'Clear skies'],

  // wind and gust speed, in knots
  windKt: 8,
  gustKt: 12,

  // cloud cover, percent
  cloudPct: 15,

  // rain, mm per hour
  precipMm: 0,

  // thunderstorm energy, J/kg (higher = stormier)
  cape: 50,
};


// =============================================================================
// VIEWING ZONES  (Justin's shape)  ->  [{ lat, lon, radiusKm, quality }, ...]
// -----------------------------------------------------------------------------
// TEMPORARY stand-in for Justin's getViewingZones(trajectory).
//
// Picks 4 points along the path and uses the horizon-distance formula
//
//     d = sqrt(2 * R * h)
//
// to find how far away the rocket is visible at each one.
// =============================================================================

// Which trajectory points to put circles under
const ZONE_POINTS = [10, 25, 45, 79];

export const mockZones = ZONE_POINTS.map((i) => {

  const p = mockTrajectory[i];

  return {
    lat: p.lat,
    lon: p.lon,

    radiusKm: Math.sqrt(2 * EARTH_R_KM * p.altKm),

    // earlier in the flight = closer to the pad = better view
    quality: 1 - i / 100,
  };
});