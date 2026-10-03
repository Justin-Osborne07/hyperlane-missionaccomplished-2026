// =============================================================================
// artemis.js  (Colby)
// -----------------------------------------------------------------------------
// SECRET MENU: a full replay of NASA's Artemis II mission (April 2026).
//
// Opened from main.js by typing "artemis", the Konami code, or clicking the
// "Launch Watcher" title 5 times. While it runs it takes over the globe:
//
//   - SLS launches from Launch Complex 39B (real 3D model, stages separate)
//   - Orion circles the Earth, then spends a day in a high stretched orbit
//   - trans-lunar injection, four days out to the Moon (true scale!)
//   - a close flyby behind the far side of the Moon
//   - four days home, re-entry and splashdown off San Diego
//
// A "camera director" picks a good view for each phase and glides between
// them. Drag to swing the view round, scroll to zoom.
//
// The mission control display shows the mission clock, date, distances,
// speed, the crew, and a timeline you can scrub through or jump along.
//
// The flight path and timeline come from artemis-path.js.
// =============================================================================


import * as THREE from 'three';

import {
  MET,
  EVENTS,
  CREW,
  LAUNCH_DATE,
  LAUNCH_PAD,
  KM_PER_UNIT,
  PLAY_LENGTH,
  buildMissionPath,
  metFromPlay,
  playFromMet,
  phaseAt,
} from './artemis-path.js';

import { rocketFor } from './rockets.js';
import { getTrajectory } from '../launches/trajectory.js';


// Playback speeds offered
const SPEEDS = [0.5, 1, 2, 4];

// How many points the drawn path is made of
const TRAIL_POINTS = 4000;


// =============================================================================
// createArtemis(globeApi, { onExit })
//   globeApi: the object returned by createGlobe() in globe.js
//   onExit:   called after the mission closes, so main.js can restore the page
// Returns { start(), stop(), isRunning() }
// =============================================================================

