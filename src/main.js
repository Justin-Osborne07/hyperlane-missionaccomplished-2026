// =============================================================================
// main.js  (Colby)
// -----------------------------------------------------------------------------
// The "glue" file. It runs when the page loads and connects everything:
//
//   1. Data and settings
//   2. The ascent timeline (bottom of the screen)
//   3. The globe
//   4. Upcoming launches list + demo pickers (side panel)
//   5. selectLaunch(): switches the whole page to a new launch
//   6. Buttons and developer tools
//
// The page has two modes:
//   - live: a real upcoming launch from Yosry's launch-api.js
//   - demo: a made-up launch from the site / orbit / rocket pickers
//
// Whose code is used where:
//   - Yosry:  real upcoming launches (launch-api.js, connected through
//             launch-adapter.js). His trajectory.js and countdown.js are still
//             empty, so the mock flight path and placeholder countdown are used
//             for now. Look for "PLUG-IN POINT (Yosry)".
//   - Justin: launch sites, live weather, weather scoring
//   - Colby:  globe, rockets, viewing areas + viewing spots (built on the same
//             horizon idea as Justin's visibility.js)
// =============================================================================


import './style.css';

import { createGlobe } from './globe.js';
import { ROCKETS, rocketFor, findRocket } from './rockets.js';
import { startCountdown } from './placeholders/countdown.js';
import { renderWeather } from './placeholders/weather-card.js';

// Justin's code
import { launchPads } from './launch-pads.js';
import { getWeather } from './weather.js';
import { mockWeather as testWeather } from './mock-weather.js';

// Where to watch
import { getViewingAreas, viewQuality, distanceKm } from './viewing-areas.js';
import { viewingSpots, siteNotes } from './viewing-spots.js';

// Yosry's real launches (through the adapter, which adds caching)
import { loadUpcomingLaunches } from './launch-adapter.js';

// Still mock: demo launches, and the flight path until Yosry's trajectory.js is ready
import {
  ORBITS,
  buildDemoLaunch,
  makeMockTrajectory,
} from './mock-data.js';


// =============================================================================
// 1. DATA AND SETTINGS
// =============================================================================

// Key moments in the ascent (Liftoff, Max Q, separation, orbit) become the
// dots on the timeline. Each rocket has its own timings in rockets.js, so this
// list is swapped whenever the rocket changes (see selectLaunch).
let EVENTS = ROCKETS[0].events;


// What's currently selected.
const state = {

  // 'live' = a real launch from the list, 'demo' = from the pickers
  mode: 'demo',

  // real upcoming launches, and which one is selected
  liveLaunches: [],
  liveIndex: 0,

  // demo pickers. Canso is first in Justin's list, so it's the default.
  pad: launchPads[0],
  orbit: 'LEO',
  rocket: ROCKETS[0],   // Falcon 9

  // filled in by selectLaunch()
  launch: null,
  trajectory: [],
  weather: null,
  areas: [],

  // whether the viewing areas are switched on
  zonesOn: false,
};


// Function that stops the running countdown (startCountdown returns one)
let stopCountdown = null;

// Counts weather requests, so a slow old request can't overwrite a newer one
// (e.g. if someone clicks Canso, then quickly clicks Cape)
let weatherRequestId = 0;


// =============================================================================
// SMALL HELPERS
// =============================================================================

// Shortcut: $('phase') instead of document.getElementById('phase')
const $ = (id) => document.getElementById(id);


// Format seconds as mission elapsed time, e.g. 75 -> "T+01:15"
function fmtMET(seconds) {

  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(Math.floor(seconds % 60)).padStart(2, '0');

  return `T+${minutes}:${secs}`;
}


// Shorten a site name for buttons: "Canso — Spaceport Nova Scotia, NS" -> "Canso"
const shortName = (name) => name.split(/\s+—\s+|,/)[0].trim();


// =============================================================================
// 2. ASCENT TIMELINE (bottom of the screen)
// =============================================================================

// Draw one marker per event, positioned along the track as a percentage of
// the total flight time. Called again whenever the launch changes.
//
// The first marker is left-aligned and the last right-aligned (CSS classes
// "first" / "last") so their labels don't hang off the edges.
let eventEls = [];

