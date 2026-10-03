// =============================================================================
// placeholders/countdown.js  (temporary, written by Colby)
// -----------------------------------------------------------------------------
// A simple countdown so the dashboard looks complete while Yosry builds his.
// It is NOT meant to replace Yosry's work. When his countdown is ready, either:
//   - call his code from main.js instead of startCountdown(), and delete this file, or
//   - keep this display and just feed it his launch data.
// Whichever is easier for him.
//
// What it does: every second, it works out how long until the launch window
// opens and writes it into the big countdown in the top-left of the page.
// =============================================================================

// Turns 7 into "07" so the clock always has two digits per number
const pad = (n) => String(n).padStart(2, '0');

/**
 * Start a live countdown for one launch.
 *   launch:   a launch object (uses windowStart and windowEnd)
 *   timeEl:   the element showing the big "04:12:09" numbers
 *   windowEl: the line under it ("Window opens Sat, Oct 3, 8:15 PM...")
 * Returns a function you can call to stop the countdown (e.g. when switching launches).
 */
export function startCountdown(launch, { timeEl, windowEl }) {
  // Convert the ISO date strings into milliseconds so we can subtract them
  const start = new Date(launch.windowStart).getTime();
  const end = new Date(launch.windowEnd).getTime();

  // Formats dates in the viewer's own language and time zone, e.g. "Sat, Oct 3, 8:15 PM"
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  function tick() {
    const now = Date.now();

    // Once the window opens, add the "is-live" class: the CSS hides the "T−"
    // and turns the text orange.
    timeEl.parentElement.classList.toggle('is-live', now >= start);

    if (now < start) {
      // Before the window: split the remaining seconds into days/hours/minutes/seconds
      let s = Math.floor((start - now) / 1000);
      const d = Math.floor(s / 86400); s %= 86400; // 86400 seconds in a day
      const h = Math.floor(s / 3600); s %= 3600;   // 3600 seconds in an hour
      const m = Math.floor(s / 60); s %= 60;
      // Only show days if there is at least one, e.g. "2d 04:12:09" or "04:12:09"
      timeEl.textContent = `${d > 0 ? `${d}d ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`;

      const lengthMin = Math.round((end - start) / 60000); // window length in minutes
      windowEl.textContent = `Window opens ${fmt.format(start)}, ${lengthMin > 0 ? `${lengthMin} min long` : 'instantaneous'}`;
    } else if (now <= end) {
      // During the window
      timeEl.textContent = 'Window open';
      windowEl.textContent = `Closes ${fmt.format(end)}`;
    } else {
      // After the window
      timeEl.textContent = 'Window closed';
      windowEl.textContent = `Closed ${fmt.format(end)}`;
    }
  }

  tick();                               // show the time immediately...
  const id = setInterval(tick, 1000);   // ...then update once per second
  return () => clearInterval(id);       // calling this stops the updates
}