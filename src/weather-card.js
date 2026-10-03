export function renderWeatherCard(container, weather, message = "Forecast not available yet") {
    container.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = "Weather impact";
    container.append(heading);

    if (!weather) {
        const status = document.createElement("p");
        status.textContent = message;
        container.append(status);
        return;
    }

    const colours = { green: "#166534", yellow: "#854d0e", red: "#991b1b" };
    const badge = document.createElement("strong");
    badge.textContent = weather.rating.toUpperCase();
    badge.style.backgroundColor = colours[weather.rating];
    badge.style.color = "white";
    badge.style.padding = "6px 12px";
    badge.style.borderRadius = "6px";
    container.append(badge);

    const reasons = document.createElement("ul");
    for (const reason of weather.reasons) {
        const item = document.createElement("li");
        item.textContent = reason;
        reasons.append(item);
    }
    container.append(reasons);

    const readings = document.createElement("p");
    readings.textContent = `Wind ${weather.windKt} kt | Gusts ${weather.gustKt} kt | Clouds ${weather.cloudPct}%`;
    container.append(readings);

    const note = document.createElement("small");
    note.textContent = "Simplified weather indicator using our demo thresholds.";
    container.append(note);
}