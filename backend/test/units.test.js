/**
 * Pure-function tests. No database, no network, no app boot - so these run in
 * milliseconds and are the first thing to fail when core logic regresses.
 */
process.env.NODE_ENV = 'test';

const { createReporter } = require('./harness');
const { buildOriginChecker } = require('../utils/cors');
const { withDatabase, previewDatabaseName, redactUri } = require('../utils/mongoUri');
const sr = require('../utils/spacedRepetition');
const { parseProblemUrl, normalizeDifficulty } = require('../utils/problemUrl');
const { parseCsvToObjects } = require('../utils/csv');

const { check, section, crash, finish } = createReporter('Units');

/** Promisified cors origin callback. */
function allows(checker, origin) {
  return new Promise((resolve) => checker(origin, (_err, ok) => resolve(ok)));
}

(async () => {
  try {
    /* ------------------------------------------------------------------ cors */
    section('CORS origin rules');

    const checker = buildOriginChecker({
      FRONTEND_URL: 'https://codeovertake.xyz',
      ALLOWED_ORIGINS: 'https://*.vercel.app,https://beta.codeovertake.xyz',
    });

    check('production frontend allowed', await allows(checker, 'https://codeovertake.xyz'));
    check('trailing slash tolerated', await allows(checker, 'https://codeovertake.xyz/'));
    check('extra listed origin allowed', await allows(checker, 'https://beta.codeovertake.xyz'));
    check('wildcard preview host allowed',
      await allows(checker, 'https://co-git-feat-x-team.vercel.app'));
    check('browser extension allowed', await allows(checker, 'chrome-extension://abcdef123'));
    check('firefox extension allowed', await allows(checker, 'moz-extension://abcdef123'));
    check('no Origin header allowed (server-to-server)', await allows(checker, undefined));

    // The wildcard must be a single label, so it cannot be used as a suffix trick
    check('suffix-extension attack rejected',
      (await allows(checker, 'https://evil.vercel.app.attacker.com')) === false);
    check('multi-label subdomain rejected',
      (await allows(checker, 'https://a.b.vercel.app')) === false);
    check('unrelated origin rejected', (await allows(checker, 'https://evil.com')) === false);
    check('http downgrade of the frontend rejected',
      (await allows(checker, 'http://codeovertake.xyz')) === false);

    const noPatterns = buildOriginChecker({ FRONTEND_URL: 'https://x.com' });
    check('previews are not allowed unless configured',
      (await allows(noPatterns, 'https://y.vercel.app')) === false);

    /* -------------------------------------------------------------- mongo uri */
    section('Preview database URIs');

    const atlas = 'mongodb+srv://user:secret@cluster.mongodb.net/prod?retryWrites=true&w=majority';
    const previewUri = withDatabase(atlas, previewDatabaseName(19));
    check('database name is swapped', previewUri.includes('/codeovertake_pr_19'), previewUri);
    check('query options are preserved', previewUri.includes('retryWrites=true&w=majority'));
    check('credentials are preserved', previewUri.includes('user:secret@'));
    check('production database is not referenced', !previewUri.includes('/prod'));

    check('works when the base URI has no database',
      withDatabase('mongodb+srv://u:p@c.mongodb.net/?tls=true', 'codeovertake_pr_7')
        .includes('/codeovertake_pr_7'));
    check('works for a plain mongodb:// URI',
      withDatabase('mongodb://localhost:27017/compare', 'codeovertake_pr_1')
        .includes('/codeovertake_pr_1'));

    check('PR numbers are digits only', (() => {
      try { previewDatabaseName('../../etc'); return false; } catch { return true; }
    })());
    check('illegal database characters are sanitised',
      withDatabase('mongodb://h/x', 'a/b.c$d').endsWith('/a_b_c_d'));
    check('redactUri hides the password', !redactUri(atlas).includes('secret'));

    /* ------------------------------------------------------ spaced repetition */
    section('Spaced repetition maths');

    const now = new Date('2026-01-01T00:00:00Z');
    let state = sr.initialStateOnSolve(now);

    const nailed = [];
    for (let i = 0; i < 5; i += 1) {
      state = sr.scheduleNext(state, 'nailed-it', now);
      nailed.push(state.intervalDays);
    }
    check('confident answers stretch the interval',
      nailed.every((v, i) => i === 0 || v > nailed[i - 1]), nailed.join(','));

    let tough = sr.initialStateOnSolve(now);
    const toughIntervals = [];
    for (let i = 0; i < 5; i += 1) {
      tough = sr.scheduleNext(tough, 'tough', now);
      toughIntervals.push(tough.intervalDays);
    }
    check('"tough" still makes forward progress (no stall)',
      new Set(toughIntervals).size === toughIntervals.length, toughIntervals.join(','));

    const struggled = sr.scheduleNext(
      sr.scheduleNext(sr.initialStateOnSolve(now), 'nailed-it', now), 'struggled', now,
    );
    check('struggling snaps back to tomorrow', struggled.intervalDays === 1);
    check('struggling resets the repetition count', struggled.repetitions === 0);

    const strong = sr.scheduleNext(sr.initialStateOnSolve(now), 'nailed-it', now);
    const weak = sr.scheduleNext(sr.initialStateOnSolve(now), 'struggled', now);
    const day7 = new Date(now.getTime() + 7 * 864e5);
    check('memory decays over time',
      sr.computeMemoryScore(strong, null, day7) < sr.computeMemoryScore(strong, null, now));
    check('a confident answer retains more than a shaky one at day 7',
      sr.computeMemoryScore(strong, null, day7) > sr.computeMemoryScore(weak, null, day7));
    check('freshly rated is 100%', sr.computeMemoryScore(strong, null, now) === 100);
    check('ease factor stays within bounds',
      strong.easeFactor <= 3 && weak.easeFactor >= 1.3, `${strong.easeFactor}/${weak.easeFactor}`);
    check('retention labels map correctly',
      sr.retentionLabel(90) === 'excellent' && sr.retentionLabel(10) === 'at-risk');

    /* ----------------------------------------------------------- problem urls */
    section('Problem URL parsing');

    check('leetcode query params ignored',
      parseProblemUrl('https://leetcode.com/problems/two-sum/description/?envType=x').slug === 'two-sum');
    check('codeforces contest form',
      parseProblemUrl('https://codeforces.com/contest/1234/problem/B').slug === '1234-B');
    check('codeforces problemset form maps to the same slug',
      parseProblemUrl('https://codeforces.com/problemset/problem/1234/B').slug === '1234-B');
    check('code360 keeps its numeric id',
      parseProblemUrl('https://www.naukri.com/code360/problems/ninja_8360968').slug.includes('8360968'));
    check('unknown host falls back to "other"',
      parseProblemUrl('https://example.org/some/problem').platform === 'other');
    check('non-URL input is rejected', parseProblemUrl('not a url at all') === null);
    check('difficulty synonyms normalise',
      normalizeDifficulty('Basic') === 'easy' && normalizeDifficulty('Moderate') === 'medium');

    /* ------------------------------------------------------------------- csv */
    section('CSV import parsing');

    const parsed = parseCsvToObjects(
      'problemUrl,topic,subTopic\n'
      + '"https://leetcode.com/problems/a/","Arrays, 2D","Basics"\n'
      + 'https://leetcode.com/problems/b/,Stack,\n',
    );
    check('header names are normalised', parsed.headers.includes('problemurl'));
    check('two data rows parsed', parsed.rows.length === 2, String(parsed.rows.length));
    check('quoted comma stays in one field', parsed.rows[0].topic === 'Arrays, 2D', parsed.rows[0].topic);
    check('empty trailing field is empty string', parsed.rows[1].subtopic === '');
    check('blank lines are skipped', parseCsvToObjects('a,b\n\n1,2\n').rows.length === 1);
  } catch (err) {
    crash(err);
  } finally {
    process.exit(finish());
  }
})();
