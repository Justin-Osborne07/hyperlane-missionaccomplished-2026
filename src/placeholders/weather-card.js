// =============================================================================
// placeholders/weather-card.js  (temporary, written by Colby)
// -----------------------------------------------------------------------------
// Draws the weather card in the side panel from a `weather` object, so the
// dashboard looks complete while Justin works on the real weather data.
//
// It does NOT fetch or score weather. That's Justin's job, and he doesn't need
// to change anything for this file. When his code is ready:
//   - if he only produces the weather object, pass it to renderWeather() in main.js, or
//   - if he builds his own card, use his instead and delete this file.
//
// Expected weather object (from the team's data contract):
//   { rating: 'green' | 'yellow' | 'red', reasons: ['Gusts 24 kt', ...],
//     windKt, gustKt, cloudPct, precipMm, cape }
// =============================================================================

// Plain-language titles the public will understand, instead of just a colour
const TITLES = { green: 'Good to launch', yellow: 'Marginal', red: 'Likely scrub' };

/**
 * Fill `el` with the weather card for `wx`.
 * The class "wx-green" / "wx-yellow" / "wx-red" sets the dot's colour in style.css.
 */
export function renderWeather(el, wx) {
  el.innerHTML = `
    <div class="wx-status wx-${wx.rating}">
      <span class="wx-dot" aria-hidden="true"></span>
      <span class="wx-title">${TITLES[wx.rating]}</span>
    </div>
    <ul class="wx-reasons">${wx.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
    <div class="wx-stats">
      <div class="wx-stat"><b>${wx.windKt}</b><span>Wind, kt</span></div>
      <div class="wx-stat"><b>${wx.gustKt}</b><span>Gusts, kt</span></div>
      <div class="wx-stat"><b>${wx.cloudPct}%</b><span>Cloud</span></div>
    </div>`;
}