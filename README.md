Hyperlane

Launch schedules, weather forecasts and viewing information in one dashboard.
We built Hyperlane for the Mission Acomplished hackathon as a team of three second-year Computer Science students. It brings together upcoming launches, weather at the launch site and an interactive globe to help people explore a launch and understand where they might be able to see it.

What it does

- Lists upcoming launches using live launch data.
- Shows the selected mission's launch window and countdown.
- Fetches weather forecasts for the launch location and scheduled time.
- Explains weather ratings using wind gusts, cloud cover, precipitation and atmospheric instability.
- Displays a 3D globe, rocket models and a simulated ascent.
- Shows estimated viewing areas and nearby viewing spots.
- Includes demo controls for exploring different launch sites, rockets and orbits.

Who worked on what

Justin Osborne — Weather and visibility

- Connected the Open-Meteo weather API to launch-site coordinates and launch times.
- Built the weather validation, unit conversion and green/yellow/red scoring logic.
- Added readable explanations for conditions such as strong gusts and high cloud cover.
- Built the initial weather card and mock weather data for testing.
- Added launch-site options and their coordinates.
- Developed the initial visibility calculations using rocket altitude and Earth's curvature.
- Helped integrate the team's files, organize the source folders and fix import paths.

Colby — Dashboard and 3D visualization

- Built the dashboard layout, styling and interactive controls.
- Created the globe visualization and rocket models.
- Added the ascent animation, stage separation and flight timeline.
- Built on the initial visibility calculations to display viewing areas on the globe.
- Added viewing-spot cards, map pins and camera controls.
- Connected the weather results to the dashboard display and visualization.

Yosry — Live launch data
- Built the API module for fetching upcoming launches from The Space Devs.
- Extracted mission names, launch windows and launch-pad coordinates for the dashboard.
- Provided the live launch data used by the upcoming-launch list and countdown.

  Built with

- JavaScript, HTML and CSS
- Vite
- Three.js and Globe.gl
- Open-Meteo weather API
- The Space Devs Launch Library API

Run locally !

Install Node.js, which includes npm. Then run these commands from the project folder:
npm install
npm run dev

Open the local URL printed in the terminal.

Current limits
- Launch schedules and available weather forecasts use live API data. Demo launches are generated locally.
- The ascent currently uses a simulated flight path, rather than a mission-specific trajectory.
- Viewing areas are geometric estimates. Clouds, terrain, daylight and the actual flight path affect what someone can see.
- Weather colours use our demo thresholds and are not official launch-clearance decisions.

Disclaimer!

  AI assistance: We used LLMs for coding assistance, debugging and documentation. Our individual contributions are listed above.
