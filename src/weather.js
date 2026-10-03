/*

Creating our function and starting vars

- export allows another JS file to import this function
- Taking weather readings as an object called forecast
- fields lists the readings we need
- The loop checks each reading is a finite number and not negative
- forecast?.[field] safely checks the field even if forecast is missing
- Throw an error if a reading is missing or invalid

*/

export function scoreWeather(forecast) {
    const fields = ["windKt", "gustKt", "cloudPct", "precipMm", "cape"];
    for (const field of fields) {
        if (!Number.isFinite(forecast?.[field]) || forecast[field] < 0) {
            throw new Error("Missing or invalid weather field: " + field);
        }
    }

/*

- Throw an error if cloud cover is over 100%
- Pull the readings from forecast into local constants
- Set the rating to green by default
- Create an empty array to store reasons for the rating

*/

    if (forecast.cloudPct > 100) throw new Error("Cloud cover must be 0–100");

    const { windKt, gustKt, cloudPct, precipMm, cape } = forecast;
    let rating = "green";
    const reasons = [];

/*

- Checking our demo weather thresholds
- Red has priority over yellow because we check it first
- || means any one of these conditions can trigger the rating
- If neither condition matches, the rating stays green
- CAPE measures atmospheric instability in J/kg
- These are simplified thresholds, not official launch rules

*/

    if (gustKt >= 30 || cape >= 1000 || precipMm >= 5) {
        rating = "red";
    } else if (gustKt >= 20 || cloudPct > 70 || cape >= 300 || precipMm > 0) {
        rating = "yellow";
    }

/*

- Adding explanations for readings that cross our thresholds
- push adds a string to the reasons array
- Separate if statements allow multiple reasons
- If no reasons were added, give the default explanation
- Return the rating, reasons and readings as one object

*/

    /*

    Explaining the weather rating

    - Give a readable explanation alongside the actual reading
    - Stronger wording when a reading crosses our red threshold
    - Multiple reasons can appear together

    */

    if (gustKt >= 30) {
        reasons.push(
            `Wind gusts above our demo limit (${gustKt} kt)`
        );
    } else if (gustKt >= 20) {
        reasons.push(
            `Strong wind gusts could affect launch conditions (${gustKt} kt)`
        );
    }

    if (cloudPct > 70) {
        reasons.push(
            `Cloud cover higher than recommended for viewing (${cloudPct}%)`
        );
    }

    if (cape >= 1000) {
        reasons.push(
            `High atmospheric instability (${cape} J/kg CAPE)`
        );
    } else if (cape >= 300) {
        reasons.push(
            `Elevated atmospheric instability (${cape} J/kg CAPE)`
        );
    }

    if (precipMm >= 5) {
        reasons.push(
            `Precipitation above our demo limit (${precipMm} mm in the hour)`
        );
    } else if (precipMm > 0) {
        reasons.push(
            `Precipitation forecast near launch time (${precipMm} mm in the hour)`
        );
    }

    if (reasons.length === 0) {
        reasons.push(
            "Favourable weather within our demo thresholds"
        );
    }

    return { rating, reasons, windKt, gustKt, cloudPct, precipMm, cape };
}

/*

Getting weather for the selected launch

- async allows us to use await for the API request
- Returns the agreed weather object, or null if a forecast is unavailable
- Network/API errors throw so the card can show an error message
- Reading the launch pad location and window start time
- ?. safely accesses properties that might be missing

*/