function drawTimeline(tMaxFlight) {

  const eventHTML = EVENTS.map((e, i) => {

    let cls = '';

    if (i === 0) {
      cls = 'first';
    } else if (i === EVENTS.length - 1) {
      cls = 'last';
    }

    const leftPercent = Math.min((e.t / tMaxFlight) * 100, 100);

    return `<span class="event ${cls}" style="left:${leftPercent}%">${e.label}</span>`;
  });

  $('track-events').innerHTML = eventHTML.join('');

  // Keep a list of the marker elements so we can light them up later
  eventEls = [...document.querySelectorAll('.event')];
}


// Called by the globe on every animation frame (via onTick) with the rocket's
// current flight time. Updates the orange progress bar, the clock, and which
// event dots are lit up.
function updateFlight(simT, tMax) {

  // Orange progress bar
  $('track-fill').style.width = `${(simT / tMax) * 100}%`;

  // Mission clock, e.g. "T+02:15"
  $('met').textContent = fmtMET(simT);

  // Light up every event we've passed, and remember the latest one
  let current = EVENTS[0];

  EVENTS.forEach((e, i) => {

    const passed = simT >= e.t;

    // "passed" turns the dot orange (see style.css)
    eventEls[i]?.classList.toggle('passed', passed);

    if (passed) {
      current = e;
    }
  });

  // Phase name above the track, e.g. "Max Q"
  $('phase').textContent = current.label;
}


// =============================================================================
// 3. GLOBE
// =============================================================================

// Create the globe inside the #globe div.
//   onTick:      keeps the timeline in sync with the rocket
//   onPadClick:  clicking a site on the globe switches to it
//   onSpotClick: clicking a viewing spot pin zooms in on it
const globe = createGlobe($('globe'), {
  onTick: updateFlight,
  onPadClick: (pad) => {

    // Only Justin's sites switch to a demo launch; clicking the pad of the
    // current real launch does nothing
    if (!launchPads.some((p) => p.id === pad.id)) {
      return;
    }

    state.mode = 'demo';
    state.pad = pad;
    selectLaunch();
  },
  onSpotClick: (spot) => focusSpot(spot),
});

// Show all of Justin's launch sites on the globe
globe.setPads(launchPads);


// Respect the "reduce motion" accessibility setting: don't auto-spin the Earth
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reduceMotion) {
  globe.raw.controls().autoRotate = false;
}


// =============================================================================
// 4. LAUNCH SITE + ORBIT PICKERS (side panel)
// =============================================================================

// One button per launch site. aria-pressed marks the selected one,
// which the CSS uses to highlight it.
function drawSitePicker() {

  const buttons = launchPads.map((pad) => {

    const pressed = state.mode === 'demo' && pad.id === state.pad.id;

    return `
      <button class="choice" data-pad="${pad.id}" aria-pressed="${pressed}">
        ${shortName(pad.name)}
      </button>`;
  });

  $('site-picker').innerHTML = buttons.join('');
}


// One button per orbit type (LEO / Polar / SSO)
function drawOrbitPicker() {

  const buttons = Object.keys(ORBITS).map((key) => {

    const pressed = state.mode === 'demo' && key === state.orbit;

    return `
      <button class="choice" data-orbit="${key}" aria-pressed="${pressed}">
        ${key}
      </button>`;
  });

  $('orbit-picker').innerHTML = buttons.join('');
}


// One button per rocket model (Falcon 9, Falcon Heavy, SLS, Saturn V, Starship)
function drawRocketPicker() {

  const buttons = ROCKETS.map((rocket) => {

    const pressed = state.mode === 'demo' && rocket.id === state.rocket.id;

    return `
      <button class="choice" data-rocket="${rocket.id}" aria-pressed="${pressed}">
        ${rocket.name}
      </button>`;
  });

  $('rocket-picker').innerHTML = buttons.join('');
}


// Clicking a site button. We listen on the whole picker and check which
// button was clicked ("event delegation"), because the buttons get redrawn.
$('site-picker').addEventListener('click', (e) => {

  const button = e.target.closest('[data-pad]');

  if (!button) {
    return;
  }

  state.mode = 'demo';
  state.pad = launchPads.find((p) => p.id === button.dataset.pad);
  selectLaunch();
});


