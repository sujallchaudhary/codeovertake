const Student = require('../models/Student');
const Snapshot = require('../models/Snapshot');
const Meta = require('../models/Meta');
const { getAllPlatforms, calculateTotalScore, buildHasUsernameFilter } = require('../platforms');
const { calculateRankings } = require('../services/rankingService');

const platforms = getAllPlatforms();

// Per-platform concurrency limits based on rate limits:
// GitHub: 5000 req/hr (with token) → generous
// LeetCode: ~20-30 req/min (unofficial GraphQL) → moderate
// Codeforces: ~1 req/2s, official API → strict
// CodeChef: web scraping, no official limit → conservative
const PLATFORM_CONCURRENCY = {
  github: 15,
  leetcode: 5,
  codeforces: 2,
  codechef: 3,
};

const PLATFORM_DELAY_MS = {
  github: 0,
  leetcode: 200,
  codeforces: 1000,
  codechef: 500,
};

const SAVE_BATCH_SIZE = 50;

/**
 * Process a queue of tasks with a concurrency limit and per-task delay.
 */
async function processQueue(tasks, concurrency, delayMs = 0) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (err) {
        results[i] = { status: 'rejected', reason: err };
      }
      if (delayMs > 0 && index < tasks.length) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function updateAllStudents() {
  console.log('[CRON] Starting data update...');
  const startTime = Date.now();

  const students = await Student.find(buildHasUsernameFilter());
  console.log(`[CRON] Found ${students.length} students to update`);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Phase 1: Fetch all platform stats in parallel streams (each platform has its own concurrency)
  // Map: rollno -> { github: stats, leetcode: stats, ... }
  const statsMap = new Map();
  const heatmapMap = new Map();
  const fetchStatusMap = new Map();
  for (const s of students) {
    statsMap.set(s.rollno, {});
    heatmapMap.set(s.rollno, {});
    fetchStatusMap.set(s.rollno, {});
  }

  console.log('[CRON] Fetching platform stats...');
  const platformPromises = platforms.map((platform) => {
    const concurrency = PLATFORM_CONCURRENCY[platform.key] || 3;
    const delay = PLATFORM_DELAY_MS[platform.key] || 0;

    const tasks = students
      .filter((s) => s[platform.key]?.username)
      .map((student) => () =>
        Promise.resolve(
          platform.key === 'codechef' && typeof platform.fetchStatsWithStatus === 'function'
            ? platform.fetchStatsWithStatus(student[platform.key].username)
            : platform.fetchStats(student[platform.key].username),
        )
          .then((result) => {
            if (platform.key === 'codechef' && result && typeof result === 'object' && 'stats' in result) {
              statsMap.get(student.rollno)[platform.key] = result.stats;
              fetchStatusMap.get(student.rollno)[platform.key] = !!result.lastFetchFailed;
              return;
            }
            statsMap.get(student.rollno)[platform.key] = result;
          })
          .catch((err) => {
            console.error(`[CRON] ${platform.key} error for ${student.rollno}:`, err.message);
            statsMap.get(student.rollno)[platform.key] = null;
          })
      );

    console.log(`[CRON]   ${platform.key}: ${tasks.length} users (concurrency: ${concurrency})`);
    return processQueue(tasks, concurrency, delay);
  });

  await Promise.all(platformPromises);

  // Fetch heatmaps for platforms that support it (github, leetcode, codeforces)
  console.log('[CRON] Fetching heatmaps...');
  const heatmapPlatforms = platforms.filter((p) => typeof p.fetchHeatmap === 'function');
  const heatmapPromises = heatmapPlatforms.map((platform) => {
    const concurrency = PLATFORM_CONCURRENCY[platform.key] || 3;
    const delay = PLATFORM_DELAY_MS[platform.key] || 0;

    const tasks = students
      .filter((s) => s[platform.key]?.username)
      .map((student) => () =>
        platform.fetchHeatmap(student[platform.key].username).then((data) => {
          if (data) heatmapMap.get(student.rollno)[platform.key] = data;
        }).catch((err) => {
          console.error(`[CRON] ${platform.key} heatmap error for ${student.rollno}:`, err.message);
        })
      );

    console.log(`[CRON]   ${platform.key} heatmap: ${tasks.length} users`);
    return processQueue(tasks, concurrency, delay);
  });

  await Promise.all(heatmapPromises);

  const fetchElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[CRON] All stats fetched in ${fetchElapsed}s`);

  // Phase 2: Calculate scores and save in batches
  console.log('[CRON] Saving scores and snapshots...');
  for (let i = 0; i < students.length; i += SAVE_BATCH_SIZE) {
    const batch = students.slice(i, i + SAVE_BATCH_SIZE);
    const saveOps = batch.map(async (student) => {
      const fetched = statsMap.get(student.rollno);
      const heatmaps = heatmapMap.get(student.rollno);

      for (const p of platforms) {
        const stats = fetched[p.key];
        if (stats != null) {
          student[p.key].stats = stats;
          student[p.key].lastUpdated = new Date();
        } else if (p.key === 'codechef') {
          student[p.key].lastFetchFailed = !!fetchStatusMap.get(student.rollno)?.codechef;
        }
        if (p.key === 'codechef' && stats != null) {
          student[p.key].lastFetchFailed = false;
        }
        student.scores[p.key] = p.calculateScore(student[p.key].stats);
      }
      student.scores.total = calculateTotalScore(student.scores);

      // Save heatmap data
      for (const key of ['github', 'leetcode', 'codeforces']) {
        if (heatmaps[key]) {
          student.heatmap[key] = heatmaps[key];
        }
      }

      await student.save();

      const snapshotData = { rollno: student.rollno, date: today, scores: student.scores };
      for (const p of platforms) {
        snapshotData[`${p.key}Stats`] = student[p.key].stats;
      }
      await Snapshot.findOneAndUpdate(
        { rollno: student.rollno, date: today },
        snapshotData,
        { upsert: true, new: true }
      );
    });

    await Promise.allSettled(saveOps);
  }

  // Phase 3: Recalculate rankings
  await calculateRankings(today);

  await Meta.findOneAndUpdate(
    { key: 'lastCronRun' },
    { key: 'lastCronRun', value: new Date(), updatedAt: new Date() },
    { upsert: true, new: true }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[CRON] Update completed in ${elapsed}s`);
}

module.exports = { updateAllStudents };
