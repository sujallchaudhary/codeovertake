const axios = require('axios');

const TIMEOUT = 20000;

/**
 * Codeforces exposes an official, unauthenticated contest list.
 * phase: BEFORE (upcoming) | CODING (running) | FINISHED
 */
async function fetchContests() {
  const res = await axios.get('https://codeforces.com/api/contest.list?gym=false', {
    timeout: TIMEOUT,
    headers: { 'User-Agent': 'CodeOvertake/1.0' },
  });

  if (res.data?.status !== 'OK' || !Array.isArray(res.data.result)) {
    throw new Error('Unexpected Codeforces response');
  }

  return res.data.result
    .filter((c) => c.phase === 'BEFORE' || c.phase === 'CODING')
    .filter((c) => Number.isFinite(c.startTimeSeconds))
    .map((c) => ({
      platform: 'codeforces',
      externalId: String(c.id),
      name: c.name,
      url: `https://codeforces.com/contests/${c.id}`,
      registrationUrl: `https://codeforces.com/contestRegistration/${c.id}`,
      startTime: new Date(c.startTimeSeconds * 1000),
      endTime: new Date((c.startTimeSeconds + (c.durationSeconds || 0)) * 1000),
      durationSeconds: c.durationSeconds || 0,
      contestType: c.type || '',
      ratedRange: '',
    }));
}

module.exports = { key: 'codeforces', label: 'Codeforces', fetchContests };