// Clicking an orbit button
$('orbit-picker').addEventListener('click', (e) => {

  const button = e.target.closest('[data-orbit]');

  if (!button) {
    return;
  }

  state.mode = 'demo';
  state.orbit = button.dataset.orbit;
  selectLaunch();
});


// Clicking a rocket button
$('rocket-picker').addEventListener('click', (e) => {

  const button = e.target.closest('[data-rocket]');

  if (!button) {
    return;
  }

  state.mode = 'demo';
  state.rocket = ROCKETS.find((r) => r.id === button.dataset.rocket);
  selectLaunch();
});


// =============================================================================
// 5. selectLaunch()
// -----------------------------------------------------------------------------
// Switches the whole page to the currently selected site + orbit:
// globe, timeline, countdown, mission details, weather, viewing zones.
// =============================================================================

function selectLaunch() {

  // --- Build the launch and its flight path ---

  if (state.mode === 'live') {
    // A real launch from Yosry's data
    state.launch = state.liveLaunches[state.liveIndex];
  } else {
    // A demo launch from the pickers
    state.launch = buildDemoLaunch(state.pad, state.orbit, state.rocket.name);
  }

  // PLUG-IN POINT (Yosry): replace with getTrajectory(state.launch) when his
  // trajectory.js is ready. The mock works for real launches too, because it
  // only needs the pad position and the inclination.
  state.trajectory = makeMockTrajectory(state.launch);

  // The three viewing zones for this flight path (see viewing-areas.js)
  state.areas = getViewingAreas(state.trajectory, state.launch.pad);

  // Weather is unknown until the new forecast loads
  state.weather = null;


  const launch = state.launch;


  // --- Pickers: highlight the selected buttons ---

  drawSitePicker();
  drawOrbitPicker();
  drawRocketPicker();
  drawLaunchList();


  // --- Rocket model ---

  // Find the 3D model from the launch's rocket name. Using the name (not the
  // button) means Yosry's real launches pick the right model automatically.
  const rocket = rocketFor(launch.rocket);

  globe.setRocket(rocket);

  // This rocket's own event timings for the timeline
  EVENTS = rocket.events;


  // --- Timeline ---

  const tMaxFlight = state.trajectory[state.trajectory.length - 1].t;
  drawTimeline(tMaxFlight);


  // --- Globe ---

  globe.showLaunch(launch, state.trajectory, state.weather);

  // Redraw the viewing areas for the new path if they're switched on
  if (state.zonesOn) {
    globe.showViewingAreas(state.areas);
  }

  // Viewing spots for this site: pins on the globe and cards in the panel
  drawSpots();

  // The camera is flying to the new launch, so no need for "Back"
  $('back-to-launch').hidden = true;


  // --- Hero (top-left) ---

  $('hero-label').textContent = launch.live ? 'Upcoming launch' : 'Demo launch';
  $('mission-name').textContent = launch.name;
  $('mission-sub').textContent = `${launch.rocket} from ${launch.pad.name}`;

  // PLUG-IN POINT (Yosry): temporary countdown; swap for his when ready.
  // Stop the old countdown first so two don't run at once.
  if (stopCountdown) {
    stopCountdown();
  }

  stopCountdown = startCountdown(launch, {
    timeEl: $('countdown-time'),
    windowEl: $('window-line'),
  });


  // --- Mission details (side panel) ---

  const missionRows = [
    ['Rocket', launch.rocket],
    ['Launch site', launch.pad.name],
    ['Target orbit', launch.orbitLabel || ORBITS[launch.orbit]?.name || launch.orbit],
    ['Inclination', `${launch.inclination}°`],
  ];

  // Real launches also show their status, e.g. "Go for Launch"
  if (launch.status) {
    missionRows.push(['Status', launch.status]);
  }

  // Be honest when we don't have a 3D model of this rocket
  if (!findRocket(launch.rocket)) {
    missionRows.push(['3D model', 'Falcon 9 (stand-in)']);
  }

  // <dt> = the label, <dd> = the value
  $('mission-details').innerHTML = missionRows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('');


  // --- Weather ---

  // Switching launch always goes back to the live forecast
  $('weather-test').value = 'live';

  loadWeather();
}


// =============================================================================
// UPCOMING LAUNCHES LIST (Yosry's real data)
// -----------------------------------------------------------------------------
// One card per real launch: mission, rocket, place and date. Clicking a card
// switches the page to that launch.
// =============================================================================

