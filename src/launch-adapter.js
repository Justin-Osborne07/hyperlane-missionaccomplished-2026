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
//   2. FILLING IN WHAT THE DASHBOARD NEEDS. The API gives an orbit type like
//      "PO" (polar) but not the exact inclination, which the flight path
//      needs. We turn the orbit type into an inclination using the values
//      from the challenge brief.
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

// The name the results are saved under in the browser
const CACHE_KEY = 'launch-watcher-upcoming';

// A real pad counts as "at" one of Justin's sites if it's within this distance
const SAME_SITE_KM = 60;


// =============================================================================
// ORBIT TYPE -> INCLINATION
// -----------------------------------------------------------------------------
// The challenge brief's three orbit types:
//   LEO   ~45.1°
//   Polar  87.9–90°
//   SSO   ~98.1°
//
// Any other orbit (e.g. GTO, the route to geostationary orbit) is launched
// due east, the most fuel-efficient direction. That gives an inclination
// equal to the launch site's latitude.
// =============================================================================

function orbitDetails(abbrev, orbitName, padLat) {

  const dueEast = Math.abs(padLat);

  if (abbrev === 'LEO') {
    // A rocket can't reach an inclination lower than its launch site's latitude
    return { key: 'LEO', label: orbitName, inclination: Math.max(45.1, dueEast) };
  }

  if (abbrev === 'PO') {
    return { key: 'Polar', label: orbitName, inclination: 90 };
  }

  if (abbrev === 'SSO') {
    return { key: 'SSO', label: orbitName, inclination: 98.1 };
  }

  // Everything else: due east
  return { key: abbrev, label: orbitName, inclination: Math.round(dueEast * 10) / 10 };
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

  const orbit = orbitDetails(raw.orbitAbbrev, raw.orbitName, lat);

  return {
    id: raw.id,

    // "Falcon 9 Block 5 | Starlink Group 15-25" -> just the mission name
    name: raw.mission,

    rocket: raw.rocket,
    windowStart: raw.windowStart,
    windowEnd: raw.windowEnd,

    pad: {
      // Justin's site id if it matched, otherwise a made-up one
      id: site ? site.id : `api-${raw.id}`,

      // e.g. "Space Launch Complex 40, Cape Canaveral SFS, FL, USA"
      name: raw.location ? `${raw.pad.name}, ${raw.location}` : raw.pad.name,

      lat: lat,
      lon: lon,
    },

    orbit: orbit.key,
    orbitLabel: orbit.label,
    inclination: orbit.inclination,

    status: raw.status,

    // Marks this as real data (not a demo launch)
    live: true,
  };
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