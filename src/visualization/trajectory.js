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

    const value = Math.cos(incRad) / Math.cos(latRad);

    if (Math.abs(value) > 1) {
        return null;
    }

    const azimuthRad = Math.asin(value);

    return azimuthRad * 180 / Math.PI;
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

        const distanceKm = totalDistanceKm * fraction;

        const point = getDestinationPoint(
            startLat,
            startLon,
            azimuth,
            distanceKm
        );

        const altitudeKm = 200 * fraction;

        trajectory.push({
            t: i * 5,
            lat: point.lat,
            lon: point.lon,
            altKm: altitudeKm
        });
    }

    return trajectory;
}