// e.g. "Mon, Oct 5, 4:17 AM" in the viewer's own time zone
const fmtLaunchDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});


function drawLaunchList() {

  // Nothing loaded (no internet, or the API is down)
  if (state.liveLaunches.length === 0) {
    $('launch-list').innerHTML =
      "<p class=\"muted\">Couldn't load upcoming launches. Showing demo launches instead.</p>";
    return;
  }

  const cards = state.liveLaunches.map((launch, i) => {

    const pressed = state.mode === 'live' && i === state.liveIndex;

    // Just the place, e.g. "Cape Canaveral SFS, FL, USA" -> "Cape Canaveral SFS"
    const place = launch.pad.name.split(', ')[1] || launch.pad.name;

    return `
      <button class="spot" data-launch="${i}" aria-pressed="${pressed}">

        <div class="spot-top">
          <span class="spot-name">${launch.name}</span>
        </div>

        <div class="spot-meta">${launch.rocket} from ${place}</div>
        <div class="spot-perks">${fmtLaunchDate.format(new Date(launch.windowStart))}</div>

      </button>`;
  });

  $('launch-list').innerHTML = cards.join('');
}


// Clicking a launch card
$('launch-list').addEventListener('click', (e) => {

  const card = e.target.closest('[data-launch]');

  if (!card) {
    return;
  }

  state.mode = 'live';
  state.liveIndex = Number(card.dataset.launch);
  selectLaunch();
});


// =============================================================================
// VIEWING SPOTS
// -----------------------------------------------------------------------------
// Shows the viewing spots for the selected launch site (from viewing-spots.js)
// as pins on the globe and as cards in the side panel. Each card shows the
// price, the distance from the pad, and how good the view would be for THIS
// flight path (worked out by viewQuality in viewing-areas.js).
// =============================================================================

// Turn km into a friendly string with miles too, e.g. "12 km (7 mi)"
function fmtDistance(km) {
  const miles = km * 0.621371;
  return `${Math.round(km)} km (${Math.round(miles)} mi)`;
}


function drawSpots() {

  const pad = state.launch.pad;

  // The spots for this site, or an empty list if we don't know any
  // (for example a real launch from Yosry's data at a different site)
  const spots = viewingSpots[pad.id] || [];

  // Pins on the globe
  globe.showSpots(spots);

  // Special note for some sites (e.g. Vandenberg is a military base)
  $('site-note').textContent = siteNotes[pad.id] || '';
  $('site-note').hidden = !siteNotes[pad.id];

  // Nothing listed for this site
  if (spots.length === 0) {
    $('spot-list').innerHTML = '<p class="muted">No viewing spots listed for this site yet.</p>';
    return;
  }

  // Sort closest first
  const withDistance = spots
    .map((spot) => ({
      spot: spot,
      km: distanceKm(spot.lat, spot.lon, pad.lat, pad.lon),
    }))
    .sort((a, b) => a.km - b.km);

  // One card (a button) per spot
  const cards = withDistance.map(({ spot, km }, i) => {

    const quality = viewQuality(spot.lat, spot.lon, state.trajectory, pad);

    return `
      <button class="spot" data-spot="${i}">

        <div class="spot-top">
          <span class="spot-name">${spot.name}</span>
          <span class="tag cost-${spot.cost.kind}">${spot.cost.label}</span>
        </div>

        <div class="spot-meta">${fmtDistance(km)} from the pad. ${quality}.</div>
        <div class="spot-perks">${spot.perks}</div>

      </button>`;
  });

  $('spot-list').innerHTML = cards.join('');

  // Remember the sorted order so a click can find the right spot
  state.sortedSpots = withDistance.map((item) => item.spot);
}


// Clicking a spot card zooms the globe to it
$('spot-list').addEventListener('click', (e) => {

  const card = e.target.closest('[data-spot]');

  if (!card) {
    return;
  }

  focusSpot(state.sortedSpots[Number(card.dataset.spot)]);
});


// Zoom in on a spot and show the "Back to launch view" button
function focusSpot(spot) {
  globe.flyToSpot(spot);
  $('back-to-launch').hidden = false;
}


