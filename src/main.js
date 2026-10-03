// =============================================================================
// main.js  (Colby)
// -----------------------------------------------------------------------------
// The "glue" file. It runs when the page loads and connects everything:
//
//   1. Data and settings
//   2. The ascent timeline (bottom of the screen)
//   3. The globe
//   4. Demo pickers and side panel tabs
//   5. selectLaunch(): switches the whole page to a new launch
//   6. Buttons and developer tools
//
// The page has three modes:
//   - live:  a real upcoming launch from Yosry's launch-api.js
//   - demo:  a made-up launch from the site / orbit / rocket pickers
//   - multi: every real upcoming launch flying at the same time
//
// Whose code is used where:
//   - Yosry:  real upcoming launches (launch-api.js, connected through
//             launch-adapter.js), the flight path (trajectory.js) and the
//             countdown timing (countdown.js).
//   - Justin: launch sites, live weather, weather scoring
//   - Colby:  globe, rockets, viewing areas + viewing spots (built on the same
//             horizon idea as Justin's visibility.js)
// =============================================================================


import './style.css';

import { createGlobe, MULTI_COLORS } from './visualization/globe.js';
import { createCockpit } from './visualization/cockpit.js';
import { createArtemis } from './visualization/artemis.js';
import { ROCKETS, rocketFor, findRocket } from './visualization/rockets.js';
import { startCountdown } from './placeholders/countdown.js';
import { renderWeather } from './placeholders/weather-card.js';

// Justin's code
import { launchPads } from './launches/launch-pads.js';
import { getWeather } from './weather/weather.js';

// Where to watch
import { getViewingAreas, viewQuality, distanceKm } from './launches/viewing-areas.js';
import { viewingSpots, siteNotes } from './launches/viewing-spots.js';

// Real launches through the caching adapter
import { loadUpcomingLaunches } from './launches/launch-adapter.js';

// Yosry's flight path
import { getTrajectory } from './launches/trajectory.js';

// Demo launches, plus the older flight path used as a backup
import {
    ORBITS,
    buildDemoLaunch,
    makeMockTrajectory,
} from './launches/mock-data.js';


// =============================================================================
// 1. DATA AND SETTINGS
// =============================================================================

// Key moments in the ascent (Liftoff, Max Q, separation, orbit) become the
// dots on the timeline. Each rocket has its own timings in rockets.js, so this
// list is swapped whenever the rocket changes (see selectLaunch).
let EVENTS = ROCKETS[0].events;


// What's currently selected.
const state = {

  // 'live' = a real launch from the list, 'demo' = from the pickers,
  // 'multi' = all real launches at once
  mode: 'demo',

  // real upcoming launches, and which one is selected
  liveLaunches: [],
  liveIndex: 0,

  // multiview: the ids of the launches ticked to fly together,
  // the search text filtering the launch list,
  // and the id of the launch the cameras follow (clicked in the colour key)
  multiPicks: new Set(),
  search: '',
  multiFocusId: null,

  // the rocket the cockpit instruments use (the followed one in multiview)
  focusRocket: null,

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


// Format seconds as mission elapsed time:
//   75   -> "T+01:15"
//   5000 -> "T+1:23:20"  (hours appear once the rocket is in orbit)
function fmtMET(seconds) {

  const two = (n) => String(Math.floor(n)).padStart(2, '0');

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `T+${hours}:${two(minutes)}:${two(secs)}`;
  }

  return `T+${two(minutes)}:${two(secs)}`;
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

  // Orange progress bar (full once the rocket is in orbit)
  $('track-fill').style.width = `${Math.min(simT / tMax, 1) * 100}%`;

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

  // Phase name above the track, e.g. "Max Q", or "In orbit" during the lap
  $('phase').textContent = simT > tMax ? 'In orbit' : current.label;

  // Cockpit view instruments (does nothing while the cockpit is hidden)
  const { altKm, speedKmS } = telemetryAt(simT);

  cockpit.update({
    altKm,
    speedKmS,
    simT,
    tMax,
    events: EVENTS,
    sepT: (state.focusRocket || rocketFor(state.launch?.rocket)).separationT,
  });
}


