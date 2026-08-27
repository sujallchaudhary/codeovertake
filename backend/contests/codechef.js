const axios = require('axios');

const TIMEOUT = 20000;

function mapContest(c) {
  // The *_iso fields already carry the +05:30 offset, so Date parses them exactly.
  const start = new Date(c.contest_start_date_iso);
  const end = new Date(c.contest_end_date_iso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return {
    platform: 'codechef',
    externalId: String(c.contest_code),
    name: c.contest_name,
    url: `https://www.codechef.com/${c.contest_code}`,
    registrationUrl: `https://www.codechef.com/${c.contest_code}`,
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(0, Math.round((end - start) / 1000)),
    contestType: '',
    ratedRange: '',
  };
}

/**
 * CodeChef's own site API. Returns present/future/past buckets; we only take
 * the first two since the calendar back-fills past events from stored data.
 */
async function fetchContests() {
  const res = await axios.get('https://www.codechef.com/api/list/contests/all', {
    timeout: TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CodeOvertake/1.0)',
      Accept: 'application/json',
    },
  });

  const data = res.data;
  if (!data || data.status !== 'success') throw new Error('Unexpected CodeChef response');

  return [...(data.present_contests || []), ...(data.future_contests || [])]
    .map(mapContest)
    .filter(Boolean);
}

module.exports = { key: 'codechef', label: 'CodeChef', fetchContests };