export async function getWeather(launch) {
    const lat = launch?.pad?.lat;
    const lon = launch?.pad?.lon;
    const start = launch?.windowStart;

/*

- Checking the launch pad has valid numeric coordinates
- Latitude must be between -90 and 90
- Longitude must be between -180 and 180
- Math.abs removes the sign so we can check either direction

*/

    if (!Number.isFinite(lat) || Math.abs(lat) > 90 ||
        !Number.isFinite(lon) || Math.abs(lon) > 180) {
        throw new Error("Launch pad needs valid numeric lat/lon");
    }

/*

- Checking the launch time is a string
- The regular expression checks it ends with Z or an offset like -03:00
- Z means UTC, and an offset gives the difference from UTC
- This makes the intended timezone explicit

*/

    if (typeof start !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(start)) {
        throw new Error("windowStart needs an ISO time with Z or a UTC offset");
    }

/*

- Date.parse converts the launch time to milliseconds since 1 January 1970
- Divide by 1000 to get seconds, matching the API timestamps
- Throw an error if the date could not be parsed

*/

    const target = Date.parse(start) / 1000;

    if (!Number.isFinite(target)) throw new Error("Invalid launch time");

/*

Building the API URL

- Using Open-Meteo's forecast endpoint
- URLSearchParams builds the query parameters for our request
- latitude and longitude come from the selected launch pad
- hourly lists the weather readings we want
- Wind is requested in km/h and precipitation in mm
- unixtime requests timestamps in seconds
- GMT uses UTC for the forecast times
- Requesting 16 forecast days
- toString turns the parameters into text for the URL

*/

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

/*

- AbortController lets us cancel the request
- setTimeout cancels it after 10000 milliseconds, or 10 seconds
- timer stores the timeout ID so we can clear it afterwards
- data will store the API response

*/

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let data;

/*

Sending the API request

- fetch sends the request to the URL we built
- signal connects the request to our cancellation controller
- await waits for the result without blocking the whole page
- response.ok checks whether the HTTP request succeeded
- response.json reads the response into a JavaScript object
- finally clears the timer whether the request succeeds or fails
- Errors pass back to whoever called getWeather

*/

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Weather API returned " + response.status);
        data = await response.json();
    } finally {
        clearTimeout(timer);
    }

/*

- hourly contains the arrays of forecast readings
- times contains the matching hourly timestamps
- Return null if times is missing, not an array, or empty

*/

    const hourly = data.hourly;
    const times = hourly?.time;

    if (!Array.isArray(times) || times.length === 0) return null;

/*

- Checking the launch is inside the returned forecast range
- times[0] is the first forecast time
- times[times.length - 1] is the last forecast time
- Return null instead of using an unrelated forecast

*/

    if (target < times[0] || target > times[times.length - 1]) return null;

/*

Finding the nearest forecast hour

- Start with the first index as our closest match
- Loop through the remaining timestamps
- Math.abs calculates the gap between each timestamp and launch time
- If the gap is smaller, update nearest to that index
- The selected hour can be before or after launch

*/

    let nearest = 0;
    for (let i = 1; i < times.length; i++) {
        if (Math.abs(times[i] - target) < Math.abs(times[nearest] - target)) {
            nearest = i;
        }
    }

/*

- Getting each weather reading at the nearest hour's index
- All the weather arrays use the same indexes as the time array
- Store readings in this order: wind, gusts, clouds, precipitation, CAPE
- some checks whether any reading is invalid
- Return null if any reading is missing, not a finite number, or negative

*/

    const values = [hourly.wind_speed_10m?.[nearest], hourly.wind_gusts_10m?.[nearest],
        hourly.cloud_cover?.[nearest], hourly.precipitation?.[nearest], hourly.cape?.[nearest]];

    if (values.some(value => !Number.isFinite(value) || value < 0)) return null;

/*

Converting wind speeds and returning the scored weather

- toKnots is an arrow function that converts km/h into knots
- Divide by 1.852 because 1 knot equals 1.852 km/h
- Multiply by 10, round, then divide by 10 to keep one decimal place
- Convert wind and gusts, keeping the other readings in their original units
- Pass the readings to scoreWeather to calculate the rating and reasons
- Return the completed weather object

*/

    const toKnots = value => Math.round(value / 1.852 * 10) / 10;

    return scoreWeather({
        windKt: toKnots(values[0]), gustKt: toKnots(values[1]),
        cloudPct: values[2], precipMm: values[3], cape: values[4]
    });
}