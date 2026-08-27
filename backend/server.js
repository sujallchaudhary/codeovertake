require('dotenv').config();
const cron = require('node-cron');
const connectDB = require('./config/db');
const app = require('./app');
const { updateAllStudents } = require('./cron/updateData');
const { syncContests } = require('./services/contestService');
const clerkService = require('./services/clerkService');

const PORT = process.env.PORT || 5000;

/**
 * Prints the auth configuration at boot.
 *
 * A signed-in user getting "Authentication required" is almost always an origin
 * or key mismatch rather than a code problem, and neither is visible from the
 * outside. Printing the effective values once makes it a glance instead of an
 * investigation.
 */
function reportAuthConfig() {
  const parties = clerkService.authorizedParties();
  const keys = [
    process.env.CLERK_SECRET_KEY && 'CLERK_SECRET_KEY',
    process.env.CLERK_JWT_KEY && 'CLERK_JWT_KEY',
  ].filter(Boolean);

  if (!keys.length) {
    console.warn(
      '[AUTH] Neither CLERK_SECRET_KEY nor CLERK_JWT_KEY is set. Sign-in will '
      + 'appear to work in the browser, but every authenticated API request will '
      + 'return 401.',
    );
  } else {
    console.log(`[AUTH] Clerk configured via ${keys.join(' + ')}`);
  }

  console.log(`[AUTH] Accepted token origins (azp): ${parties.join(', ')}`);
  console.log(
    '[AUTH] The frontend origin must appear above. If it does not, set '
    + 'FRONTEND_URL or CLERK_AUTHORIZED_PARTIES.',
  );
}

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    reportAuthConfig();
  });

  /**
   * Preview deployments set DISABLE_CRON=true.
   *
   * Every open PR would otherwise run its own copy of the nightly student
   * refresh and the 6-hourly contest sync, so N previews means N times the load
   * on GitHub, LeetCode, Codeforces and CodeChef from one repo. The initial
   * contest sync below still runs, so a preview has a populated calendar to test
   * against.
   */
  if (process.env.DISABLE_CRON === 'true') {
    console.log('Cron scheduling disabled (DISABLE_CRON=true)');
  } else {
    // Schedule cron job (default: 12:00 AM IST = 18:30 UTC)
    const schedule = process.env.CRON_SCHEDULE || '30 18 * * *';
    cron.schedule(schedule, () => {
      console.log('[CRON] Scheduled data update triggered');
      updateAllStudents().catch((err) => console.error('[CRON] Update error:', err));
    });
    console.log(`Cron job scheduled: ${schedule}`);

    // Contest schedules refresh far more often than student stats. Reads also
    // lazily re-sync when data is stale, so this is a safety net rather than the
    // only path that keeps the calendar current.
    const contestSchedule = process.env.CONTEST_CRON_SCHEDULE || '0 */6 * * *';
    cron.schedule(contestSchedule, () => {
      console.log('[CONTESTS] Scheduled contest sync triggered');
      syncContests().catch((err) => console.error('[CONTESTS] Sync error:', err));
    });
    console.log(`Contest sync scheduled: ${contestSchedule}`);
  }

  // Warm the contest cache on boot so the calendar is never empty on first load
  syncContests().catch((err) => console.error('[CONTESTS] Initial sync failed:', err.message));
});
