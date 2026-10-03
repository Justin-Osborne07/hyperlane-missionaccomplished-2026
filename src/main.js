// =============================================================================
// main.js  (Colby)
// -----------------------------------------------------------------------------
// The "glue" file. It runs when the page loads and connects everything:
//
//   1. Gets the data (mock data for now)
//   2. Creates the globe and the ascent timeline
//   3. Fills in the hero (countdown + mission name) and the side panel
//   4. Hooks up the buttons
//
// Yosry and Justin don't need to change their work to fit this file. When
// their code is ready, look for the "PLUG-IN POINT" comments below; each one
// is a single line to swap.
// =============================================================================


import './style.css';

import { createGlobe } from './globe.js';
import { startCountdown } from './placeholders/countdown.js';
import { renderWeather } from './placeholders/weather-card.js';

import {
  mockLaunch,
  mockTrajectory,
  mockWeather,
  mockZones,
} from './mock-data.js';


// =============================================================================
// 1. DATA
// =============================================================================

// PLUG-IN POINT (Yosry): replace with his real launch, e.g. await getNextLaunch()
const launch = mockLaunch;

// PLUG-IN POINT (Yosry): replace with getTrajectory(launch)
const trajectory = mockTrajectory;

// PLUG-IN POINT (Justin): replace with his real weather, e.g. await getWeather(launch)
let weather = mockWeather;

// PLUG-IN POINT (Justin): replace with getViewingZones(trajectory)
const zones = mockZones;


// Key moments in a Falcon 9 ascent, in seconds after liftoff (approximate).
// These become the dots on the timeline at the bottom of the screen.
const EVENTS = [

  // the rocket leaves the pad
  { t: 0, label: 'Liftoff' },

  // moment of maximum aerodynamic stress
  { t: 72, label: 'Max Q' },

  // first stage drops away
  { t: 160, label: 'Stage separation' },

  // satellite reaches orbit
  { t: 540, label: 'Orbit insertion' },
];


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


// =============================================================================
// 2. ASCENT TIMELINE (bottom of the screen)
// =============================================================================

// Total flight time = the time of the last trajectory point
const tMaxFlight = trajectory[trajectory.length - 1].t;


// Create one marker per event, positioned along the track as a percentage.
//
// The first marker is left-aligned and the last right-aligned (CSS classes
// "first" / "last") so their labels don't hang off the edges.
const eventHTML = EVENTS.map((e, i) => {

  let cls = '';

  if (i === 0) {
    cls = 'first';
  } else if (i === EVENTS.length - 1) {
    cls = 'last';
  }

  const leftPercent = (e.t / tMaxFlight) * 100;

  return `<span class="event ${cls}" style="left:${leftPercent}%">${e.label}</span>`;
});

$('track-events').innerHTML = eventHTML.join('');

// Keep a list of the marker elements so we can light them up later
const eventEls = [...document.querySelectorAll('.event')];


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
    eventEls[i].classList.toggle('passed', passed);

    if (passed) {
      current = e;
    }
  });

  // Phase name above the track, e.g. "Max Q"
  $('phase').textContent = current.label;
}


// =============================================================================
// GLOBE
// =============================================================================

// Create the globe inside the #globe div,
// and tell it to call updateFlight on every animation frame
const globe = createGlobe($('globe'), { onTick: updateFlight });


// Respect the "reduce motion" accessibility setting: don't auto-spin the Earth
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reduceMotion) {
  globe.raw.controls().autoRotate = false;
}


// Let the Earth spin for 1.5 seconds before flying to the launch (a nice intro)
setTimeout(() => {
  globe.showLaunch(launch, trajectory, weather);
}, 1500);


// =============================================================================
// 3. HERO (top-left) AND SIDE PANEL
// =============================================================================

// Mission name and rocket under the countdown
$('mission-name').textContent = launch.name;
$('mission-sub').textContent = `${launch.rocket} from ${launch.pad.name}`;


// PLUG-IN POINT (Yosry): temporary countdown; swap for his when ready
startCountdown(launch, {
  timeEl: $('countdown-time'),
  windowEl: $('window-line'),
});


// Mission details list in the side panel.
// Turns short orbit codes into readable names for the public.
const ORBIT_NAMES = {
  LEO: 'Low Earth orbit',
  Polar: 'Polar orbit',
  SSO: 'Sun-synchronous orbit',
};

const missionRows = [
  ['Rocket', launch.rocket],
  ['Launch site', launch.pad.name],
  ['Target orbit', ORBIT_NAMES[launch.orbit] || launch.orbit],
  ['Inclination', `${launch.inclination}°`],
];

// <dt> = the label, <dd> = the value
$('mission-details').innerHTML = missionRows
  .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
  .join('');


// PLUG-IN POINT (Justin): temporary weather card; works with his weather object as-is
renderWeather($('weather-card'), weather);


// =============================================================================
// 4. BUTTONS AND CONTROLS
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
  const on = zonesBtn.getAttribute('aria-pressed') !== 'true';

  zonesBtn.setAttribute('aria-pressed', String(on));

  if (on) {
    zonesBtn.textContent = 'Hide viewing zones';
    globe.showZones(zones);
  } else {
    zonesBtn.textContent = 'Show viewing zones';
    globe.clearZones();
  }
});


// Developer tools: fake weather for each rating, so we can test the card and
// the path colour without waiting for real bad weather.
// Remove before judging if you like.
const TEST_WEATHER = {

  green: mockWeather,

  yellow: {
    rating: 'yellow',
    reasons: ['Gusts near the limit', 'Thick cloud layer'],
    windKt: 16,
    gustKt: 24,
    cloudPct: 75,
    precipMm: 0.2,
    cape: 400,
  },

  red: {
    rating: 'red',
    reasons: ['Thunderstorms nearby', 'Gusts above 30 kt'],
    windKt: 22,
    gustKt: 34,
    cloudPct: 95,
    precipMm: 4,
    cape: 1400,
  },
};

$('weather-test').addEventListener('change', (e) => {

  // Pick the fake weather for the chosen rating
  weather = TEST_WEATHER[e.target.value];

  // Update the card
  renderWeather($('weather-card'), weather);

  // Recolour the flight path
  globe.setWeather(weather.rating);
});