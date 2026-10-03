export async function fetchUpcomingLaunches() {
    const response = await fetch(
        "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json&limit=5"
    );

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
            }
        }
    });
    return launches;
}
