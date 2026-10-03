// Reject missing, nonnumeric or negative weather readings.
export function scoreWeather(forecast) {
    const fields = ["windKt", "gustKt", "cloudPct", "precipMm", "cape"];
    for (const field of fields) {
        if (!Number.isFinite(forecast?.[field]) || forecast[field] < 0) {
            throw new Error("Missing or invalid weather field: " + field);
        }
    }

    // Validate cloud percentage and start with a green rating.
    if (forecast.cloudPct > 100) throw new Error("Cloud cover must be 0–100");

    const { windKt, gustKt, cloudPct, precipMm, cape } = forecast;
    let rating = "green";
    const reasons = [];

    // Simplified demo thresholds; red takes priority over yellow.
    if (gustKt >= 30 || cape >= 1000 || precipMm >= 5) {
        rating = "red";
    } else if (gustKt >= 20 || cloudPct > 70 || cape >= 300 || precipMm > 0) {
        rating = "yellow";
    }

    // Explain each condition that contributes to the rating.
    if (gustKt >= 30) {
        reasons.push(`Wind gusts above our demo limit (${gustKt} kt)`);
    } else if (gustKt >= 20) {
        reasons.push(`Strong wind gusts could affect launch conditions (${gustKt} kt)`);
    }

    if (cloudPct > 70) {
        reasons.push(`Cloud cover higher than recommended for viewing (${cloudPct}%)`);
    }

    if (cape >= 1000) {
        reasons.push(`High atmospheric instability (${cape} J/kg CAPE)`);
    } else if (cape >= 300) {
        reasons.push(`Elevated atmospheric instability (${cape} J/kg CAPE)`);
    }

    if (precipMm >= 5) {
        reasons.push(`Precipitation above our demo limit (${precipMm} mm in the hour)`);
    } else if (precipMm > 0) {
        reasons.push(`Precipitation forecast near launch time (${precipMm} mm in the hour)`);
    }

    if (reasons.length === 0) {
        reasons.push("Favourable weather within our demo thresholds");
    }

    return { rating, reasons, windKt, gustKt, cloudPct, precipMm, cape };
}

// Fetch and score weather for the launch pad and window start.
// Return null for unusable forecasts; invalid inputs and request errors throw.
export async function getWeather(launch) {
    const lat = launch?.pad?.lat;
    const lon = launch?.pad?.lon;
    const start = launch?.windowStart;

    // Validate latitude and longitude before making a request.
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 ||
        !Number.isFinite(lon) || Math.abs(lon) > 180) {
        throw new Error("Launch pad needs valid numeric lat/lon");
    }

    // Require a date string with an explicit UTC marker or timezone offset.
    if (typeof start !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(start)) {
        throw new Error("windowStart needs an ISO time with Z or a UTC offset");
    }

    // Convert launch time to Unix seconds to match the API timestamps.
    const target = Date.parse(start) / 1000;

    if (!Number.isFinite(target)) throw new Error("Invalid launch time");

    // Request hourly weather at the launch pad using UTC timestamps.
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        hourly: "wind_speed_10m,wind_gusts_10m,cloud_cover,precipitation,cape",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm",
        timeformat: "unixtime",
        timezone: "GMT",
        forecast_days: "16"
    }).toString();

    // Cancel requests that take longer than 10 seconds.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let data;

    // Fetch and parse the forecast; always clear the timeout.
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Weather API returned " + response.status);
        data = await response.json();
    } finally {
        clearTimeout(timer);
    }

    // Read the hourly timestamps, returning null if none are available.
    const hourly = data.hourly;
    const times = hourly?.time;

    if (!Array.isArray(times) || times.length === 0) return null;

    // Return null rather than using a forecast outside the launch time range.
    if (target < times[0] || target > times[times.length - 1]) return null;

    // Find the forecast hour closest to the launch time.
    let nearest = 0;
    for (let i = 1; i < times.length; i++) {
        if (Math.abs(times[i] - target) < Math.abs(times[nearest] - target)) {
            nearest = i;
        }
    }

    // Read wind, gusts, clouds, precipitation and CAPE at the selected hour.
    // Return null if any required reading is invalid.
    const values = [hourly.wind_speed_10m?.[nearest], hourly.wind_gusts_10m?.[nearest],
        hourly.cloud_cover?.[nearest], hourly.precipitation?.[nearest], hourly.cape?.[nearest]];

    if (values.some(value => !Number.isFinite(value) || value < 0)) return null;

    // Convert km/h to knots, rounded to one decimal place, then score the readings.
    const toKnots = value => Math.round(value / 1.852 * 10) / 10;

    return scoreWeather({
        windKt: toKnots(values[0]), gustKt: toKnots(values[1]),
        cloudPct: values[2], precipMm: values[3], cape: values[4]
    });
}