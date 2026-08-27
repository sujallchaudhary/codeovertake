require('dotenv').config();
const cron = require('node-cron');
const connectDB = require('./config/db');
const app = require('./app');
const { updateAllStudents } = require('./cron/updateData');
const { syncContests } = require('./services/contestService');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

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

  // Warm the contest cache on boot so the calendar is never empty on first load
  syncContests().catch((err) => console.error('[CONTESTS] Initial sync failed:', err.message));
});
