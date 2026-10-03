// =============================================================================
// main.js  (Colby)
// -----------------------------------------------------------------------------
// The "glue" file. It runs when the page loads and connects everything:
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
import { mockLaunch, mockTrajectory, mockWeather, mockZones } from './mock-data.js';

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
  { t: 0, label: 'Liftoff' },
  { t: 72, label: 'Max Q' },            // moment of maximum aerodynamic stress
  { t: 160, label: 'Stage separation' }, // first stage drops away
  { t: 540, label: 'Orbit insertion' },  // satellite reaches orbit
];

// =============================================================================
// Small helpers
// =============================================================================

// Shortcut: $('phase') instead of document.getElementById('phase')
const $ = (id) => document.getElementById(id);

// Format seconds as mission elapsed time, e.g. 75 -> "T+01:15"
const fmtMET = (s) =>
  `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// =============================================================================
// 2. ASCENT TIMELINE (bottom of the screen)
// =============================================================================

// Total flight time = the time of the last trajectory point
const tMaxFlight = trajectory[trajectory.length - 1].t;

// Create one marker per event, positioned along the track as a percentage.
// The first marker is left-aligned and the last right-aligned (CSS classes
// "first" / "last") so their labels don't hang off the edges.
$('track-events').innerHTML = EVENTS.map((e, i) => {
  const cls = i === 0 ? 'first' : i === EVENTS.length - 1 ? 'last' : '';
  return `<span class="event ${cls}" style="left:${(e.t / tMaxFlight) * 100}%">${e.label}</span>`;
}).join('');
const eventEls = [...document.querySelectorAll('.event')];

// Called by the globe on every animation frame (via onTick) with the rocket's
// current flight time. Updates the orange progress bar, the clock, and which
// event dots are lit up.
function updateFlight(simT, tMax) {
  $('track-fill').style.width = `${(simT / tMax) * 100}%`;
  $('met').textContent = fmtMET(simT);

  let current = EVENTS[0];
  EVENTS.forEach((e, i) => {
    const passed = simT >= e.t;
    eventEls[i].classList.toggle('passed', passed); // "passed" turns the dot orange
    if (passed) current = e;                         // remember the latest passed event
  });
  $('phase').textContent = current.label;            // e.g. "Max Q"
}

// =============================================================================
// GLOBE
// =============================================================================

// Create the globe inside the #globe div, and tell it to call updateFlight every frame
const globe = createGlobe($('globe'), { onTick: updateFlight });

// Respect the "reduce motion" accessibility setting: don't auto-spin the Earth
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  globe.raw.controls().autoRotate = false;
}

// Let the Earth spin for 1.5 seconds before flying to the launch (nice intro)
setTimeout(() => globe.showLaunch(launch, trajectory, weather), 1500);

// =============================================================================
// 3. HERO (top-left) AND SIDE PANEL
// =============================================================================

// Mission name and rocket under the countdown
$('mission-name').textContent = launch.name;
$('mission-sub').textContent = `${launch.rocket} from ${launch.pad.name}`;

// PLUG-IN POINT (Yosry): temporary countdown; swap for his when ready
startCountdown(launch, { timeEl: $('countdown-time'), windowEl: $('window-line') });

// Mission details list in the side panel. Turns short orbit codes into
// readable names for the public.
const ORBIT_NAMES = { LEO: 'Low Earth orbit', Polar: 'Polar orbit', SSO: 'Sun-synchronous orbit' };
$('mission-details').innerHTML = [
  ['Rocket', launch.rocket],
  ['Launch site', launch.pad.name],
  ['Target orbit', ORBIT_NAMES[launch.orbit] || launch.orbit],
  ['Inclination', `${launch.inclination}°`],
]
  .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`) // <dt> = label, <dd> = value
  .join('');

// PLUG-IN POINT (Justin): temporary weather card; works with his weather object as-is
renderWeather($('weather-card'), weather);

// =============================================================================
// 4. BUTTONS AND CONTROLS
// =============================================================================

// "Replay ascent" restarts the rocket from the pad
$('replay').addEventListener('click', () => globe.replay());

// "Show viewing zones" toggles the circles on and off.
// aria-pressed tells screen readers (and our CSS) whether the toggle is on.
const zonesBtn = $('toggle-zones');
zonesBtn.addEventListener('click', () => {
  const on = zonesBtn.getAttribute('aria-pressed') !== 'true'; // flip the current state
  zonesBtn.setAttribute('aria-pressed', String(on));
  zonesBtn.textContent = on ? 'Hide viewing zones' : 'Show viewing zones';
  if (on) globe.showZones(zones);
  else globe.clearZones();
});

// Developer tools: fake weather for each rating, so we can test the card and
// the path colour without waiting for real bad weather. Remove before judging
// if you like.
const TEST_WEATHER = {
  green: mockWeather,
  yellow: {
    rating: 'yellow', reasons: ['Gusts near the limit', 'Thick cloud layer'],
    windKt: 16, gustKt: 24, cloudPct: 75, precipMm: 0.2, cape: 400,
  },
  red: {
    rating: 'red', reasons: ['Thunderstorms nearby', 'Gusts above 30 kt'],
    windKt: 22, gustKt: 34, cloudPct: 95, precipMm: 4, cape: 1400,
  },
};
$('weather-test').addEventListener('change', (e) => {
  weather = TEST_WEATHER[e.target.value];      // pick the fake weather
  renderWeather($('weather-card'), weather);   // update the card
  globe.setWeather(weather.rating);            // recolour the flight path
});