// =============================================================================
// REAL WEATHER (Justin's getWeather)
// -----------------------------------------------------------------------------
// getWeather() asks Open-Meteo for the forecast at the launch site, at the
// launch time. It takes a moment, so we show "Loading" first.
//
// It can end three ways:
//   - a weather object  -> show the card and recolour the flight path
//   - null              -> launch is too far away (forecasts only go 16 days ahead)
//   - an error          -> no internet, or the weather service is down
//
// To use Justin's own card instead of the styled one, replace the
// renderWeather(...) calls below with renderWeatherCard(...) from './weather-card.js'.
// =============================================================================

const weatherEl = $('weather-card');

async function loadWeather() {

  // Give this request a number. If another request starts before this one
  // finishes, this one's result is out of date and gets ignored.
  weatherRequestId += 1;
  const myId = weatherRequestId;

  renderWeather(weatherEl, null, 'Loading forecast…');
  globe.setWeather('none');

  try {
    const wx = await getWeather(state.launch);

    // A newer request has started since; ignore this old result
    if (myId !== weatherRequestId) {
      return;
    }

    state.weather = wx;

    if (wx) {
      renderWeather(weatherEl, wx);
      globe.setWeather(wx.rating);
    } else {
      renderWeather(weatherEl, null, 'Forecast not available yet. Check back closer to launch.');
    }

  } catch (err) {

    if (myId !== weatherRequestId) {
      return;
    }

    console.error('Weather failed to load:', err);
    renderWeather(weatherEl, null, "Couldn't load the forecast. Check your internet connection.");
  }
}


// =============================================================================
// 6. BUTTONS AND DEVELOPER TOOLS
// =============================================================================

// "Replay ascent" restarts the rocket from the pad
$('replay').addEventListener('click', () => {
  globe.replay();
});


// "Show viewing areas" toggles the three zones on and off.
// aria-pressed tells screen readers (and our CSS) whether the toggle is on.
const zonesBtn = $('toggle-zones');

zonesBtn.addEventListener('click', () => {

  // Flip the current state
  state.zonesOn = !state.zonesOn;

  zonesBtn.setAttribute('aria-pressed', String(state.zonesOn));

  if (state.zonesOn) {
    zonesBtn.textContent = 'Hide viewing areas';
    globe.showViewingAreas(state.areas);
  } else {
    zonesBtn.textContent = 'Show viewing areas';
    globe.clearZones();
  }
});


// "Back to launch view" zooms back out after looking at a viewing spot
$('back-to-launch').addEventListener('click', () => {
  globe.flyToLaunch();
  $('back-to-launch').hidden = true;
});


// Developer tools: switch between the live forecast and Justin's test
// weather for each rating, so we can check the card and path colour without
// waiting for real bad weather. Remove before judging if you like.
$('weather-test').addEventListener('change', (e) => {

  const choice = e.target.value;

  // "live" goes back to the real forecast
  if (choice === 'live') {
    loadWeather();
    return;
  }

  // Cancel any forecast still loading, so it doesn't overwrite the test weather
  weatherRequestId += 1;

  // Use Justin's test weather for that rating
  state.weather = testWeather[choice];

  renderWeather(weatherEl, state.weather);
  globe.setWeather(state.weather.rating);
});


// =============================================================================
// START
// =============================================================================

// Draw the pickers right away so the panel isn't empty
drawSitePicker();
drawOrbitPicker();
drawRocketPicker();

$('launch-list').innerHTML = '<p class="muted">Loading upcoming launches…</p>';


async function start() {

  // Wait for BOTH: the real launch list to load, and 1.5 seconds of the Earth
  // spinning (a nice intro). allSettled waits even if the launch list fails.
  const wait = new Promise((resolve) => setTimeout(resolve, 1500));
  const [result] = await Promise.allSettled([loadUpcomingLaunches(), wait]);

  if (result.status === 'fulfilled' && result.value.length > 0) {

    // Real launches loaded: show the soonest one
    state.liveLaunches = result.value;
    state.liveIndex = 0;
    state.mode = 'live';

  } else {

    // No internet or the API is down: fall back to the demo launch
    if (result.status === 'rejected') {
      console.error('Upcoming launches failed to load:', result.reason);
    }

    state.mode = 'demo';
  }

  selectLaunch();
}

start();