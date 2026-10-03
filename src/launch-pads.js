/*

Our launch site options

- export lets the weather demo import this list
- Each site has an id, display name and coordinates
- Using approximate site locations for weather forecasts
- Canso is first so it becomes the default selection

*/

export const launchPads = [
    {
        id: "canso",
        name: "Canso — Spaceport Nova Scotia, NS",
        lat: 45.3033,
        lon: -60.9823
    },
    {
        id: "cape",
        name: "Cape Canaveral / Kennedy, Florida",
        lat: 28.4667,
        lon: -80.55
    },
    {
        id: "vandenberg",
        name: "Vandenberg, California",
        lat: 34.5833,
        lon: -120.6333
    },
    {
        id: "wallops",
        name: "Wallops Island, Virginia",
        lat: 37.8667,
        lon: -75.45
    }
];