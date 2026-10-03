// =============================================================================
// main.js  (Colby)
// -----------------------------------------------------------------------------
// The "glue" file. It runs when the page loads and connects everything:
//
//   1. Data and settings
//   2. The ascent timeline (bottom of the screen)
//   3. The globe
//   4. Launch site, orbit and rocket pickers (side panel)
//   5. selectLaunch(): switches the whole page to a new launch
//   6. Buttons and developer tools
//
// Whose code is used where:
//   - Justin: launch sites, live weather, weather scoring, viewing zones
//   - Yosry:  still mock for now (launch data, trajectory, countdown).
//             Look for "PLUG-IN POINT (Yosry)" when his code is ready.
// =============================================================================


import './style.css';

import { createGlobe } from './globe.js';
import { ROCKETS, rocketFor } from './rockets.js';
import { startCountdown } from './placeholders/countdown.js';
import { renderWeather } from './placeholders/weather-card.js';

// Justin's code
import { launchPads } from './launch-pads.js';
import { getWeather } from './weather.js';
import { getViewingZones } from './visibility.js';
import { mockWeather as testWeather } from './mock-weather.js';

// Still mock (waiting on Yosry's launch data and trajectory)
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


// What's currently selected. Canso is first in Justin's list, so it's the default.
const state = {
  pad: launchPads[0],
  orbit: 'LEO',
  rocket: ROCKETS[0],   // Falcon 9

  // filled in by selectLaunch()
  launch: null,
  trajectory: [],
  weather: null,
  zones: [],

  // whether the viewing-zone circles are switched on
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
//   onTick:     keeps the timeline in sync with the rocket
//   onPadClick: clicking a site on the globe switches to it
const globe = createGlobe($('globe'), {
  onTick: updateFlight,
  onPadClick: (pad) => {
    state.pad = pad;
    selectLaunch();
  },
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

    const pressed = pad.id === state.pad.id;

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

    const pressed = key === state.orbit;

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

    const pressed = rocket.id === state.rocket.id;

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

  state.pad = launchPads.find((p) => p.id === button.dataset.pad);
  selectLaunch();
});


// Clicking an orbit button
$('orbit-picker').addEventListener('click', (e) => {

  const button = e.target.closest('[data-orbit]');

  if (!button) {
    return;
  }

  state.orbit = button.dataset.orbit;
  selectLaunch();
});


// Clicking a rocket button
$('rocket-picker').addEventListener('click', (e) => {

  const button = e.target.closest('[data-rocket]');

  if (!button) {
    return;
  }

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

  // PLUG-IN POINT (Yosry): replace with his real launch for this site
  state.launch = buildDemoLaunch(state.pad, state.orbit, state.rocket.name);

  // PLUG-IN POINT (Yosry): replace with getTrajectory(state.launch)
  state.trajectory = makeMockTrajectory(state.launch);

  // Justin's viewing zones for this flight path
  state.zones = getViewingZones(state.trajectory);

  // Weather is unknown until the new forecast loads
  state.weather = null;


  const launch = state.launch;


  // --- Pickers: highlight the selected buttons ---

  drawSitePicker();
  drawOrbitPicker();
  drawRocketPicker();


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

  // Redraw the circles for the new path if they're switched on
  if (state.zonesOn) {
    globe.showZones(state.zones);
  }


  // --- Hero (top-left) ---

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
    ['Target orbit', ORBITS[launch.orbit]?.name || launch.orbit],
    ['Inclination', `${launch.inclination}°`],
  ];

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


// "Show viewing zones" toggles the circles on and off.
// aria-pressed tells screen readers (and our CSS) whether the toggle is on.
const zonesBtn = $('toggle-zones');

zonesBtn.addEventListener('click', () => {

  // Flip the current state
  state.zonesOn = !state.zonesOn;

  zonesBtn.setAttribute('aria-pressed', String(state.zonesOn));

  if (state.zonesOn) {
    zonesBtn.textContent = 'Hide viewing zones';
    globe.showZones(state.zones);
  } else {
    zonesBtn.textContent = 'Show viewing zones';
    globe.clearZones();
  }
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

// Let the Earth spin for 1.5 seconds, then fly to the default launch (Canso)
setTimeout(selectLaunch, 1500);