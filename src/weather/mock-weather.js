import { scoreWeather } from "./weather.js";

export const mockWeather = {
    green: scoreWeather({ windKt: 8, gustKt: 12, cloudPct: 20, precipMm: 0, cape: 50 }),
    yellow: scoreWeather({ windKt: 15, gustKt: 24, cloudPct: 60, precipMm: 0, cape: 100 }),
    red: scoreWeather({ windKt: 25, gustKt: 35, cloudPct: 90, precipMm: 6, cape: 1200 })
};
