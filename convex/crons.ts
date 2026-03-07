import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run every hour to clean up expired Echoes (older than 24 hours)
crons.interval(
  "cleanup expired echoes",
  { hours: 1 },
  internal.cleanup.deleteExpiredEchoes
);

crons.interval(
  "cleanup stale tts reservations",
  { minutes: 15 },
  internal.ttsUsage.cleanupExpiredReservations
);

export default crons;
