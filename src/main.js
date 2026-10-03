import './style.css';
import { createGlobe } from './globe.js';
import { mockLaunch, mockTrajectory, mockWeather, mockZones } from './mock-data.js';

// Later: swap these for Yosry's / Justin's real functions (same shapes).
const launch = mockLaunch;
const trajectory = mockTrajectory;
const weather = mockWeather;
const zones = mockZones;

const globe = createGlobe(document.getElementById('globe'));

// Let the globe spin for a moment before flying to the launch.
setTimeout(() => globe.showLaunch(launch, trajectory, weather), 1500);

// Placeholder slot content so everyone can see where their component goes.
document.getElementById('countdown-slot').innerHTML =
  `<h2>Countdown</h2><p class="placeholder">Yosry's countdown goes here</p>`;
document.getElementById('launch-info-slot').innerHTML =
  `<h2>${launch.name}</h2><p>${launch.rocket} from ${launch.pad.name}</p><p>${launch.orbit}, ${launch.inclination}°</p>`;
document.getElementById('weather-slot').innerHTML =
  `<h2>Weather</h2><p class="placeholder">Justin's weather card goes here</p>`;

// ---------- dev controls ----------
document.getElementById('replay').addEventListener('click', () => globe.replay());

let zonesOn = false;
const zonesBtn = document.getElementById('toggle-zones');
zonesBtn.addEventListener('click', () => {
  zonesOn = !zonesOn;
  zonesOn ? globe.showZones(zones) : globe.clearZones();
  zonesBtn.textContent = zonesOn ? 'Hide viewing zones' : 'Show viewing zones';
});

document.getElementById('weather-test').addEventListener('change', (e) => {
  globe.setWeather(e.target.value);
});
