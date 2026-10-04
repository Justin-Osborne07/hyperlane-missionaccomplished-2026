// =============================================================================
// launch-adapter.js  (Colby)
// -----------------------------------------------------------------------------
// Connects Yosry's real launch data (launch-api.js) to the dashboard.
//
// It does three jobs:
//
//   1. CACHING. The free Launch Library API only allows 15 requests an hour.
//      Every page refresh would use one up, so we save the results in the
//      browser for 15 minutes and reuse them.
//
//   2. ESTIMATING EACH ORBIT. The API gives the orbit's type but not its
//      exact tilt or height, so we estimate both from the mission (see
//      estimateOrbit below), e.g. space station flights at 51.6°, 420 km.
//
//   3. MATCHING LAUNCH SITES. If a real launch is from one of Justin's launch
//      sites (e.g. a pad at Cape Canaveral), we tag it with that site's id so
//      the viewing spots for that site show up.
// =============================================================================


import { fetchUpcomingLaunches } from './launch-api.js';
import { launchPads } from './launch-pads.js';
import { distanceKm } from './viewing-areas.js';
import { HEIGHTS, GTO, circular, sunSyncInclination } from './orbits.js';


// How long saved results stay fresh: 15 minutes, in milliseconds
const CACHE_MS = 15 * 60 * 1000;

// The name the results are saved under in the browser.
// (The version number goes up whenever what's saved changes, e.g. Yosry's
// fields changing, or fetching 100 launches instead of 5. That makes sure
// results saved by an older version are ignored.)
const CACHE_KEY = 'launch-watcher-upcoming-v3';

// A real pad counts as "at" one of Justin's sites if it's within this distance
const SAME_SITE_KM = 60;


// =============================================================================
// ESTIMATING EACH LAUNCH'S ORBIT
// -----------------------------------------------------------------------------
// The API says which TYPE of orbit a launch goes to (e.g. "Low Earth Orbit"),
// but not its exact tilt (inclination) or height. Real launches of the same
// type vary a lot, so we estimate from what we know about the mission:
//
//   Space station flights (Dragon, Cygnus, Soyuz...)  51.6°, ~420 km
//   Starlink from Florida                              43°,   ~550 km
//   Starlink from California                           53°,   ~550 km
//   Amazon Kuiper                                      51.9°, ~630 km
//   OneWeb                                             87.9°, ~1,200 km
//   Sun-synchronous                                    ~97.8° (worked out
//                                                      from the height), ~600 km
//   Polar                                              90°,   ~800 km
//   Geostationary transfer (GTO)                       launch site's latitude,
//                                                      200 × 35,786 km ellipse
//   Medium Earth orbit (GPS, Galileo)                  55°,   ~20,200 km
//   Other Low Earth Orbit                              45.1° (challenge brief), ~400 km
//   Unknown                                            due east, ~400 km
//
// Also: a rocket can't reach an inclination LOWER than its launch site's
// latitude, so every estimate is at least that.
// These are estimates; the dashboard labels them "est.".
// =============================================================================

// The short codes the demo pickers use
const ORBIT_KEYS = {
  'Low Earth Orbit': 'LEO',
  'Polar Orbit': 'Polar',
  'Sun-Synchronous Orbit': 'SSO',
  'Geostationary Transfer Orbit': 'GTO',
};

const STATION_MISSION = /\b(iss|crs|crew-|cygnus|ng-\d|soyuz ms|progress ms|axiom|ax-\d|starliner|htv|dream chaser)/i;

function estimateOrbit(raw, padLat, padLon) {

  const name = `${raw.name || ''} ${raw.rocket || ''}`;
  const orbit = (raw.orbit || '').toLowerCase();

  // Due east from the launch site: the lowest tilt it can reach.
  // Rounded UP to 0.1°, so it never ends up a hair below the latitude.
  const dueEast = Math.ceil(Math.abs(padLat) * 10) / 10;

  // Rough "is it in Florida / California" checks for Starlink
  const fromFlorida = padLon > -82 && padLon < -79 && padLat > 27 && padLat < 30;

  let key = ORBIT_KEYS[raw.orbit] || raw.orbit || 'Unknown';
  let inclination;
  let shape;

  if (STATION_MISSION.test(name)) {
    inclination = 51.6;
    shape = circular(HEIGHTS.station);
    key = 'LEO';
  } else if (/starlink/i.test(name)) {
    inclination = fromFlorida ? 43 : 53;
    shape = circular(HEIGHTS.starlink);
    key = 'LEO';
  } else if (/kuiper/i.test(name)) {
    inclination = 51.9;
    shape = circular(630);
    key = 'LEO';
  } else if (/oneweb/i.test(name)) {
    inclination = 87.9;
    shape = circular(1200);
    key = 'Polar';
  } else if (orbit.includes('sun-synchronous')) {
    shape = circular(HEIGHTS.sso);
    inclination = sunSyncInclination(HEIGHTS.sso);
    key = 'SSO';
  } else if (orbit.includes('polar')) {
    inclination = 90;
    shape = circular(HEIGHTS.polar);
    key = 'Polar';
  } else if (orbit.includes('geostationary') || orbit.includes('geosynchronous') || orbit.includes('transfer')) {
    inclination = dueEast;
    shape = GTO;
    key = 'GTO';
  } else if (orbit.includes('medium')) {
    inclination = 55;
    shape = circular(HEIGHTS.meo);
    key = 'MEO';
  } else if (orbit.includes('low earth')) {
    inclination = 45.1;
    shape = circular(400);
    key = 'LEO';
  } else {
    inclination = dueEast;
    shape = circular(400);
  }

  return {
    key,
    label: raw.orbit || 'Unknown orbit',
    inclination: Math.round(Math.max(inclination, dueEast) * 10) / 10,
    shape,
  };
}


