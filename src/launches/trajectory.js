function getDestinationPoint(startLat, startLon, azimuth, distanceKm) {
    const R = 6371;

    const lat1 = startLat * Math.PI / 180;
    const lon1 = startLon * Math.PI / 180;
    const bearing = azimuth * Math.PI / 180;

    const angularDistance = distanceKm / R;

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const lon2 = lon1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
        lat: lat2 * 180 / Math.PI,
        lon: lon2 * 180 / Math.PI
    };
}

export function getLaunchAzimuth(launch) {
    const lat = launch.pad.lat;
    const inc = launch.inclination;
    if (lat == null || inc == null) {
        return null;
    }
    const latRad = lat * Math.PI / 180;
    const incRad = inc * Math.PI / 180;

    // Clamp to the range asin accepts. If the orbit's inclination is lower
    // than the pad's latitude, this gives due east, the closest it can get.
    const value = Math.max(-1, Math.min(1, Math.cos(incRad) / Math.cos(latRad)));

    const azimuthRad = Math.asin(value);
    const azimuth = azimuthRad * 180 / Math.PI;

    // Each inclination can be reached heading north or heading south.
    // Polar and sun-synchronous launches head south, over the ocean.
    return inc > 80 ? 180 - azimuth : azimuth;
}
export function getTrajectory(launch) {
    const trajectory = [];

    const azimuth = getLaunchAzimuth(launch);

    if (azimuth === null) {
        return trajectory;
    }

    const startLat = launch.pad.lat;
    const startLon = launch.pad.lon;

    const totalDistanceKm = 1800;
    const totalPoints = 60;

    for (let i = 0; i < totalPoints; i++) {
        const fraction = i / (totalPoints - 1);

        // Slow at first, then faster, like a real launch
        const distanceKm = totalDistanceKm * Math.pow(fraction, 1.6);

        const point = getDestinationPoint(
            startLat,
            startLon,
            azimuth,
            distanceKm
        );

        // Climbs steeply off the pad, then levels off near orbit
        const altitudeKm = 200 * (1 - Math.pow(1 - fraction, 2.5));

        trajectory.push({
            t: i * 5,
            lat: point.lat,
            lon: point.lon,
            altKm: altitudeKm
        });
    }

    return trajectory;
}