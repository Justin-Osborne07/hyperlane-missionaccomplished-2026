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
export const mockLaunch = {
  id: "test-launch",
  name: "MA test",
  windowStart: "2026-10-05T18:00:00Z",
  windowEnd: "2026-10-05T18:15:00Z",
  rocket: i.rocket?.configuration?.full_name,
  pad: {
    name: "Test Luanch Pad",
    lat: 28,
    lon: -80,
  },
  orbit: "LEO",
  inclination: 45.1,
};
export const mockTrajectory = [
  { t: 0, lat: 28.5619, lon: -80.5774, altKm: 0 },
  { t: 20, lat: 28.7, lon: -80.3, altKm: 20 },
  { t: 40, lat: 28.9, lon: -80.0, altKm: 55 },
  { t: 60, lat: 29.2, lon: -79.6, altKm: 100 },
  { t: 90, lat: 29.7, lon: -79.0, altKm: 150 },
  { t: 120, lat: 30.3, lon: -78.3, altKm: 200 }
];
