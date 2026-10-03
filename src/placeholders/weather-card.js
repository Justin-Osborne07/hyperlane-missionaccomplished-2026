// =============================================================================
// placeholders/weather-card.js  (written by Colby)
// -----------------------------------------------------------------------------
// Draws the weather card in the side panel, styled to match the dashboard.
//
// The DATA now comes from Justin's weather.js (getWeather + scoreWeather).
// This file only handles how it looks. Justin also wrote his own card in
// src/weather-card.js (renderWeatherCard); if the team prefers his, swap the
// one line marked in main.js.
//
// Handles three situations:
//   - weather object  -> full card (rating, reasons, stats)
//   - null            -> a message, e.g. "Forecast not available yet"
//   - still loading   -> call renderWeather(el, null, 'Loading forecast…')
//
// Expected weather object (from the team's data contract):
//
//   {
//     rating: 'green' | 'yellow' | 'red',
//     reasons: ['Gusts 24 kt', ...],
//     windKt, gustKt, cloudPct, precipMm, cape
//   }
// =============================================================================


// Plain-language titles the public will understand, instead of just a colour
const TITLES = {
  green: 'Good to launch',
  yellow: 'Marginal',
  red: 'Likely postponed',
};


// -----------------------------------------------------------------------------
// renderWeather(el, wx, message)
//
//   el:       the element to draw the card into
//   wx:       a weather object, or null if there isn't one (yet)
//   message:  what to show when wx is null
//
// The class "wx-green" / "wx-yellow" / "wx-red" sets the dot's colour
// (see the weather card section in style.css).
// -----------------------------------------------------------------------------

export function renderWeather(el, wx, message = 'Forecast not available yet') {

  // --- No weather: show the message instead of a card ---
  if (!wx) {
    el.innerHTML = `<p class="wx-message">${message}</p>`;
    return;
  }


  // One <li> per reason, e.g. "Strong wind gusts could affect launch conditions (24 kt)"
  const reasonsHTML = wx.reasons
    .map((reason) => `<li>${reason}</li>`)
    .join('');


  el.innerHTML = `

    <div class="wx-status wx-${wx.rating}">
      <span class="wx-dot" aria-hidden="true"></span>
      <span class="wx-title">${TITLES[wx.rating]}</span>
    </div>

    <ul class="wx-reasons">
      ${reasonsHTML}
    </ul>

    <div class="wx-stats">

      <div class="wx-stat">
        <b>${wx.windKt}</b>
        <span>Wind, kt</span>
      </div>

      <div class="wx-stat">
        <b>${wx.gustKt}</b>
        <span>Gusts, kt</span>
      </div>

      <div class="wx-stat">
        <b>${wx.cloudPct}%</b>
        <span>Cloud</span>
      </div>

    </div>

    <p class="wx-note">Simplified indicator using our demo thresholds, not official launch rules.</p>
  `;
}