// "Falcon 9 Block 5 | Starlink Group 15-25" -> "Starlink Group 15-25"
function missionName(fullName = '') {
  const parts = fullName.split(' | ');
  return parts[parts.length - 1];
}


// =============================================================================
// toDashboardLaunch(raw)
// Turns one launch from Yosry's fetchUpcomingLaunches() into the shape the
// rest of the dashboard uses (the team's data contract), plus a few extras.
// =============================================================================

function toDashboardLaunch(raw) {

  const lat = Number(raw.pad.lat);
  const lon = Number(raw.pad.lon);

  // Is this pad at one of Justin's launch sites?
  const site = launchPads.find(
    (p) => distanceKm(p.lat, p.lon, lat, lon) <= SAME_SITE_KM
  );

  const orbit = estimateOrbit(raw, lat, lon);

  return {
    id: raw.id,
    name: missionName(raw.name),
    rocket: raw.rocket || 'Unknown rocket',
    windowStart: raw.windowStart,
    windowEnd: raw.windowEnd,

    pad: {
      // Justin's site id if it matched, otherwise a made-up one
      id: site ? site.id : `api-${raw.id}`,

      // e.g. "Space Launch Complex 40, near Cape Canaveral / Kennedy, Florida"
      name: site ? `${raw.pad.name}, ${shortSiteName(site.name)}` : (raw.pad.name || 'Unknown pad'),

      lat: lat,
      lon: lon,
    },

    orbit: orbit.key,
    orbitLabel: orbit.label,
    inclination: orbit.inclination,

    // the orbit's height: { perigeeKm, apogeeKm } (see orbits.js)
    orbitShape: orbit.shape,

    // inclination and height are estimates for real launches (shown as "est.")
    estimated: true,

    // Marks this as real data (not a demo launch)
    live: true,
  };
}


// "Canso — Spaceport Nova Scotia, NS" -> "Canso"
function shortSiteName(name) {
  return name.split(/\s+—\s+|,/)[0].trim();
}


// =============================================================================
// Saving / loading the cache (browser storage).
// Wrapped in try/catch because storage can be switched off or full.
// =============================================================================

function readCache() {

  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY));

    if (saved && Array.isArray(saved.launches)) {
      return saved; // { savedAt, launches }
    }
  } catch (err) {
    // ignore: we'll just fetch fresh data
  }

  return null;
}


function writeCache(launches) {

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), launches }));
  } catch (err) {
    // ignore: caching is a bonus, not required
  }
}


// =============================================================================
// loadUpcomingLaunches()
// -----------------------------------------------------------------------------
// The one function main.js calls. Returns a list of launches ready for the
// dashboard, soonest first.
//
//   - Fresh saved results (under 15 minutes old)  -> use them, no request
//   - Otherwise ask the API (Yosry's function) and save the results
//   - If the API fails, fall back to older saved results if there are any
//   - If there's nothing at all, throw an error (main.js then shows demo launches)
// =============================================================================

export async function loadUpcomingLaunches() {

  const cached = readCache();

  let rawLaunches;

  if (cached && Date.now() - cached.savedAt < CACHE_MS) {

    rawLaunches = cached.launches;

  } else {

    try {
      rawLaunches = await fetchUpcomingLaunches();
      writeCache(rawLaunches);

    } catch (err) {

      if (cached) {
        console.warn('Launch API failed, using older saved launches:', err);
        rawLaunches = cached.launches;
      } else {
        throw err;
      }
    }
  }

  return rawLaunches

    // Skip any launch without proper coordinates
    .filter((raw) => Number.isFinite(Number(raw.pad?.lat)) && Number.isFinite(Number(raw.pad?.lon)))

    // Skip launches whose window has already closed
    .filter((raw) => new Date(raw.windowEnd).getTime() > Date.now())

    .map(toDashboardLaunch);
}