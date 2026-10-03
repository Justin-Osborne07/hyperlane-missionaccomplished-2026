// Mock data matching the team's data contract.
// Yosry and Justin will replace these with real functions that return the SAME shapes.

const EARTH_R_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export const mockLaunch = {
  id: 'mock-1',
  name: 'Starlink Group 99 (mock)',
  rocket: 'Falcon 9',
  windowStart: new Date(Date.now() + 3 * 3600e3).toISOString(),
  windowEnd: new Date(Date.now() + 4 * 3600e3).toISOString(),
  pad: { name: 'SLC-40, Cape Canaveral', lat: 28.5618, lon: -80.5772 },
  orbit: 'LEO',
  inclination: 45.1,
};

// TEMPORARY stand-in for Yosry's getTrajectory(launch).
// Returns [{ t, lat, lon, altKm }] along the launch azimuth.
export function makeMockTrajectory(launch, steps = 80) {
  const phi = toRad(launch.pad.lat);
  const lambda = toRad(launch.pad.lon);
  const ratio = Math.max(-1, Math.min(1, Math.cos(toRad(launch.inclination)) / Math.cos(phi)));
  const az = Math.asin(ratio); // sin(Az) = cos(i) / cos(lat)

  const totalKm = 1800;   // downrange distance
  const totalAlt = 200;   // km
  const totalT = 540;     // seconds to injection

  const points = [];
  for (let k = 0; k < steps; k++) {
    const f = k / (steps - 1);
    const delta = (totalKm * Math.pow(f, 1.6)) / EARTH_R_KM; // slow start, then accelerates downrange
    const lat2 = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(az));
    const lon2 = lambda + Math.atan2(
      Math.sin(az) * Math.sin(delta) * Math.cos(phi),
      Math.cos(delta) - Math.sin(phi) * Math.sin(lat2)
    );
    points.push({
      t: f * totalT,
      lat: toDeg(lat2),
      lon: toDeg(lon2),
      altKm: totalAlt * (1 - Math.pow(1 - f, 2.5)), // climbs steeply early
    });
  }
  return points;
}

export const mockTrajectory = makeMockTrajectory(mockLaunch);

export const mockWeather = {
  rating: 'green',
  reasons: ['Light winds', 'Clear skies'],
  windKt: 8, gustKt: 12, cloudPct: 15, precipMm: 0, cape: 50,
};

// TEMPORARY stand-in for Justin's getViewingZones(trajectory).
export const mockZones = [10, 25, 45, 79].map((i) => {
  const p = mockTrajectory[i];
  return {
    lat: p.lat,
    lon: p.lon,
    radiusKm: Math.sqrt(2 * EARTH_R_KM * p.altKm), // horizon distance
    quality: 1 - i / 100,
  };
});