export function createArtemis(globeApi, { onExit } = {}) {

  const gi = globeApi.internals();
  const { scene, camera } = gi;

  const hud = buildHud();
  document.getElementById('app').append(hud.root);


  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let running = false;
  let playing = true;
  let speed = 1;
  let play = 0;            // replay position, in seconds (0 to PLAY_LENGTH)
  let rafId = null;
  let lastFrame = 0;

  let mission = null;      // the flight path (see artemis-path.js)
  let rig = null;          // the SLS / Orion 3D model
  let glow = null;         // Orion's glow, so it's visible from anywhere
  let splashGlow = null;   // marks the splashdown point
  let trailAll = null;     // the whole path, faint
  let trailDone = null;    // the part already flown, bright
  let trailTimes = [];     // mission time of each trail point

  // Saved so the Moon can be put back afterwards
  const savedMoon = { position: new THREE.Vector3(), scale: 1 };

  // Camera: where it is, where it looks, and which way is up (smoothed)
  const camLook = new THREE.Vector3();
  const camUp = new THREE.Vector3(0, 1, 0);
  let userYaw = 0;         // drag to swing the view round
  let userZoom = 1;        // scroll to zoom
  let snapCamera = true;   // jump (not glide) on the first frame


  // ===========================================================================
  // START AND STOP
  // ===========================================================================

  function start() {

    if (running) {
      return;
    }

    running = true;

    // Clear the normal view off the globe
    gi.suspend();
    document.body.classList.add('artemis-mode');
    hud.root.hidden = false;

    // The globe now fills the whole screen; let it resize to fit
    window.dispatchEvent(new Event('resize'));


    // --- The ascent: the rocket's path from the pad (Yosry's trajectory),
    //     stretched to last 8 minutes, the real time to orbit ---

    const launch = { pad: LAUNCH_PAD, inclination: Math.ceil(LAUNCH_PAD.lat * 10) / 10 };
    const raw = getTrajectory(launch);
    const tEnd = raw[raw.length - 1].t;
    const ascent = raw.map((p) => ({ ...p, t: (p.t * MET.coreSep) / tEnd }));

    const orbit = gi.computeOrbit(ascent);


    // --- The whole mission path ---

    mission = buildMissionPath({
      getCoords: gi.getCoords,
      altFromKm: gi.altFromKm,
      ascent,
      orbit,
      orbitPoint: gi.orbitPoint,
    });


    // --- The rocket, Orion's glow, and the splashdown marker ---

    rig = gi.buildRig(rocketFor('SLS'));
    glow = gi.makeGlow('#ffb547');

    splashGlow = gi.makeGlow('#7fd1ff');
    splashGlow.position.copy(mission.splashDir).multiplyScalar(100.2);
    splashGlow.scale.setScalar(0.025);


    // --- The Moon: move it to its real place and size for the mission ---

    savedMoon.position.copy(gi.moon.position);
    savedMoon.scale = gi.moon.scale.x;

    gi.moon.position.copy(mission.moonPosition);
    gi.moon.scale.setScalar(mission.moonRadius / gi.MOON_RADIUS);


    // --- The Sun where it was at launch ---

    gi.setSunTime(LAUNCH_DATE);


    // --- The path, drawn as two lines over the same points ---

    buildTrail();


    // --- Go ---

    play = 0;
    playing = true;
    speed = 1;
    userYaw = 0;
    userZoom = 1;
    snapCamera = true;

    hud.drawEventTicks();
    hud.setPlaying(true);
    hud.setSpeed(speed);

    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }


  function stop() {

    if (!running) {
      return;
    }

    running = false;
    cancelAnimationFrame(rafId);

    // Remove everything the mission added
    gi.removeRig(rig);

    for (const sprite of [glow, splashGlow]) {
      scene.remove(sprite);
      sprite.material.dispose();
    }

    for (const line of [trailAll, trailDone]) {
      scene.remove(line);
      line.material.dispose();
    }

    trailAll.geometry.dispose();

    // Put the Moon back
    gi.moon.position.copy(savedMoon.position);
    gi.moon.scale.setScalar(savedMoon.scale);

    // Hand the globe back
    gi.resume();
    document.body.classList.remove('artemis-mode');
    hud.root.hidden = true;
    window.dispatchEvent(new Event('resize'));

    if (onExit) {
      onExit();
    }
  }


  // ---------------------------------------------------------------------------
  // buildTrail()
  // Samples the whole path into points. Samples are spread evenly in REPLAY
  // time (not mission time), so the short but important parts (launch,
  // flyby) get plenty of points and stay smooth.
  // ---------------------------------------------------------------------------

  function buildTrail() {

    const positions = new Float32Array(TRAIL_POINTS * 3);
    trailTimes = [];

    for (let i = 0; i < TRAIL_POINTS; i++) {

      const met = metFromPlay((PLAY_LENGTH * i) / (TRAIL_POINTS - 1));
      const p = mission.positionAt(met);

      positions.set([p.x, p.y, p.z], i * 3);
      trailTimes.push(met);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Faint: the whole planned path
    trailAll = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: '#9fc4ff',
      transparent: true,
      opacity: 0.28,
    }));

    // Bright: the part flown so far (drawRange is set every frame)
    trailDone = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: '#ffb547',
      transparent: true,
      opacity: 0.95,
    }));

    scene.add(trailAll, trailDone);
  }


  // ===========================================================================
  // THE ANIMATION LOOP
  // ===========================================================================

  function frame(now) {

    const dt = Math.min((now - lastFrame) / 1000, 0.1);   // seconds, capped
    lastFrame = now;

    // Move the replay on
    if (playing) {

      play += dt * speed;

      // End of the mission: stop there
      if (play >= PLAY_LENGTH) {
        play = PLAY_LENGTH;
        playing = false;
        hud.setPlaying(false, true);
      }
    }

    const met = metFromPlay(play);

    updateScene(met, now);
    updateCamera(met, dt);
    hud.update(met, play, mission);

    rafId = requestAnimationFrame(frame);
  }


  // ---------------------------------------------------------------------------
  // updateScene(met, now)
  // Moves Orion, the rocket model and the bright trail to mission time met.
  // ---------------------------------------------------------------------------

  const UP = new THREE.Vector3(0, 1, 0);

  function updateScene(met, now) {

    const pos = mission.positionAt(met);
    const dir = travelDirection(met);


    // --- Orion's glow, always visible ---

    glow.position.copy(pos);
    glow.scale.setScalar(0.045 * (1 + 0.15 * Math.sin(now / 400)));


    // --- The bright "flown so far" trail ---

    let count = trailTimes.findIndex((t) => t > met);
    if (count === -1) count = trailTimes.length;
    trailDone.geometry.setDrawRange(0, count);


    // --- The rocket model: only near Earth, where it's big enough to see ---

    const showRocket = met < MET.apogeeRaise;
    rig.root.visible = showRocket;

    if (!showRocket) {
      return;
    }

    rig.root.position.copy(pos);
    rig.root.quaternion.setFromUnitVectors(UP, dir);

    // Stage separation (and undoing it if the timeline is dragged back)
    if (rig.sep && met < MET.boosterSep) {
      gi.resetStages(rig);
    }

    if (!rig.sep && met >= MET.boosterSep) {
      gi.separateStages(rig, dir);
    }

    if (rig.sep) {
      gi.animateFallingStage(rig, met - MET.boosterSep);
    }

    // Upper stage engine burns until orbit
    rig.upperFlame.visible = rig.sep !== null && met < MET.coreSep;

    const flicker = 1 + 0.12 * Math.sin(now / 35) + 0.08 * Math.random();
    rig.lowerFlame.scale.set(1, flicker, 1);
    rig.upperFlame.scale.set(1, flicker, 1);
  }


  // Which way Orion is heading at mission time met
  function travelDirection(met) {

    // Look a little ahead (further ahead when things move slowly)
    const step = met < MET.tli ? 20 : 600;
    const a = mission.positionAt(Math.max(0, met - step));
    const b = mission.positionAt(Math.min(MET.splashdown, met + step));

    return b.sub(a).normalize();
  }


  // ===========================================================================
  // THE CAMERA DIRECTOR
  // ---------------------------------------------------------------------------
  // For each phase, works out a good camera spot, a point to look at, and
  // which way is up. The real camera glides towards them every frame, so
  // changes of view are smooth. Drag and scroll adjust the view.
  // ===========================================================================

  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3() };

  function aimCamera(met) {

    const phase = phaseAt(met).id;
    const pos = mission.positionAt(met);
    const localUp = pos.clone().normalize();
    const N = mission.planeNormal;       // straight "above" the mission's plane
    const X = mission.xAxis;             // from Earth towards the Moon
    const Y = mission.yAxis;
    const halfway = X.clone().multiplyScalar(mission.moonPosition.length() * 0.5);

    if (phase === 'ascent') {

      // Beside the rocket, a little above it, looking at it
      target.look.copy(pos).addScaledVector(localUp, 1.5);
      target.pos.copy(target.look).addScaledVector(N, 22).addScaledVector(localUp, 5);
      target.up.copy(localUp);

    } else if (phase === 'leo') {

      // Following Orion round the Earth, from above and to the side
      target.look.copy(pos);
      target.pos.copy(pos).addScaledVector(N, 70).addScaledVector(localUp, 45);
      target.up.copy(localUp);

    } else if (phase === 'heo') {

      // The whole stretched orbit, seen from above
      target.look.copy(Y).multiplyScalar(500);
      target.pos.copy(target.look).addScaledVector(N, 2900).addScaledVector(Y, -900);
      target.up.copy(Y);

    } else if (phase === 'outbound' || phase === 'return') {

      // The whole Earth-Moon journey: Earth on the left, Moon on the right,
      // drifting a little towards wherever Orion is
      target.look.copy(halfway).lerp(pos, 0.25);
      target.pos.copy(target.look).addScaledVector(N, 7000).addScaledVector(Y, -2600);
      target.up.copy(Y);

    } else if (phase === 'flyby') {

      // Close to the Moon, from the Earth side and above, watching Orion
      // swing round behind it
      target.look.copy(mission.moonPosition).lerp(pos, 0.35);
      target.pos.copy(mission.moonPosition).addScaledVector(X, -560).addScaledVector(N, 300);
      target.up.copy(N);

    } else {

      // Re-entry: following Orion down to the sea
      target.look.copy(pos);
      target.pos.copy(pos).addScaledVector(localUp, 22).addScaledVector(N, 30);
      target.up.copy(localUp);
    }

    // Apply drag (swing round the look point) and scroll (zoom)
    const offset = target.pos.clone().sub(target.look);
    offset.applyAxisAngle(target.up, userYaw).multiplyScalar(userZoom);
    target.pos.copy(target.look).add(offset);
  }


  function updateCamera(met, dt) {

    aimCamera(met);

    if (snapCamera) {

      camera.position.copy(target.pos);
      camLook.copy(target.look);
      camUp.copy(target.up);
      snapCamera = false;

    } else {

      // Glide: cover a share of the remaining distance each frame
      // (the same share per second whatever the frame rate)
      const k = 1 - Math.exp(-dt * 2.5);

      camera.position.lerp(target.pos, k);
      camLook.lerp(target.look, Math.min(1, k * 1.6));
      camUp.lerp(target.up, k).normalize();
    }

    camera.up.copy(camUp);
    camera.lookAt(camLook);
  }


  // Drag to swing the view round; scroll to zoom (only while running)
  let dragX = null;
  const globeEl = document.getElementById('globe');

  globeEl.addEventListener('pointerdown', (e) => {
    if (running) dragX = e.clientX;
  });

  window.addEventListener('pointerup', () => {
    dragX = null;
  });

  globeEl.addEventListener('pointermove', (e) => {
    if (running && dragX !== null) {
      userYaw -= (e.clientX - dragX) * 0.005;
      dragX = e.clientX;
    }
  });

  globeEl.addEventListener('wheel', (e) => {
    if (!running) return;
    e.preventDefault();
    userZoom = Math.min(Math.max(userZoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.2), 4);
  }, { passive: false });


  // ===========================================================================
  // CONTROLS (buttons, timeline and keyboard)
  // ===========================================================================

  function togglePlay() {

    // At the end, "play" starts the replay again
    if (!playing && play >= PLAY_LENGTH) {
      play = 0;
    }

    playing = !playing;
    hud.setPlaying(playing);
  }

  function setSpeed(value) {
    speed = value;
    hud.setSpeed(speed);
  }

  // Jump to a mission time (from the timeline or an event marker)
  function seek(met) {
    play = playFromMet(met);
    if (play < PLAY_LENGTH) hud.setPlaying(playing);
  }

  hud.onPlay = togglePlay;
  hud.onSpeed = setSpeed;
  hud.onSeek = seek;
  hud.onSlide = (value) => { play = value; };
  hud.onExit = stop;


  // Keyboard: Space = play/pause, Esc = close, ← / → = previous / next event
  window.addEventListener('keydown', (e) => {

    if (!running) return;

    if (e.key === 'Escape') {
      stop();
    } else if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {

      const met = metFromPlay(play);
      const next = e.key === 'ArrowRight'
        ? EVENTS.find((ev) => ev.t > met + 1)
        : [...EVENTS].reverse().find((ev) => ev.t < met - 1);

      if (next) seek(next.t);
    }
  });


  return {
    start,
    stop,
    isRunning: () => running,
  };
}