// -----------------------------------------------------------------------------
// telemetryAt(simT)
// Altitude and speed at flight time simT, worked out from the trajectory,
// for the cockpit dials.
//
// Speed = distance travelled in one second. We find the rocket's 3D position
// one second either side of simT and divide the distance by 2 seconds.
// -----------------------------------------------------------------------------

const EARTH_R_KM = 6371;

function telemetryAt(simT) {

  const traj = state.trajectory;

  if (traj.length < 2) {
    return { altKm: 0, speedKmS: 0 };
  }

  // In orbit (after the trajectory ends): steady height, and the real speed
  // needed to stay in a circular orbit:  speed = √(μ / r)
  const last = traj[traj.length - 1];

  if (simT > last.t) {
    return {
      altKm: last.altKm,
      speedKmS: Math.sqrt(398600 / (EARTH_R_KM + last.altKm)),
    };
  }

  // Position (lat, lon, altitude) at any time, blending between trajectory points
  const pointAt = (t) => {

    let i = traj.findIndex((p) => p.t >= t);

    if (i <= 0) {
      return i === 0 ? traj[0] : traj[traj.length - 1];
    }

    const a = traj[i - 1];
    const b = traj[i];
    const f = (t - a.t) / (b.t - a.t);

    return {
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      altKm: a.altKm + (b.altKm - a.altKm) * f,
    };
  };

  // Turn lat/lon/altitude into an x, y, z position in km from the Earth's centre
  const toXYZ = (p) => {
    const r = EARTH_R_KM + p.altKm;
    const lat = (p.lat * Math.PI) / 180;
    const lon = (p.lon * Math.PI) / 180;
    return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
  };

  const before = toXYZ(pointAt(simT - 1));
  const after = toXYZ(pointAt(simT + 1));
  const distance = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);

  return {
    altKm: pointAt(simT).altKm,
    speedKmS: distance / 2,
  };
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

    // Multiview: clicking a launch's label opens that launch on its own
    if (state.mode === 'multi') {

      const index = state.liveLaunches.findIndex((l) => l.pad === pad);

      if (index !== -1) {
        state.mode = 'live';
        state.liveIndex = index;
        selectLaunch();
      }

      return;
    }

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
  onCameraChange: (mode) => applyCameraUI(mode),
});


// The cockpit overlay (window frame, dials, plush toy), shown in Cockpit view
const cockpit = createCockpit($('app'));


// -----------------------------------------------------------------------------
// Camera view switch: "Globe view" / "Side view" / "Cockpit"
// -----------------------------------------------------------------------------
// Buttons next to the mission clock, above the ascent timeline.
//   Side view: looks across the flight path from near the ground, so you can
//              see the arc of the climb. Drag to orbit, scroll to zoom.
//   Cockpit:   rides inside the rocket, looking out of a side window.

const CAMERA_VIEWS = [
  { mode: 'globe', label: 'Globe view', hint: 'See the whole flight path from space' },
  { mode: 'side', label: 'Side view', hint: 'See the arc from the side. Drag to orbit, scroll to zoom' },
  { mode: 'cockpit', label: 'Cockpit', hint: 'Look out of the window from inside the rocket' },
];

// Create the button group once and add it to the timeline header
const cameraSwitch = document.createElement('div');
cameraSwitch.className = 'cam-switch';
cameraSwitch.setAttribute('role', 'group');
cameraSwitch.setAttribute('aria-label', 'Camera view');
document.querySelector('.flight-head').append(cameraSwitch);


// Draw the two buttons, highlighting the active one
function drawCameraSwitch(activeMode) {

  const buttons = CAMERA_VIEWS.map((view) => {

    const pressed = view.mode === activeMode;

    return `
      <button class="choice" data-cam="${view.mode}" aria-pressed="${pressed}" title="${view.hint}">
        ${view.label}
      </button>`;
  });

  cameraSwitch.innerHTML = buttons.join('');
}

drawCameraSwitch('globe');


// Update everything that depends on the camera mode: the buttons, and the
// cockpit overlay (only shown in Cockpit view)
function applyCameraUI(mode) {
  drawCameraSwitch(mode);
  cockpit.setVisible(mode === 'cockpit');
}


