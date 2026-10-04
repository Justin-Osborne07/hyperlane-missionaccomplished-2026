// =============================================================================
// cockpit.js  (Colby)
// -----------------------------------------------------------------------------
// The "inside the capsule" overlay for Cockpit view. globe.js puts the camera
// inside the rocket looking out a side window; this file draws everything
// around that window, on top of the 3D view:
//
//   - a cabin wall with a round porthole cut out of it
//   - a riveted metal window frame, with a bit of glare on the glass
//   - an instrument panel: altitude + speed dials and event warning lamps
//   - a zero-g indicator: a little plush planet hanging on a string.
//     (Real astronauts bring a small toy for this. While the engines push,
//     it hangs down. When the engines stop in orbit, it floats.)
//
// It's all plain HTML + CSS + SVG, so it costs almost nothing to draw.
// main.js calls update() every animation frame with the latest flight data.
// =============================================================================


// How big the porthole is, as a fraction of the visible area (width, height)
const WINDOW_SIZE = { w: 0.3, h: 0.33 };

// Dial ranges (the green numbers underneath show values beyond these,
// e.g. the top of a GTO orbit at 35,786 km)
const ALT_MAX_KM = 1000;
const SPEED_MAX_KMS = 12;


// =============================================================================
// createCockpit(container)
//   container: the element to add the overlay to (the #app div)
// Returns { setVisible(on), update(data) }
// =============================================================================

