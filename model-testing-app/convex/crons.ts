import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily-brief-trigger",
  { hourUTC: 5, minuteUTC: 0 },
  internal.dailyBriefs.cronTrigger,
);

export default crons;