// =============================================================================
// THE MISSION CONTROL DISPLAY (HUD)
// -----------------------------------------------------------------------------
// Built once and hidden until the mission starts. Three parts:
//   - top left:   mission name, clock, date, phase, live numbers, latest event
//   - top right:  the crew
//   - bottom:     play/pause, speed, the scrubbable timeline, and Close
// =============================================================================

function buildHud() {

  const root = document.createElement('div');
  root.className = 'artemis-hud';
  root.hidden = true;

  root.innerHTML = `

    <section class="ah-main" aria-live="off">
      <p class="ah-kicker">Secret mission unlocked</p>
      <h2 class="ah-title">Artemis II</h2>
      <p class="ah-sub">The first crewed flight around the Moon in over 50 years. A replay of 1 to 11 April 2026.</p>

      <div class="ah-clock">
        <span class="ah-met" data-hud="met">Day 0, 00:00:00</span>
        <span class="ah-date" data-hud="date"></span>
      </div>

      <p class="ah-phase" data-hud="phase"></p>

      <dl class="ah-stats">
        <div><dt>From Earth</dt><dd data-hud="earth"></dd></div>
        <div><dt>To the Moon</dt><dd data-hud="moon"></dd></div>
        <div><dt>Speed</dt><dd data-hud="speed"></dd></div>
      </dl>

      <div class="ah-event">
        <b data-hud="event-name"></b>
        <span data-hud="event-detail"></span>
      </div>
    </section>

    <section class="ah-crew">
      <h3>Crew</h3>
      <ul>
        ${CREW.map((c) => `<li><b>${c.name}</b><span>${c.role}</span></li>`).join('')}
      </ul>
    </section>

    <section class="ah-bar">

      <button class="ah-btn" data-hud="play" aria-label="Pause">Pause</button>

      <div class="ah-speeds" role="group" aria-label="Replay speed">
        ${SPEEDS.map((s) => `<button class="ah-btn ah-speed" data-speed="${s}" aria-pressed="false">${s}×</button>`).join('')}
      </div>

      <div class="ah-timeline">
        <input type="range" class="ah-slider" data-hud="slider" min="0" max="${PLAY_LENGTH}" step="0.01" value="0"
               aria-label="Mission timeline">
        <div class="ah-ticks" data-hud="ticks"></div>
      </div>

      <button class="ah-btn ah-close" data-hud="close">Close</button>

    </section>

    <p class="ah-note">
      Replay based on NASA's published Artemis II timeline. Times are approximate and the flight path is an illustration.
      Distances in space are true scale. Drag to look around, scroll to zoom. Space pauses, arrow keys jump between events, Esc closes.
    </p>
  `;

  const el = (name) => root.querySelector(`[data-hud="${name}"]`);

  const hud = {
    root,
    onPlay: null,
    onSpeed: null,
    onSeek: null,
    onSlide: null,
    onExit: null,
  };


  // --- Buttons ---

  el('play').addEventListener('click', () => hud.onPlay?.());
  el('close').addEventListener('click', () => hud.onExit?.());

  root.querySelector('.ah-speeds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed]');
    if (b) hud.onSpeed?.(Number(b.dataset.speed));
  });

  el('slider').addEventListener('input', (e) => hud.onSlide?.(Number(e.target.value)));

  el('ticks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-event]');
    if (b) hud.onSeek?.(EVENTS[Number(b.dataset.event)].t);
  });


  // Event markers along the timeline (click to jump there)
  hud.drawEventTicks = () => {
    el('ticks').innerHTML = EVENTS.map((ev, i) => `
      <button class="ah-tick" data-event="${i}" title="${ev.label}"
              style="left:${(playFromMet(ev.t) / PLAY_LENGTH) * 100}%">
        <span>${ev.label}</span>
      </button>`).join('');
  };


  hud.setPlaying = (playing, ended = false) => {
    el('play').textContent = playing ? 'Pause' : ended ? 'Replay' : 'Play';
    el('play').setAttribute('aria-label', el('play').textContent);
  };


  hud.setSpeed = (speed) => {
    for (const b of root.querySelectorAll('[data-speed]')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
    }
  };


  // --- Number formatting ---

  const two = (n) => String(Math.floor(n)).padStart(2, '0');

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  });

  const km = (n) => `${Math.round(n).toLocaleString()} km`;


  // ---------------------------------------------------------------------------
  // update(met, play, mission): refresh everything for mission time met
  // ---------------------------------------------------------------------------

  hud.update = (met, play, mission) => {

    // Mission clock: "Day 4, 23:48:12"
    const day = Math.floor(met / 86400);
    const rest = met % 86400;
    el('met').textContent = `Day ${day}, ${two(rest / 3600)}:${two((rest % 3600) / 60)}:${two(rest % 60)}`;
    el('date').textContent = `${dateFmt.format(new Date(LAUNCH_DATE.getTime() + met * 1000))} UTC`;

    el('phase').textContent = phaseAt(met).name;

    // Live numbers: real altitude and speed (see artemis-path.js), and the
    // distance to the Moon's surface (positions are in globe units;
    // 1 unit = 63.71 km)
    const pos = mission.positionAt(met);
    const fromEarth = mission.altitudeKm(met);
    const toMoon = Math.max(0, pos.distanceTo(mission.moonPosition) * KM_PER_UNIT - 1737);
    const speed = mission.speedKmS(met);

    el('earth').textContent = km(fromEarth);
    el('moon').textContent = km(toMoon);
    el('speed').textContent = `${speed.toFixed(2)} km/s`;

    // Latest event that has happened
    const latest = [...EVENTS].reverse().find((ev) => ev.t <= met) || EVENTS[0];
    el('event-name').textContent = latest.label;
    el('event-detail').textContent = latest.detail;

    // Timeline position and which markers have been passed
    el('slider').value = play;

    root.querySelectorAll('.ah-tick').forEach((tick, i) => {
      tick.classList.toggle('passed', EVENTS[i].t <= met);
    });
  };

  return hud;
}