export function createCockpit(container) {

  // ---------------------------------------------------------------------------
  // Build the overlay
  // ---------------------------------------------------------------------------

  const root = document.createElement('div');
  root.className = 'cockpit';
  root.hidden = true;

  // aria-hidden: it's decoration; the same flight data is in the timeline
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML = `

    <!-- Cabin wall, with the porthole cut out by a CSS mask -->
    <div class="cockpit-wall"></div>

    <!-- Glass: a soft glare and a dark inner edge for depth -->
    <div class="cockpit-glass"></div>

    <!-- Metal frame around the window (bolts are added below) -->
    <div class="cockpit-frame"></div>

    <!-- Little sign above the window -->
    <div class="cockpit-placard">Port window. Please do not tap the glass.</div>

    <!-- Zero-g indicator: a string with a plush planet on the end -->
    <div class="cockpit-plush">
      <div class="plush-string"></div>
      ${PLUSH_SVG}
    </div>

    <!-- Instrument panel -->
    <div class="cockpit-dash">
      <div class="dash-dials">
        ${dialSVG('alt', 'Altitude')}
        ${dialSVG('speed', 'Speed')}
      </div>
      <div class="dash-readouts">
        <span><b data-readout="alt">0.0</b> km</span>
        <span><b data-readout="speed">0.00</b> km/s</span>
      </div>
      <div class="dash-lamps"></div>
    </div>
  `;

  container.append(root);

  const frame = root.querySelector('.cockpit-frame');
  const plush = root.querySelector('.cockpit-plush');
  const dash = root.querySelector('.cockpit-dash');
  const lampsEl = root.querySelector('.dash-lamps');
  const altNeedle = root.querySelector('[data-needle="alt"]');
  const speedNeedle = root.querySelector('[data-needle="speed"]');
  const altText = root.querySelector('[data-readout="alt"]');
  const speedText = root.querySelector('[data-readout="speed"]');


  // 12 bolts evenly around the frame. Each one is rotated to its angle, then
  // pushed out to the middle of the frame ring (the distance is set in CSS).
  for (let i = 0; i < 12; i++) {
    const bolt = document.createElement('span');
    bolt.className = 'bolt';
    bolt.style.setProperty('--angle', `${i * 30 + 15}deg`);
    frame.append(bolt);
  }


  // ---------------------------------------------------------------------------
  // Sizing: work out the porthole's centre and radius from the overlay's size,
  // and share them with the CSS as variables (--cx, --cy, --r).
  // ---------------------------------------------------------------------------

  function layout() {

    const { width, height } = root.getBoundingClientRect();

    if (width === 0) {
      return; // hidden; we'll lay out again when shown
    }

    const r = Math.min(width * WINDOW_SIZE.w, height * WINDOW_SIZE.h);
    const cx = width / 2;
    const cy = height / 2;

    root.style.setProperty('--cx', `${cx}px`);
    root.style.setProperty('--cy', `${cy}px`);
    root.style.setProperty('--r', `${r}px`);

    // Only show the instrument panel if there's room beside the window
    dash.hidden = width - (cx + r) < 250;
  }

  window.addEventListener('resize', layout);


  // ---------------------------------------------------------------------------
  // Warning lamps: one per flight event. Rebuilt when the rocket changes
  // (different rockets have different event names, e.g. "Hot staging").
  // ---------------------------------------------------------------------------

  let lampEvents = null;
  let lampEls = [];

  function drawLamps(events) {
    lampsEl.innerHTML = events.map((e) => `<span class="lamp">${e.label}</span>`).join('');
    lampEls = [...lampsEl.querySelectorAll('.lamp')];
    lampEvents = events;
  }


  // ---------------------------------------------------------------------------
  // The plush toy's swing, as a simple pendulum.
  //
  //   angle: how far it has swung (degrees, 0 = hanging straight down)
  //   spin:  its speed of swinging
  //
  // Each frame: it's pulled back towards the middle (like gravity), slowed a
  // little (like air resistance), and gets a sudden kick at liftoff and at
  // stage separation. In orbit there's no push from the engines, so it stops
  // hanging and floats upwards, slowly turning.
  // ---------------------------------------------------------------------------

  const toy = {
    angle: 0,
    spin: 0,
    float: 0,      // how far it has floated up, in px
    turn: 0,       // its slow rotation while floating, in degrees
    lastSimT: 0,
    lastTime: performance.now(),
  };

  function updatePlush(simT, sepT, inOrbit) {

    const now = performance.now();
    const dt = Math.min((now - toy.lastTime) / 1000, 0.05); // seconds, capped
    toy.lastTime = now;

    // Liftoff: the animation looped back to the start
    if (simT < toy.lastSimT - 1) {
      toy.spin += 160;
      toy.float = 0;
      toy.turn = 0;
    }

    // Stage separation: the engines cut out for a moment and it lurches
    if (toy.lastSimT < sepT && simT >= sepT) {
      toy.spin -= 220;
    }

    toy.lastSimT = simT;

    if (inOrbit) {

      // Weightless: drift up a little and slowly turn
      toy.float = Math.min(toy.float + dt * 30, 45);
      toy.turn += dt * 25;
      toy.angle *= 0.98;

    } else {

      // Pendulum: pull back to the middle, plus a little friction
      toy.spin += (-toy.angle * 14 - toy.spin * 1.6) * dt;
      toy.angle += toy.spin * dt;

      // Gently fall back down if it had been floating
      toy.float = Math.max(toy.float - dt * 90, 0);
      toy.turn *= 0.9;
    }

    // While floating, the string goes slack (shorter and see-through)
    plush.classList.toggle('is-floating', toy.float > 5);
    plush.style.transform =
      `translate(-50%, ${-toy.float}px) rotate(${toy.angle}deg)`;
    plush.querySelector('svg').style.transform = `rotate(${toy.turn}deg)`;
  }


  // ===========================================================================
  // Public functions
  // ===========================================================================

  return {

    // Show or hide the whole overlay
    setVisible(on) {
      root.hidden = !on;
      if (on) {
        layout();
      }
    },


    // -------------------------------------------------------------------------
    // Called every animation frame while visible.
    //   altKm, speedKmS:  current altitude and speed
    //   simT, tMax:       flight time now, and total flight time (seconds)
    //   events:           the rocket's event list (for the lamps)
    //   sepT:             stage separation time (seconds)
    // -------------------------------------------------------------------------
    update({ altKm, speedKmS, simT, tMax, events, sepT }) {

      if (root.hidden) {
        return;
      }

      // Dials: a needle sweeps 270°, from -135° (zero) to +135° (maximum)
      const needleAngle = (value, max) =>
        -135 + 270 * Math.min(Math.max(value / max, 0), 1);

      altNeedle.style.transform = `rotate(${needleAngle(altKm, ALT_MAX_KM)}deg)`;
      speedNeedle.style.transform = `rotate(${needleAngle(speedKmS, SPEED_MAX_KMS)}deg)`;

      altText.textContent = altKm < 1000 ? altKm.toFixed(1) : Math.round(altKm).toLocaleString();
      speedText.textContent = speedKmS.toFixed(2);

      // Lamps: rebuild if the rocket changed, then light the passed events
      if (events !== lampEvents) {
        drawLamps(events);
      }

      events.forEach((e, i) => {
        lampEls[i].classList.toggle('on', simT >= e.t);
      });

      // The plush toy
      updatePlush(simT, sepT, simT >= tMax);
    },
  };
}


