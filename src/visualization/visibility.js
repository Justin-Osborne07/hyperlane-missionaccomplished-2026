// Approximate geometric horizon circles, not guaranteed viewing predictions.

export function getViewingZones(trajectory) {
    const earthRadiusKm = 6371;
    const zones = [];
    const step = Math.max(1, Math.ceil(trajectory.length / 12));
    const indexes = new Set();
    for (let i = 0; i < trajectory.length; i += step) indexes.add(i);
    if (trajectory.length > 0) indexes.add(trajectory.length - 1);

    for (const i of indexes) {
        const point = trajectory[i];
        if (!Number.isFinite(point?.lat) || Math.abs(point.lat) > 90 ||
            !Number.isFinite(point?.lon) || Math.abs(point.lon) > 180 ||
            !Number.isFinite(point?.altKm) || point.altKm <= 0) continue;

        // Surface distance to the horizon on a spherical Earth.
        const radiusKm = earthRadiusKm * Math.acos(
            earthRadiusKm / (earthRadiusKm + point.altKm));

        // Demo shading: higher altitude helps, later trajectory points fade.
        const progress = i / Math.max(1, trajectory.length - 1);
        const altitudeFactor = Math.min(point.altKm / 200, 1);
        const quality = (0.3 + 0.7 * altitudeFactor) * (1 - 0.5 * progress);

        zones.push({ lat: point.lat, lon: point.lon, radiusKm, quality });
    }
    return zones;
}