// Clicking a view button
cameraSwitch.addEventListener('click', (e) => {

  const button = e.target.closest('[data-cam]');

  if (!button) {
    return;
  }

  const mode = button.dataset.cam;

  globe.setCameraMode(mode);
  applyCameraUI(mode);

  // Side view replaces any spot close-up, so hide "Back to launch view"
  $('back-to-launch').hidden = true;
});

// Show all of Justin's launch sites on the globe
globe.setPads(launchPads);


// Respect the "reduce motion" accessibility setting: don't auto-spin the Earth
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reduceMotion) {
  globe.raw.controls().autoRotate = false;
}


// =============================================================================
// 4. DEMO LAUNCH PICKERS (side panel, Overview tab)
// =============================================================================

// Launch site dropdown. There are a lot of sites now, so a dropdown takes
// far less space than a button for each.
//
// In live mode (a real launch is showing) nothing is selected, so the
// dropdown shows "Choose a site" instead.
function drawSitePicker() {

  const options = launchPads.map((pad) =>
    `<option value="${pad.id}">${shortName(pad.name)}</option>`
  );

  $('site-select').innerHTML =
    '<option value="" disabled>Choose a site</option>' + options.join('');

  $('site-select').value = state.mode === 'demo' ? state.pad.id : '';
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


// Rocket dropdown (Falcon 9, Falcon Heavy, SLS, Saturn V, Starship)
function drawRocketPicker() {

  const options = ROCKETS.map((rocket) =>
    `<option value="${rocket.id}">${rocket.name}</option>`
  );

  $('rocket-select').innerHTML =
    '<option value="" disabled>Choose a rocket</option>' + options.join('');

  $('rocket-select').value = state.mode === 'demo' ? state.rocket.id : '';
}


// Choosing a site from the dropdown switches to a demo launch there
$('site-select').addEventListener('change', (e) => {
  state.mode = 'demo';
  state.pad = launchPads.find((p) => p.id === e.target.value);
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


// Choosing a rocket from the dropdown
$('rocket-select').addEventListener('change', (e) => {
  state.mode = 'demo';
  state.rocket = ROCKETS.find((r) => r.id === e.target.value);
  selectLaunch();
});


// =============================================================================
// SIDE PANEL TABS
// -----------------------------------------------------------------------------
// The panel is split into three tabs so it isn't one long crowded list:
//
//   Overview:  the demo launch pickers and the launch weather
//   Launches:  real upcoming launches
//   Watch:     viewing areas legend and viewing spots
//
// Each tab button has data-tab="..." matching a panel with id="tab-...".
// Only the chosen panel is shown; the others get the "hidden" attribute.
// =============================================================================

const tabButtons = [...document.querySelectorAll('[role="tab"]')];

function showTab(name) {

  for (const button of tabButtons) {

    const active = button.dataset.tab === name;

    // aria-selected tells screen readers (and our CSS) which tab is open
    button.setAttribute('aria-selected', String(active));

    // Only the open tab can be reached with the Tab key; arrows move between tabs
    button.tabIndex = active ? 0 : -1;

    $(`tab-${button.dataset.tab}`).hidden = !active;
  }

  // Start each tab at the top
  $('panel').scrollTop = 0;
}


// Clicking a tab
for (const button of tabButtons) {
  button.addEventListener('click', () => showTab(button.dataset.tab));
}


// Left / right arrow keys move between tabs (standard keyboard behaviour for tabs)
$('tabs').addEventListener('keydown', (e) => {

  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') {
    return;
  }

  const current = tabButtons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
  const step = e.key === 'ArrowRight' ? 1 : -1;
  const next = tabButtons[(current + step + tabButtons.length) % tabButtons.length];

  showTab(next.dataset.tab);
  next.focus();
});


showTab('overview');


// =============================================================================
// 5. selectLaunch()
// -----------------------------------------------------------------------------
// Switches the whole page to the currently selected site + orbit:
// globe, timeline, countdown, mission details, weather, viewing zones.
// =============================================================================

function selectLaunch() {

  // Multiview has its own version (see selectMultiview below)
  if (state.mode === 'multi') {
    selectMultiview();
    return;
  }

  // --- Build the launch and its flight path ---

  if (state.mode === 'live') {
    // A real launch from Yosry's data
    state.launch = state.liveLaunches[state.liveIndex];
  } else {
    // A demo launch from the pickers
    state.launch = buildDemoLaunch(state.pad, state.orbit, state.rocket.name);
  }

  // Single launch: the cockpit uses this launch's own rocket
  state.focusRocket = null;

  // Yosry's flight path for this launch
  state.trajectory = getTrajectory(state.launch);

  // Safety net: his function returns an empty list when it can't work out a
  // launch direction (for example an orbit tilted less than the launch
  // site's latitude). Fall back to the older demo path so the page still works.
  if (state.trajectory.length < 2) {
    console.warn('getTrajectory returned no path, using the demo path for', state.launch.name);
    state.trajectory = makeMockTrajectory(state.launch);
  }

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
  // "Orbit insertion" (the last event) is moved to the very end of the
  // flight path, whatever its length, so it lines up with the moment the
  // rocket reaches orbit.
  const flightEnd = state.trajectory[state.trajectory.length - 1].t;

  EVENTS = rocket.events.map((e, i) =>
    i === rocket.events.length - 1 ? { ...e, t: flightEnd } : e
  );


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

  // Countdown: Yosry's getCountdown() timing, shown by placeholders/countdown.js.
  // Stop the old countdown first so two don't run at once.
  if (stopCountdown) {
    stopCountdown();
  }

  stopCountdown = startCountdown(launch, {
    timeEl: $('countdown-time'),
    windowEl: $('window-line'),
  });


  // --- Mission details (above the timeline) ---

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

  // Back to normal size (multiview makes it smaller)
  $('mission-details').classList.remove('is-key');

  // Shown above the timeline as a row of small "label over value" pairs.
  // Each pair is wrapped in a <div> so it stays together when the row wraps.
  // <dt> = the label, <dd> = the value. The title shows the full text on
  // hover, in case a long launch site name gets cut off with "…".
  $('mission-details').innerHTML = missionRows
    .map(([label, value]) => `
      <div class="mission-item">
        <dt>${label}</dt>
        <dd title="${value}">${value}</dd>
      </div>`)
    .join('');


  // --- Weather ---

  loadWeather();
}


// =============================================================================
// selectMultiview()
// -----------------------------------------------------------------------------
// Shows the launches ticked in the list flying at the same time, each in its
// own colour. The countdown is to the soonest one. Weather and viewing spots are
// for one launch at a time, so those panels ask you to pick a single launch.
// The Side and Cockpit cameras follow the soonest launch.
// =============================================================================

function selectMultiview() {

  // The launches ticked in the list (soonest first)
  const launches = pickedLaunches();

  // Nothing ticked: show the soonest launch on its own instead
  if (launches.length === 0) {
    state.mode = 'live';
    state.liveIndex = 0;
    selectLaunch();
    return;
  }

  // A flight for each launch: Yosry's flight path (with the older demo path
  // as a backup) and the right rocket model
  const list = launches.map((launch) => {

    let trajectory = getTrajectory(launch);

    if (trajectory.length < 2) {
      trajectory = makeMockTrajectory(launch);
    }

    return { launch, trajectory, rocket: rocketFor(launch.rocket) };
  });

  // The soonest launch drives the countdown
  state.launch = launches[0];

  // The followed launch (clicked in the colour key) drives the timeline,
  // the cockpit and the Side view. If it was unticked, follow the soonest.
  let focus = launches.findIndex((l) => l.id === state.multiFocusId);

  if (focus === -1) {
    focus = 0;
    state.multiFocusId = launches[0].id;
  }

  applyFocusTimeline(list[focus]);


  // --- Panels ---

  drawSitePicker();
  drawOrbitPicker();
  drawRocketPicker();
  drawLaunchList();


  // --- Globe: all of them at once ---

  multiList = list;
  globe.showMultiview(list, focus);


  // --- Hero (top-left): countdown to the soonest launch ---

  $('hero-label').textContent = 'All upcoming launches';
  $('mission-name').textContent = `${launches.length} launches at once`;
  $('mission-sub').textContent = `Counting down to ${launches[0].name}`;

  if (stopCountdown) {
    stopCountdown();
  }

  stopCountdown = startCountdown(launches[0], {
    timeEl: $('countdown-time'),
    windowEl: $('window-line'),
  });


  // --- Key (above the timeline): which colour is which launch ---

  // (smaller text in multiview, so a long key stays tidy)
  $('mission-details').classList.add('is-key');

  // Each launch in the key is clickable: click it to make the cameras
  // follow that rocket (see the click handler below selectMultiview)
  $('mission-details').innerHTML = list
    .map(({ launch, rocket }, i) => `
      <div class="mission-item key-item" role="button" tabindex="0"
           data-focus="${i}" aria-pressed="${i === focus}"
           title="Follow ${launch.name} with the camera">
        <dt>
          <span class="key-dot" style="background:${MULTI_COLORS[i % MULTI_COLORS.length]}"></span>
          ${launch.rocket}
        </dt>
        <dd title="${launch.name}">${launch.name}</dd>
      </div>`)
    .join('');


  // --- Weather and viewing: these are for one launch at a time ---

  // Stop any forecast that's still loading from showing up
  weatherRequestId += 1;
  renderWeather(weatherEl, null, 'Pick a single launch to see its launch weather.');

  globe.clearZones();
  globe.showSpots([]);
  $('site-note').hidden = true;
  $('spot-list').innerHTML = '<p class="muted">Pick a single launch to see where to watch it.</p>';
  $('back-to-launch').hidden = true;
}


// -----------------------------------------------------------------------------
// applyFocusTimeline(item)
// Point the timeline and cockpit instruments at one multiview launch:
// its flight path, its rocket's event names and timings.
// -----------------------------------------------------------------------------

let multiList = [];

function applyFocusTimeline(item) {

  state.trajectory = item.trajectory;
  state.focusRocket = item.rocket;

  const flightEnd = item.trajectory[item.trajectory.length - 1].t;

  EVENTS = item.rocket.events.map((e, i) =>
    i === item.rocket.events.length - 1 ? { ...e, t: flightEnd } : e
  );

  drawTimeline(flightEnd);
}


// -----------------------------------------------------------------------------
// Clicking a launch in the colour key (multiview): the cameras follow it.
// If you're in Globe view, this also switches to Side view, so you see the
// camera fly over and chase that rocket.
// -----------------------------------------------------------------------------

function focusKeyItem(item) {

  const index = Number(item.dataset.focus);
  const launch = pickedLaunches()[index];

  if (!launch || state.mode !== 'multi') {
    return;
  }

  state.multiFocusId = launch.id;

  // The timeline and cockpit now describe this rocket
  applyFocusTimeline(multiList[index]);

  // Highlight it in the key
  for (const el of document.querySelectorAll('.key-item')) {
    el.setAttribute('aria-pressed', String(el === item));
  }

  globe.setFocus(index);

  if (globe.getCameraMode() === 'globe') {
    globe.setCameraMode('side');
    applyCameraUI('side');
  }
}


$('mission-details').addEventListener('click', (e) => {

  const item = e.target.closest('.key-item');

  if (item) {
    focusKeyItem(item);
  }
});


// Keyboard: Enter or Space on a focused key item does the same as a click
$('mission-details').addEventListener('keydown', (e) => {

  const item = e.target.closest('.key-item');

  if (item && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    focusKeyItem(item);
  }
});


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


// The most launches multiview can show at once (one colour each, and enough
// to keep it smooth on most laptops)
const MULTI_MAX = MULTI_COLORS.length;

// How many launches are ticked for multiview when the list first loads
const MULTI_DEFAULT = 5;


// -----------------------------------------------------------------------------
// The controls above the list (created once, so the search box keeps its
// focus while the list below it is redrawn on every keystroke):
//   - a search box
//   - "Watch selected together (N)" button
//   - "N of 12 selected" and a "Clear" button
// -----------------------------------------------------------------------------

const listTools = document.createElement('div');
listTools.className = 'list-tools';

listTools.innerHTML = `

  <input id="launch-search" class="select search" type="search"
         placeholder="Search missions, rockets or places" aria-label="Search upcoming launches">

  <button id="multi-btn" class="btn btn-toggle multi-btn" aria-pressed="false"></button>

  <div class="multi-meta">
    <span id="multi-count"></span>
    <button id="multi-clear" class="link-btn">Clear</button>
  </div>
`;

$('launch-list').before(listTools);

// Hidden until the launches have loaded
listTools.hidden = true;


// Typing in the search box filters the list
$('launch-search').addEventListener('input', (e) => {
  state.search = e.target.value.trim().toLowerCase();
  drawLaunchList();
});


// "Watch selected together"
$('multi-btn').addEventListener('click', () => {

  if (state.multiPicks.size === 0) {
    return;
  }

  state.mode = 'multi';
  selectLaunch();
});


// "Clear": untick everything. If multiview was showing, go back to the
// soonest single launch, since there's nothing left to show together.
$('multi-clear').addEventListener('click', () => {

  state.multiPicks.clear();

  if (state.mode === 'multi') {
    state.mode = 'live';
    state.liveIndex = 0;
    selectLaunch();
  } else {
    drawLaunchList();
  }
});


// The ticked launches, in list order (soonest first). This order also
// decides each one's colour in multiview.
function pickedLaunches() {
  return state.liveLaunches.filter((l) => state.multiPicks.has(l.id));
}


// Colour of a launch in multiview, or null if it isn't ticked
function multiColorFor(launch) {
  const index = pickedLaunches().indexOf(launch);
  return index === -1 ? null : MULTI_COLORS[index];
}


// -----------------------------------------------------------------------------
// drawLaunchList()
// Draws the list: one row per launch matching the search, each with a tick
// box (add to multiview) and a card (click to watch that launch on its own).
// -----------------------------------------------------------------------------

function drawLaunchList() {

  // Nothing loaded (no internet, or the API is down)
  if (state.liveLaunches.length === 0) {
    listTools.hidden = true;
    $('launch-list').innerHTML =
      "<p class=\"muted\">Couldn't load upcoming launches. Showing demo launches instead.</p>";
    return;
  }

  listTools.hidden = false;


  // --- The controls above the list ---

  const picked = state.multiPicks.size;
  const inMulti = state.mode === 'multi';

  $('multi-btn').textContent = inMulti
    ? `Watching ${picked} together`
    : `Watch selected together (${picked})`;

  $('multi-btn').setAttribute('aria-pressed', String(inMulti));
  $('multi-btn').disabled = picked === 0;

  $('multi-count').textContent = picked >= MULTI_MAX
    ? `${picked} of ${MULTI_MAX} selected (the most at once)`
    : `${picked} of ${MULTI_MAX} selected`;

  $('multi-clear').hidden = picked === 0;


  // --- The rows ---

  // Keep each launch's position in the full list (i), then apply the search
  const matches = state.liveLaunches
    .map((launch, i) => ({ launch, i }))
    .filter(({ launch }) =>
      `${launch.name} ${launch.rocket} ${launch.pad.name}`.toLowerCase().includes(state.search)
    );

  if (matches.length === 0) {
    $('launch-list').innerHTML = '<p class="muted">No launches match your search.</p>';
    return;
  }

  const rows = matches.map(({ launch, i }) => {

    const pressed = state.mode === 'live' && i === state.liveIndex;
    const ticked = state.multiPicks.has(launch.id);

    // Can't tick more once the limit is reached (but can still untick)
    const locked = !ticked && picked >= MULTI_MAX;

    // In multiview, ticked launches show their colour
    const color = inMulti ? multiColorFor(launch) : null;
    const dot = color ? `<span class="key-dot" style="background:${color}"></span>` : '';

    // Just the place, e.g. "Space Launch Complex 40, Cape Canaveral / Kennedy" -> "Cape Canaveral / Kennedy"
    const place = launch.pad.name.split(', ')[1] || launch.pad.name;

    return `
      <div class="launch-row">

        <input type="checkbox" class="pick" data-pick="${launch.id}"
               ${ticked ? 'checked' : ''} ${locked ? 'disabled' : ''}
               aria-label="Add ${launch.name} to multiview">

        <button class="spot" data-launch="${i}" aria-pressed="${pressed}">

          <div class="spot-top">
            <span class="spot-name">${dot}${launch.name}</span>
          </div>

          <div class="spot-meta">${launch.rocket} from ${place}</div>
          <div class="spot-perks">${fmtLaunchDate.format(new Date(launch.windowStart))}</div>

        </button>

      </div>`;
  });

  $('launch-list').innerHTML = rows.join('');
}


// Clicking a launch card: watch that launch on its own
$('launch-list').addEventListener('click', (e) => {

  const card = e.target.closest('[data-launch]');

  if (!card) {
    return;
  }

  state.mode = 'live';
  state.liveIndex = Number(card.dataset.launch);
  selectLaunch();
});


// Ticking or unticking a launch for multiview
$('launch-list').addEventListener('change', (e) => {

  const box = e.target.closest('[data-pick]');

  if (!box) {
    return;
  }

  if (box.checked) {
    state.multiPicks.add(box.dataset.pick);
  } else {
    state.multiPicks.delete(box.dataset.pick);
  }

  // Already watching multiview: update the globe straight away
  if (state.mode === 'multi') {

    if (state.multiPicks.size === 0) {
      state.mode = 'live';
      state.liveIndex = 0;
    }

    selectLaunch();

  } else {
    drawLaunchList();
  }
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

  // Open the Watch tab so the spot list and "Back" button are in view
  // (useful when the spot was clicked on the globe instead of in the list)
  showTab('watch');
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

  // (In multiview the areas belong to no single launch, so nothing is drawn)
  if (state.zonesOn && state.mode !== 'multi') {
    zonesBtn.textContent = 'Hide viewing areas';
    globe.showViewingAreas(state.areas);
  } else if (state.zonesOn) {
    zonesBtn.textContent = 'Hide viewing areas';
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


// =============================================================================
// SECRET MENU: the Artemis II mission replay (see visualization/artemis.js)
// -----------------------------------------------------------------------------
// Nothing on the page mentions it. Three ways in:
//   - type "artemis" anywhere (not while typing in the search box)
//   - the Konami code: ↑ ↑ ↓ ↓ ← → ← → B A
//   - click the "Launch Watcher" title 5 times quickly
// =============================================================================

const artemis = createArtemis(globe, {

  // When the mission closes, rebuild the normal page
  onExit: () => {
    applyCameraUI('globe');
    selectLaunch();
  },
});


function openArtemis() {

  if (artemis.isRunning()) {
    return;
  }

  // Back to the normal camera first, and stop the page's own updates
  globe.setCameraMode('globe');
  applyCameraUI('globe');

  weatherRequestId += 1;

  if (stopCountdown) {
    stopCountdown();
    stopCountdown = null;
  }

  artemis.start();
}


// The last few keys pressed, to spot the secret words
let typed = '';
let keyHistory = [];

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

window.addEventListener('keydown', (e) => {

  // Ignore keys typed into the search box or any other text field
  if (e.target.matches?.('input, textarea, select')) {
    return;
  }

  // "artemis"
  if (e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-7);

    if (typed === 'artemis') {
      typed = '';
      openArtemis();
      return;
    }
  }

  // Konami code
  keyHistory = [...keyHistory, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length);

  if (keyHistory.join() === KONAMI.join()) {
    keyHistory = [];
    openArtemis();
  }
});


// Click the "Launch Watcher" title 5 times within 2.5 seconds
let titleClicks = [];

document.querySelector('.brand').addEventListener('click', () => {

  const now = Date.now();
  titleClicks = [...titleClicks, now].filter((t) => now - t < 2500);

  if (titleClicks.length >= 5) {
    titleClicks = [];
    openArtemis();
  }
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

    // Tick the soonest few for multiview, so it works straight away
    for (const launch of state.liveLaunches.slice(0, MULTI_DEFAULT)) {
      state.multiPicks.add(launch.id);
    }

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