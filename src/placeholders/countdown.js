// =============================================================================
// placeholders/countdown.js  (display by Colby, timing by Yosry)
// -----------------------------------------------------------------------------
// Draws the big countdown in the top-left of the page.
//
// The TIMING comes from Yosry's getCountdown() in launches/countdown.js,
// which works out whether the window is open, closed, or how many days,
// hours, minutes and seconds are left. This file just shows the result,
// once a second.
// =============================================================================


import { getCountdown } from '../launches/countdown.js';


// Turns 7 into "07" so the clock always shows two digits per number
const pad = (n) => String(n).padStart(2, '0');


// -----------------------------------------------------------------------------
// startCountdown(launch, { timeEl, windowEl })
//
//   launch:    a launch object (uses windowStart and windowEnd)
//   timeEl:    the element showing the big "04:12:09" numbers
//   windowEl:  the line under it ("Window opens Sat, Oct 3, 8:15 PM ...")
//
// Returns a function you can call to stop the countdown
// (for example when switching to a different launch).
// -----------------------------------------------------------------------------

export function startCountdown(launch, { timeEl, windowEl }) {

  // Convert the ISO date strings into milliseconds so we can subtract them
  const start = new Date(launch.windowStart).getTime();
  const end = new Date(launch.windowEnd).getTime();


  // Formats dates in the viewer's own language and time zone,
  // e.g. "Sat, Oct 3, 8:15 PM"
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });


  function tick() {

    const now = Date.now();

    // Once the window opens, add the "is-live" class.
    // The CSS then hides the "T−" and turns the text orange.
    timeEl.parentElement.classList.toggle('is-live', now >= start);


    // Yosry's function does the maths
    const countdown = getCountdown(launch.windowStart, launch.windowEnd);


    // --- Before the window opens ---
    if (countdown.status === 'countdown') {

      const { days, hours, minutes, seconds } = countdown;

      // Only show days if there is at least one,
      // e.g. "2d 04:12:09" or just "04:12:09"
      const daysText = days > 0 ? `${days}d ` : '';
      timeEl.textContent = `${daysText}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

      // Window length in minutes
      const lengthMin = Math.round((end - start) / 60000);
      const lengthText = lengthMin > 0 ? `${lengthMin} min long` : 'instantaneous';

      windowEl.textContent = `Window opens ${fmt.format(start)}, ${lengthText}`;
    }


    // --- During the window ---
    else if (countdown.status === 'open') {
      timeEl.textContent = 'Window open';
      windowEl.textContent = `Closes ${fmt.format(end)}`;
    }


    // --- After the window ---
    else {
      timeEl.textContent = 'Window closed';
      windowEl.textContent = `Closed ${fmt.format(end)}`;
    }
  }


  // Show the time immediately...
  tick();

  // ...then update once per second
  const id = setInterval(tick, 1000);

  // Calling this returned function stops the updates
  return () => clearInterval(id);
}