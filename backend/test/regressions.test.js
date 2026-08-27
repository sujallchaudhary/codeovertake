/**
 * Regression tests for bugs found in review. Each assertion here maps to a
 * specific defect that shipped and was fixed - keep them.
 */
process.env.NODE_ENV = 'test';

const path = require('path');
const { bootstrap, createReporter } = require('./harness');

const BACKEND = path.join(__dirname, '..');

(async () => {
  const { check, section, crash, finish } = createReporter('Regressions');
  const { api, stop } = await bootstrap();

  try {
    const Problem = require(`${BACKEND}/models/Problem`);
    const Sheet = require(`${BACKEND}/models/Sheet`);

    // Clerk owns credentials now: create the local records directly and use
    // extension pairing tokens as the bearer.
    const crypto = require('crypto');
    const User = require(`${BACKEND}/models/User`);
    async function makeUser(name, email, handle) {
      const extToken = crypto.randomBytes(24).toString('hex');
      await User.create({
        clerkUserId: `user_${crypto.randomBytes(8).toString('hex')}`,
        email, verifiedEmails: [email], name, handle, extensionToken: extToken,
      });
      return extToken;
    }
    let r;
    const tokenA = await makeUser('Fix User', 'fix@example.com', 'fix-user');
    const tokenB = await makeUser('Other User', 'other@example.com', 'other-user');

    /* ---------------------------------------------------------------- SSRF */
    console.log('\n\x1b[1m\x1b[36mSSRF hardening\x1b[0m');

    r = await api('POST', '/problems/resolve', { body: { url: 'http://169.254.169.254/latest/meta-data/' } });
    check('cloud metadata URL is not fetched server-side',
      r.status === 200 && r.body.problem.platform === 'other' && r.body.problem.metadataPartial === true,
      JSON.stringify(r.body).slice(0, 200));
    check('unknown-host title is slug-derived, not scraped content',
      !/instance|ami|iam/i.test(r.body.problem?.title || ''), r.body.problem?.title);

    r = await api('POST', '/problems/resolve', { body: { url: 'http://localhost:9999/secret' } });
    check('localhost URL is not fetched', r.status === 200 && r.body.problem.platform === 'other');

    const { isScrapeableUrl } = require(`${BACKEND}/problems/metadata`);
    check('isScrapeableUrl allows a supported host', isScrapeableUrl('https://atcoder.jp/contests/abc100/tasks/abc100_a'));
    check('isScrapeableUrl rejects an arbitrary host', !isScrapeableUrl('https://evil.example.com/x'));
    check('isScrapeableUrl rejects file scheme', !isScrapeableUrl('file:///etc/passwd'));

    /* ------------------------------------------------- metadata staleness */
    console.log('\n\x1b[1m\x1b[36mMetadata staleness + no-downgrade\x1b[0m');

    r = await api('POST', '/problems/resolve', { body: { url: 'https://leetcode.com/problems/two-sum/' } });
    const lcId = r.body.problem._id;
    check('good metadata marked not partial',
      r.body.problem.metadataPartial === false && !!r.body.problem.metadataFetchedAt,
      JSON.stringify(r.body.problem).slice(0, 160));

    // A partial problem must still stamp metadataFetchedAt so it is not re-fetched every hit
    const partial = await Problem.findOne({ platform: 'other' }).lean();
    check('partial problem still stamps metadataFetchedAt (no refetch loop)',
      !!partial?.metadataFetchedAt && partial.metadataPartial === true,
      JSON.stringify(partial).slice(0, 160));

    // Force a partial re-fetch over good data and confirm nothing is downgraded
    await Problem.updateOne({ _id: lcId }, { $set: { slug: 'two-sum', rating: 1234, externalId: '1' } });
    const before = await Problem.findById(lcId).lean();
    // Point it at an unfetchable host so the refresh comes back partial
    await Problem.updateOne({ _id: lcId }, { $set: { platform: 'other', slug: 'evil.example.com/two-sum' } });
    r = await api('POST', '/problems/resolve', { body: { url: 'https://evil.example.com/two-sum', refresh: true } });
    const after = await Problem.findById(lcId).lean();
    check('partial refresh does not clobber a good title',
      after.title === before.title, `${before.title} -> ${after.title}`);
    check('partial refresh does not clobber rating/externalId',
      after.rating === 1234 && after.externalId === '1', `rating=${after.rating} extId=${after.externalId}`);

    /* --------------------------------------------- workspace tag+solve race */
    console.log('\n\x1b[1m\x1b[36mWorkspace: tags survive a simultaneous solve\x1b[0m');

    r = await api('POST', '/workspace', { token: tokenA, body: { url: 'https://leetcode.com/problems/3sum/' } });
    const qId = r.body.question.id;
    // Second call both tags AND marks solved: the extension's main flow
    r = await api('POST', '/workspace', {
      token: tokenA,
      body: { url: 'https://leetcode.com/problems/3sum/', status: 'solved', starred: true, tags: ['Tricky'] },
    });
    check('tags are persisted alongside the solve', (r.body.question.tags || []).includes('Tricky'),
      JSON.stringify(r.body.question).slice(0, 200));
    check('star is persisted alongside the solve', r.body.question.starred === true);
    check('status applied', r.body.question.status === 'solved');

    r = await api('GET', `/workspace/${qId}`, { token: tokenA });
    check('re-read confirms tags were saved', (r.body.question.tags || []).includes('Tricky'));

    /* ------------------------------------------------------- followerCount */
    console.log('\n\x1b[1m\x1b[36mFollower count is derived, not incremented\x1b[0m');

    r = await api('POST', '/sheets', { token: tokenA, body: { title: 'Count Test', visibility: 'public' } });
    const slug = r.body.sheet.slug;

    // Concurrent follows from the same user must not double-count
    await Promise.all([
      api('POST', `/sheets/${slug}/follow`, { token: tokenB }),
      api('POST', `/sheets/${slug}/follow`, { token: tokenB }),
      api('POST', `/sheets/${slug}/follow`, { token: tokenB }),
    ]);
    let sheetDoc = await Sheet.findOne({ slug }).lean();
    check('concurrent follows count once', sheetDoc.followerCount === 1, `got ${sheetDoc.followerCount}`);

    await api('DELETE', `/sheets/${slug}/follow`, { token: tokenB });
    sheetDoc = await Sheet.findOne({ slug }).lean();
    check('unfollow returns count to 0', sheetDoc.followerCount === 0, `got ${sheetDoc.followerCount}`);

    await api('DELETE', `/sheets/${slug}/follow`, { token: tokenB });
    sheetDoc = await Sheet.findOne({ slug }).lean();
    check('repeat unfollow cannot go negative', sheetDoc.followerCount === 0, `got ${sheetDoc.followerCount}`);

    /* --------------------------------------------------- curated protection */
    console.log('\n\x1b[1m\x1b[36mCurated sheets are read-only\x1b[0m');

    await Sheet.create({
      title: 'Seeded', slug: 'seeded-curated', owner: null, isCurated: true,
      visibility: 'public', category: 'popular',
    });
    r = await api('PUT', '/sheets/seeded-curated', { token: tokenA, body: { title: 'Hijack' } });
    check('cannot edit a curated sheet', r.status === 403, `got ${r.status}`);
    r = await api('DELETE', '/sheets/seeded-curated', { token: tokenA });
    check('cannot delete a curated sheet', r.status === 403, `got ${r.status}`);
    r = await api('POST', '/sheets/seeded-curated/questions', { token: tokenA, body: { problemId: lcId } });
    check('cannot add questions to a curated sheet', r.status === 403, `got ${r.status}`);

    /* -------------------------------------------------------- OAuth handover */
    console.log('\n\x1b[1m\x1b[36mHand-rolled OAuth replaced by Clerk\x1b[0m');
    // The redirect_uri validation fix is obsolete: Clerk owns the OAuth dance
    // now, so the endpoint that needed guarding no longer exists.
    r = await api('GET', '/auth/github/url?redirect_uri=https://evil.example.com/steal');
    check('legacy GitHub OAuth endpoint is gone', r.status === 404, `got ${r.status}`);

    /* ------------------------------------------------ company kit frequency */
    console.log('\n\x1b[1m\x1b[36mCompany kit sorts by the requested company\x1b[0m');

    // p1 is low-frequency for acme but high for another company; p2 is high for acme.
    const [p1, p2] = await Problem.insertMany([
      {
        platform: 'leetcode', slug: 'freq-low', title: 'Low For Acme', url: 'https://leetcode.com/problems/freq-low/',
        difficulty: 'easy',
        companies: [
          { name: 'Acme', slug: 'acme', frequency: 1, buckets: ['all-time'] },
          { name: 'Zeta', slug: 'zeta', frequency: 99, buckets: ['all-time'] },
        ],
      },
      {
        platform: 'leetcode', slug: 'freq-high', title: 'High For Acme', url: 'https://leetcode.com/problems/freq-high/',
        difficulty: 'easy',
        companies: [{ name: 'Acme', slug: 'acme', frequency: 50, buckets: ['all-time'] }],
      },
    ]);

    r = await api('GET', '/companies/acme?sortBy=frequency');
    check('kit ranks by this company\'s own frequency',
      r.body.problems[0].title === 'High For Acme',
      r.body.problems.map((p) => `${p.title}(${p.frequency})`).join(', '));
    check('projected frequency is the company\'s, not the max tag',
      r.body.problems.find((p) => p.title === 'Low For Acme')?.frequency === 1,
      JSON.stringify(r.body.problems.map((p) => [p.title, p.frequency])));
    check('pagination total still correct', r.body.pagination.total === 2, `got ${r.body.pagination.total}`);  } catch (err) {
    crash(err);
  } finally {
    await stop();
    process.exit(finish());
  }
})();
