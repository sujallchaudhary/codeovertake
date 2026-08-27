const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 20000;

/** "04:00" / "100:00" -> seconds. AtCoder durations are HH:MM. */
function parseDuration(text) {
  const match = String(text || '').trim().match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

function parseTable($, selector, platformKey) {
  const rows = [];
  $(`${selector} table tbody tr`).each((_i, el) => {
    const cells = $(el).find('td');
    if (cells.length < 3) return;

    // <time class="fixtime">2026-08-29 21:00:00+0900</time> parses directly
    const rawTime = $(cells[0]).find('time').first().text().trim()
      || $(cells[0]).text().trim();
    const start = new Date(rawTime);
    if (Number.isNaN(start.getTime())) return;

    const link = $(cells[1]).find('a').last();
    const href = link.attr('href') || '';
    const slug = href.replace(/^\/contests\//, '').trim();
    const name = link.text().trim();
    if (!slug || !name) return;

    const durationSeconds = parseDuration($(cells[2]).text());

    rows.push({
      platform: platformKey,
      externalId: slug,
      name,
      url: `https://atcoder.jp/contests/${slug}`,
      registrationUrl: `https://atcoder.jp/contests/${slug}`,
      startTime: start,
      endTime: new Date(start.getTime() + durationSeconds * 1000),
      durationSeconds,
      contestType: $(cells[1]).find('span[title]').attr('title') || '',
      ratedRange: cells.length > 3 ? $(cells[3]).text().trim() : '',
    });
  });
  return rows;
}

/**
 * AtCoder has no public contest API, so we scrape the official contest index.
 * Both the "active" and "upcoming" tables are read.
 */
async function fetchContests() {
  const res = await axios.get('https://atcoder.jp/contests/', {
    timeout: TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CodeOvertake/1.0)',
      'Accept-Language': 'en',
    },
  });

  const $ = cheerio.load(res.data);
  const contests = [
    ...parseTable($, '#contest-table-action', 'atcoder'),
    ...parseTable($, '#contest-table-upcoming', 'atcoder'),
  ];

  // De-dupe by slug (a contest can appear in both tables)
  const seen = new Set();
  return contests.filter((c) => {
    if (seen.has(c.externalId)) return false;
    seen.add(c.externalId);
    return true;
  });
}

module.exports = { key: 'atcoder', label: 'AtCoder', fetchContests };