// =============================================================================
// ARTWORK
// =============================================================================

// One round gauge: tick marks around a 270° arc, a label, and a needle.
// The needle points straight up in the drawing; update() rotates it.
function dialSVG(id, label) {

  let ticks = '';

  for (let i = 0; i <= 10; i++) {

    // Spread 11 ticks over 270°, starting bottom-left
    const angle = (-135 + i * 27) * (Math.PI / 180);
    const inner = i % 5 === 0 ? 30 : 34;   // every 5th tick is longer

    const x1 = 50 + Math.sin(angle) * inner;
    const y1 = 50 - Math.cos(angle) * inner;
    const x2 = 50 + Math.sin(angle) * 40;
    const y2 = 50 - Math.cos(angle) * 40;

    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  }

  return `
    <svg class="dial" viewBox="0 0 100 100">
      <circle class="dial-face" cx="50" cy="50" r="46" />
      <g class="dial-ticks">${ticks}</g>
      <text class="dial-label" x="50" y="74" text-anchor="middle">${label}</text>
      <line class="dial-needle" data-needle="${id}" x1="50" y1="52" x2="50" y2="16" />
      <circle class="dial-hub" cx="50" cy="50" r="4" />
    </svg>`;
}


// The zero-g indicator: a small, slightly worried-looking plush planet with a
// ring. The string attaches at the top.
const PLUSH_SVG = `
  <svg class="plush-toy" viewBox="0 0 80 64">

    <!-- back half of the ring (behind the planet) -->
    <ellipse cx="40" cy="36" rx="34" ry="9" fill="none" stroke="#f3c26b" stroke-width="5" opacity="0.9" />

    <!-- the planet -->
    <circle cx="40" cy="32" r="20" fill="#7fb4ff" />
    <circle cx="33" cy="25" r="6" fill="#a9ccff" opacity="0.7" />

    <!-- face -->
    <circle cx="33" cy="32" r="2.6" fill="#1d2433" />
    <circle cx="47" cy="32" r="2.6" fill="#1d2433" />
    <path d="M35 40 q5 4 10 0" fill="none" stroke="#1d2433" stroke-width="2" stroke-linecap="round" />
    <circle cx="28" cy="38" r="2.5" fill="#ff9aa8" opacity="0.6" />
    <circle cx="52" cy="38" r="2.5" fill="#ff9aa8" opacity="0.6" />

    <!-- front half of the ring (in front of the planet) -->
    <path d="M6 36 a34 9 0 0 0 68 0" fill="none" stroke="#f3c26b" stroke-width="5" />

    <!-- loop for the string -->
    <circle cx="40" cy="11" r="3" fill="none" stroke="#d9d4c7" stroke-width="2" />
  </svg>`;