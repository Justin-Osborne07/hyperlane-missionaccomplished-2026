// =============================================================================
// placeholders/countdown.js  (temporary, written by Colby)
// -----------------------------------------------------------------------------
// A simple countdown so the dashboard looks complete while Yosry builds his.
//
// It is NOT meant to replace Yosry's work. When his countdown is ready, either:
//   - call his code from main.js instead of startCountdown(), and delete this file, or
//   - keep this display and just feed it his launch data.
// Whichever is easier for him.
//
// What it does: every second, it works out how long until the launch window
// opens and writes it into the big countdown in the top-left of the page.
// =============================================================================


// Turns 7 into "07" so the clock always shows two digits per number
const pad = (n) => String(n).padStart(2, '0');


// Seconds in a day / hour / minute
const DAY = 86400;
const HOUR = 3600;
const MINUTE = 60;


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


    // --- Before the window opens ---
    if (now < start) {

      // Split the remaining seconds into days, hours, minutes, seconds
      let s = Math.floor((start - now) / 1000);

      const d = Math.floor(s / DAY);
      s = s % DAY;

      const h = Math.floor(s / HOUR);
      s = s % HOUR;

      const m = Math.floor(s / MINUTE);
      s = s % MINUTE;

      // Only show days if there is at least one,
      // e.g. "2d 04:12:09" or just "04:12:09"
      const daysText = d > 0 ? `${d}d ` : '';
      timeEl.textContent = `${daysText}${pad(h)}:${pad(m)}:${pad(s)}`;

      // Window length in minutes
      const lengthMin = Math.round((end - start) / 60000);
      const lengthText = lengthMin > 0 ? `${lengthMin} min long` : 'instantaneous';

      windowEl.textContent = `Window opens ${fmt.format(start)}, ${lengthText}`;
    }


    // --- During the window ---
    else if (now <= end) {
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