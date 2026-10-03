export async function fetchUpcomingLaunches() {
    const response = await fetch(
        "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json&limit=100"
    );

    const data = await response.json();

    function getInclination(orbitName) {
        if (orbitName === "Polar Orbit") {
            return 90;
        }

        if (orbitName === "Sun-Synchronous Orbit") {
            return 98.1;
        }

        if (orbitName === "Low Earth Orbit") {
            return 45.1;
        }

        return null;
    }

    const launches = data.results.map((i) => {
        return {
            id: i.id,
            name: i.name,
            windowStart: i.window_start,
            windowEnd: i.window_end,
            rocket: i.rocket?.configuration?.full_name,
            pad: {
                name: i.pad?.name,
                lat: i.pad?.latitude,
                lon: i.pad?.longitude
            },
            orbit: i.mission?.orbit?.name,
            inclination: getInclination(i.mission?.orbit?.name)
        };
    });

    return launches;
}