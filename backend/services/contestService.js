const Contest = require('../models/Contest');
const Meta = require('../models/Meta');
const { getAllSources, getSourceKeys } = require('../contests');
const httpError = require('../utils/httpError');

const SYNC_META_KEY = 'lastContestSync';
// Contest schedules barely move; refresh at most every 30 minutes on read.
const STALE_MS = 30 * 60 * 1000;

let _syncInFlight = null;

/** Formats a Date as the compact UTC stamp Google Calendar expects. */
function gcalStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Builds a Google Calendar "add event" URL, prefilled with the contest details.
 * Mirrors Codolio's reminder flow: we do not store anything, we just hand the
 * user a link that opens Google Calendar with everything filled in.
 */
function buildGoogleCalendarUrl(contest) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${contest.name} (${contest.platform})`,
    dates: `${gcalStamp(new Date(contest.startTime))}/${gcalStamp(new Date(contest.endTime))}`,
    details: `Contest on ${contest.platform}\n${contest.url}`,
    location: contest.url,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function decorate(doc) {
  const now = Date.now();
  const start = new Date(doc.startTime).getTime();
  const end = new Date(doc.endTime).getTime();
  return {
    ...doc,
    id: String(doc._id),
    status: now < start ? 'upcoming' : now <= end ? 'ongoing' : 'finished',
    googleCalendarUrl: buildGoogleCalendarUrl(doc),
  };
}

/**
 * Pulls fresh schedules from every source and upserts them.
 * Sources are isolated: one failing scraper does not abort the rest.
 * @returns {Promise<{synced:number, perSource:Object, failed:string[]}>}
 */
async function syncContests() {
  const sources = getAllSources();
  const results = await Promise.allSettled(sources.map((s) => s.fetchContests()));

  const ops = [];
  const perSource = {};
  const failed = [];

  results.forEach((result, i) => {
    const source = sources[i];
    if (result.status !== 'fulfilled') {
      failed.push(source.key);
      perSource[source.key] = { count: 0, error: result.reason?.message || 'fetch failed' };
      console.error(`[CONTESTS] ${source.key} sync failed:`, result.reason?.message);
      return;
    }
    perSource[source.key] = { count: result.value.length };
    for (const c of result.value) {
      ops.push({
        updateOne: {
          filter: { platform: c.platform, externalId: c.externalId },
          update: { $set: c },
          upsert: true,
        },
      });
    }
  });

  if (ops.length) {
    await Contest.bulkWrite(ops, { ordered: false });
  }

  await Meta.findOneAndUpdate(
    { key: SYNC_META_KEY },
    { value: new Date().toISOString(), updatedAt: new Date() },
    { upsert: true },
  );

  console.log(`[CONTESTS] Synced ${ops.length} contests (failed sources: ${failed.join(', ') || 'none'})`);
  return { synced: ops.length, perSource, failed };
}

/**
 * Triggers a sync when the stored data is older than STALE_MS.
 * Concurrent callers share one in-flight promise so a traffic spike cannot
 * fan out into N simultaneous scrapes.
 */
async function ensureFresh() {
  const meta = await Meta.findOne({ key: SYNC_META_KEY }).lean();
  const last = meta?.value ? new Date(meta.value).getTime() : 0;
  if (Date.now() - last < STALE_MS) return;

  if (!_syncInFlight) {
    _syncInFlight = syncContests()
      .catch((err) => console.error('[CONTESTS] ensureFresh failed:', err.message))
      .finally(() => { _syncInFlight = null; });
  }
  await _syncInFlight;
}

function parsePlatforms(raw) {
  const valid = new Set(getSourceKeys());
  if (!raw) return null;
  const list = String(raw).split(',').map((s) => s.trim()).filter((s) => valid.has(s));
  return list.length ? list : null;
}

/**
 * Range query used by both the calendar grid and the list panel.
 * @param {{from?:string,to?:string,platforms?:string,status?:string,limit?:number}} query
 */
async function getContests(query = {}) {
  await ensureFresh();

  const filter = {};
  const platforms = parsePlatforms(query.platforms);
  if (platforms) filter.platform = { $in: platforms };

  const now = new Date();
  if (query.from || query.to) {
    // Overlap semantics: include contests that merely intersect the window,
    // so a multi-day contest shows up on every day it spans.
    if (query.from) filter.endTime = { $gte: new Date(query.from) };
    if (query.to) filter.startTime = { $lte: new Date(query.to) };
  }

  if (query.status === 'upcoming') {
    filter.startTime = { ...(filter.startTime || {}), $gt: now };
  } else if (query.status === 'ongoing') {
    filter.startTime = { ...(filter.startTime || {}), $lte: now };
    filter.endTime = { ...(filter.endTime || {}), $gte: now };
  } else if (query.status === 'finished') {
    filter.endTime = { ...(filter.endTime || {}), $lt: now };
  }

  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 300));
  const docs = await Contest.find(filter).sort({ startTime: 1 }).limit(limit).lean();

  return {
    contests: docs.map(decorate),
    platforms: getAllSources().map((s) => ({ key: s.key, label: s.label })),
  };
}

/** Chronological "what's next" panel. */
async function getUpcoming(query = {}) {
  await ensureFresh();

  const filter = { endTime: { $gte: new Date() } };
  const platforms = parsePlatforms(query.platforms);
  if (platforms) filter.platform = { $in: platforms };

  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const docs = await Contest.find(filter).sort({ startTime: 1 }).limit(limit).lean();
  return { contests: docs.map(decorate) };
}

/**
 * Month view: returns the contests plus a `byDate` map keyed YYYY-MM-DD so the
 * frontend can paint the calendar without re-bucketing.
 */
async function getCalendarMonth({ year, month, platforms }) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10); // 1-12
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw httpError(400, 'year and month (1-12) are required');
  }

  // Pad by a week either side so contests bleeding into adjacent months show up
  const from = new Date(Date.UTC(y, m - 1, 1) - 7 * 864e5);
  const to = new Date(Date.UTC(y, m, 1) + 7 * 864e5);

  const { contests } = await getContests({
    from: from.toISOString(),
    to: to.toISOString(),
    platforms,
    limit: 500,
  });

  const byDate = {};
  for (const c of contests) {
    // Bucket every UTC day the contest spans
    const start = new Date(c.startTime);
    const end = new Date(c.endTime);
    const cursor = new Date(Date.UTC(
      start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(),
    ));
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(c.id);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return { year: y, month: m, contests, byDate };
}

async function getContestById(id) {
  const doc = await Contest.findById(id).lean();
  if (!doc) throw httpError(404, 'Contest not found');
  return { contest: decorate(doc) };
}

module.exports = {
  syncContests,
  ensureFresh,
  getContests,
  getUpcoming,
  getCalendarMonth,
  getContestById,
  buildGoogleCalendarUrl,
};
