// =============================================================================
// launch-api.js  (Yosry)
// -----------------------------------------------------------------------------
// Gets the next 5 real upcoming launches from Launch Library 2 (The Space Devs).
//
// Lines marked "Added by Colby" pass along a few more fields the dashboard
// needs (rocket name, orbit type, location, status), plus an error check.
// Everything else is Yosry's original code.
// =============================================================================

export async function fetchUpcomingLaunches() {
    const response = await fetch(
        "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json&limit=5"
    );

    // Added by Colby: stop with a clear error if the API refused the request
    // (for example the free plan's limit of 15 requests per hour)
    if (!response.ok) {
        throw new Error("Launch API returned " + response.status);
    }

    const data = await response.json();

    const launches = data.results.map((i) => {
        return {
            id: i.id,
            name: i.name,
            windowStart: i.window_start,
            windowEnd: i.window_end,
            pad: {
                name: i.pad.name,
                lat: i.pad.latitude,
                lon: i.pad.longitude
            },

            // Added by Colby: extra details for the dashboard.
            // ?. and ?? keep things from breaking if a field is missing.
            rocket: i.rocket?.configuration?.name ?? "Unknown rocket",   // e.g. "Falcon 9"
            mission: i.mission?.name ?? i.name,                          // e.g. "Starlink Group 15-25"
            orbitAbbrev: i.mission?.orbit?.abbrev ?? "N/A",              // e.g. "LEO", "PO", "SSO"
            orbitName: i.mission?.orbit?.name ?? "Unknown orbit",        // e.g. "Low Earth Orbit"
            location: i.pad?.location?.name ?? "",                       // e.g. "Cape Canaveral SFS, FL, USA"
            status: i.status?.name ?? ""                                 // e.g. "Go for Launch"
        }
    });
    return launches;
}