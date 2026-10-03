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
//   2. FILLING IN WHAT THE DASHBOARD NEEDS. Yosry's launch-api.js already
//      turns the orbit name into an inclination (Polar 90°, SSO 98.1°,
//      LEO 45.1°). For any other orbit (e.g. GTO) it gives none, so we use
//      "due east" (see orbitDetails below).
//
//   3. MATCHING LAUNCH SITES. If a real launch is from one of Justin's launch
//      sites (e.g. a pad at Cape Canaveral), we tag it with that site's id so
//      the viewing spots for that site show up.
// =============================================================================


import { fetchUpcomingLaunches } from './launch-api.js';
import { launchPads } from './launch-pads.js';
import { distanceKm } from './viewing-areas.js';


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
// ORBIT DETAILS
// -----------------------------------------------------------------------------
// Yosry's launch-api.js gives each launch:
//   orbit:        the orbit's name, e.g. "Polar Orbit"
//   inclination:  90 / 98.1 / 45.1 for Polar / SSO / LEO, or null for others
//
// We add:
//   key:  the short code the demo pickers use ('LEO' | 'Polar' | 'SSO')
//   a fallback inclination for other orbits (e.g. GTO): launched due east,
//   the most fuel-efficient direction, which gives an inclination equal to
//   the launch site's latitude.
//
// Also: a rocket can't reach an inclination LOWER than its launch site's
// latitude (e.g. 45.1° from a site at 45.3°N). In that case we use the
// site's latitude, the closest it can get.
// =============================================================================

const ORBIT_KEYS = {
  'Low Earth Orbit': 'LEO',
  'Polar Orbit': 'Polar',
  'Sun-Synchronous Orbit': 'SSO',
};

function orbitDetails(orbitName, inclination, padLat) {

  // Rounded UP to 0.1°, so it never ends up a hair below the latitude
  const dueEast = Math.ceil(Math.abs(padLat) * 10) / 10;

  return {
    key: ORBIT_KEYS[orbitName] || orbitName || 'Unknown',
    label: orbitName || 'Unknown orbit',
    inclination: inclination == null ? dueEast : Math.max(inclination, dueEast),
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

  const orbit = orbitDetails(raw.orbit, raw.inclination, lat);

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