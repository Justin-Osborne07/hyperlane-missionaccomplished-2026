import { mockLaunch, mockTrajectory } from "./mock-data.js";
import { fetchUpcomingLaunches } from "./launch-api.js";

const launches = await fetchUpcomingLaunches();
console.log(launches);
console.log("shpuld have printed")