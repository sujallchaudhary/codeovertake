/**
 * End-to-end coverage of the tracker, sheets, company kits, portfolio and
 * contest surfaces.
 *
 * Hits live platform APIs (LeetCode, Codeforces, GeeksforGeeks, AtCoder) on
 * purpose: the adapters are the part most likely to break silently, and a mocked
 * version of them would prove nothing.
 */
process.env.NODE_ENV = 'test';

const path = require('path');
const { bootstrap, createReporter } = require('./harness');

const BACKEND = path.join(__dirname, '..');

(async () => {
  const { check, section, crash, finish } = createReporter('API features');
  const { api, stop } = await bootstrap();

  let tokenA = null;
  let tokenB = null;

  try {
    /* ------------------------------------------------------------- health */
    section('Health + bootstrap');
    let r = await api('GET', '/health');
    check('GET /health returns ok', r.status === 200 && r.body.status === 'ok', JSON.stringify(r.body));

    // Accounts are Clerk-owned now, so there is no signup endpoint to call.
    // Create the local records the way just-in-time provisioning would, and
    // authenticate with extension pairing tokens.
    const crypto = require('crypto');
    const User = require(`${BACKEND}/models/User`);

    async function makeUser(name, email, handle) {
      const extToken = crypto.randomBytes(24).toString('hex');
      const doc = await User.create({
        clerkUserId: `user_${crypto.randomBytes(8).toString('hex')}`,
        email, verifiedEmails: [email], name, handle, extensionToken: extToken,
      });
      return { doc, token: extToken };
    }

    const a = await makeUser('Alice Dev', 'alice@example.com', 'alice-dev');
    tokenA = a.token;
    const handleA = a.doc.handle;
    const b = await makeUser('Bob Coder', 'bob@example.com', 'bob-coder');
    tokenB = b.token;
    const handleB = b.doc.handle;

    r = await api('GET', '/auth/me', { token: tokenA });
    check('bearer token authenticates', r.status === 200 && r.body.user.email === 'alice@example.com',
      JSON.stringify(r.body).slice(0, 140));
    check('passwordHash is gone from the model', r.body.user.passwordHash === undefined);

    r = await api('GET', '/auth/me');
    check('GET /auth/me without token -> 401', r.status === 401);

    r = await api('GET', '/workspace', { token: 'garbage.token.value' });
    check('invalid token -> 401', r.status === 401);

    /* ------------------------------------------------- problems + workspace */
    section('Problem catalog + workspace');

    r = await api('POST', '/problems/resolve', { body: { url: 'https://leetcode.com/problems/two-sum/description/?envType=x' } });
    check('resolve LeetCode URL -> real metadata',
      r.status === 200 && r.body.problem.title === 'Two Sum' && r.body.problem.difficulty === 'easy',
      JSON.stringify(r.body).slice(0, 200));
    const twoSumId = r.body.problem?._id;
    check('topics fetched', (r.body.problem?.topics || []).includes('Array'));

    r = await api('POST', '/problems/resolve', { body: { url: 'not-a-real-url' } });
    check('unparseable URL -> 400 with field error', r.status === 400 && !!r.body.errors, JSON.stringify(r.body));

    r = await api('POST', '/problems/resolve', { body: { url: 'https://codeforces.com/problemset/problem/4/A' } });
    check('resolve Codeforces URL', r.status === 200 && r.body.problem.title === 'Watermelon', JSON.stringify(r.body).slice(0, 150));

    r = await api('POST', '/problems/resolve', { body: { url: 'https://leetcode.com/problems/two-sum/' } });
    check('URL variants dedupe to one problem', r.body.problem._id === twoSumId);

    r = await api('POST', '/workspace', { token: tokenA, body: { url: 'https://leetcode.com/problems/two-sum/' } });
    check('add question to workspace', r.status === 201 && r.body.created === true, JSON.stringify(r.body).slice(0, 150));
    const qId = r.body.question.id;

    r = await api('POST', '/workspace', { token: tokenA, body: { url: 'https://leetcode.com/problems/two-sum/' } });
    check('re-adding is idempotent (created=false)', r.status === 200 && r.body.created === false);

    r = await api('PUT', `/workspace/${qId}`, { token: tokenA, body: { starred: true, tags: ['Tricky', 'Revise'] } });
    check('star + custom tags saved',
      r.body.question.starred === true && r.body.question.tags.length === 2,
      JSON.stringify(r.body.question).slice(0, 150));

    r = await api('GET', '/workspace/tags', { token: tokenA });
    check('tag facets list custom tags', r.body.tags.some((t) => t.name === 'Tricky'));

    r = await api('PUT', `/workspace/${qId}/status`, { token: tokenA, body: { status: 'solved' } });
    check('mark solved sets solvedAt + schedule',
      r.body.question.status === 'solved' && !!r.body.question.revision.dueAt,
      JSON.stringify(r.body.question.revision));

    r = await api('GET', '/workspace?status=solved&starred=true', { token: tokenA });
    check('filter by status+starred', r.body.questions.length === 1 && r.body.pagination.total === 1);

    r = await api('GET', '/workspace?difficulty=hard', { token: tokenA });
    check('filter by problem difficulty (cross-collection)', r.body.questions.length === 0);

    r = await api('GET', '/workspace?search=two', { token: tokenA });
    check('search by problem title', r.body.questions.length === 1);

    r = await api('GET', '/workspace', { token: tokenB });
    check('workspace is per-user isolated', r.body.pagination.total === 0);

    r = await api('GET', `/workspace/${qId}`, { token: tokenB });
    check("cannot read another user's question -> 404", r.status === 404);

    /* -------------------------------------------------------- linked notes */
    section('Linked notes (write once, see everywhere)');

    r = await api('POST', '/problems/resolve', { body: { url: 'https://leetcode.com/problems/3sum/' } });
    const threeSumId = r.body.problem._id;

    r = await api('POST', '/notes', {
      token: tokenA,
      body: {
        title: 'Two-pointer template',
        content: '```js\nlet l=0,r=n-1;\n```',
        linkedProblems: [twoSumId, threeSumId],
      },
    });
    check('create note linked to 2 problems',
      r.status === 201 && r.body.note.linkedProblems.length === 2,
      JSON.stringify(r.body).slice(0, 200));
    const noteId = r.body.note._id;

    r = await api('GET', `/notes/for-problem/${twoSumId}`, { token: tokenA });
    check('note visible on first linked problem', r.body.notes.length === 1);

    r = await api('GET', `/notes/for-problem/${threeSumId}`, { token: tokenA });
    check('SAME note auto-appears on second linked problem', r.body.notes.length === 1
      && r.body.notes[0].title === 'Two-pointer template');

    r = await api('GET', `/workspace/${qId}`, { token: tokenA });
    check('question detail bundles its linked notes', r.body.notes.length === 1);

    r = await api('GET', '/workspace?search=3sum', { token: tokenA });
    check('linking a note auto-tracks the problem', r.body.questions.length === 1);

    r = await api('POST', '/notes', { token: tokenA, body: { title: 'DP cheat sheet', content: 'general' } });
    check('standalone note has isGeneral=true', r.body.note.isGeneral === true);

    r = await api('GET', '/notes?general=true', { token: tokenA });
    check('filter general notes only', r.body.notes.length === 1 && r.body.notes[0].title === 'DP cheat sheet');

    r = await api('DELETE', `/notes/${noteId}/links/${threeSumId}`, { token: tokenA });
    check('unlink a problem from a note', r.body.note.linkedProblems.length === 1);

    r = await api('GET', `/notes/${noteId}`, { token: tokenB });
    check('notes are per-user isolated -> 404', r.status === 404);

    /* --------------------------------------------------- spaced repetition */
    section('Spaced repetition / daily revision queue');

    r = await api('GET', '/revision/queue', { token: tokenA });
    check('queue locked below 20 solved',
      r.body.locked === true && r.body.remaining > 0,
      JSON.stringify(r.body).slice(0, 150));

    const Problem = require(`${BACKEND}/models/Problem`);
    const seeded = [];
    for (let i = 0; i < 25; i += 1) {
      seeded.push({
        platform: 'leetcode',
        slug: `seed-problem-${i}`,
        title: `Seed Problem ${i}`,
        url: `https://leetcode.com/problems/seed-problem-${i}/`,
        difficulty: ['easy', 'medium', 'hard'][i % 3],
        topics: ['Array'],
      });
    }
    const seededDocs = await Problem.insertMany(seeded);

    for (const doc of seededDocs) {
      // eslint-disable-next-line no-await-in-loop
      const added = await api('POST', '/workspace', { token: tokenA, body: { problemId: String(doc._id) } });
      // eslint-disable-next-line no-await-in-loop
      await api('PUT', `/workspace/${added.body.question.id}/status`, { token: tokenA, body: { status: 'solved' } });
    }

    r = await api('GET', '/workspace/stats', { token: tokenA });
    check('stats count 26 solved', r.body.solved === 26, `solved=${r.body.solved}`);
    check('stats include difficulty split', r.body.difficulty.easy > 0 && r.body.difficulty.hard > 0);
    check('stats include retention block', typeof r.body.retention.rating === 'number');

    r = await api('GET', '/revision/queue', { token: tokenA });
    check('queue unlocks at 20+ solved', r.body.locked === false, JSON.stringify(r.body).slice(0, 150));
    check('queue capped at 5 items', r.body.items.length === 5, `got ${r.body.items?.length}`);
    check('queue exposes the 4 confidence ratings', r.body.ratings.length === 4);
    const firstItem = r.body.items[0];

    const r2 = await api('GET', '/revision/queue', { token: tokenA });
    check('queue is stable across requests (persisted)',
      r2.body.items[0].trackedQuestionId === firstItem.trackedQuestionId);

    r = await api('POST', `/revision/${firstItem.trackedQuestionId}/rate`, { token: tokenA, body: { rating: 'nailed-it' } });
    check('rate nailed-it schedules further out',
      r.status === 200 && r.body.nextReviewInDays >= 3,
      JSON.stringify(r.body).slice(0, 200));

    r = await api('GET', '/revision/queue', { token: tokenA });
    check('rated item marked done in queue', r.body.doneCount === 1);

    r = await api('POST', `/revision/${firstItem.trackedQuestionId}/rate`, { token: tokenA, body: { rating: 'bogus' } });
    check('invalid rating rejected 400', r.status === 400);

    const queue = (await api('GET', '/revision/queue', { token: tokenA })).body;
    for (const item of queue.items.filter((i) => !i.done)) {
      // eslint-disable-next-line no-await-in-loop
      await api('POST', `/revision/${item.trackedQuestionId}/rate`, { token: tokenA, body: { rating: 'got-it' } });
    }
    r = await api('GET', '/revision/queue', { token: tokenA });
    check('finishing all 5 completes the queue', r.body.completed === true);

    r = await api('GET', '/revision/stats', { token: tokenA });
    check('streak becomes 1 after completing queue', r.body.streak === 1, `streak=${r.body.streak}`);
    check('retention rating computed', r.body.retention.rating > 0, `rating=${r.body.retention.rating}`);
    check('retention buckets present', typeof r.body.retention.buckets.strong === 'number');
    check('decay forecast has 5 points', r.body.forecast.length === 5);
    check('forecast decays over time', r.body.forecast[0].rating >= r.body.forecast[4].rating);
    check('revision heatmap keyed by date', Object.keys(r.body.heatmap).length === 1);

    r = await api('GET', '/revision/recent', { token: tokenA });
    check('recent revisions logged', r.body.revisions.length === 5);

    /* ---------------------------------------------------------------- sheets */
    section('Sheets: hierarchy, import, follow, permissions');

    r = await api('POST', '/sheets', { token: tokenA, body: { title: 'My Weak Areas', description: 'DP + graphs', visibility: 'private' } });
    check('create custom sheet', r.status === 201 && r.body.sheet.slug === 'my-weak-areas', JSON.stringify(r.body).slice(0, 200));
    const slug = r.body.sheet.slug;
    check('creator has edit + owner permission', r.body.permissions.canEdit && r.body.permissions.isOwner);

    r = await api('POST', `/sheets/${slug}/sections`, { token: tokenA, body: { title: 'Arrays' } });
    check('add topic', r.status === 201 && r.body.sheet.sections.length === 1);
    const sectionId = r.body.sheet.sections[0].id;

    r = await api('POST', `/sheets/${slug}/sections`, { token: tokenA, body: { title: '2D Arrays', parentSectionId: sectionId } });
    check('add nested subtopic', r.body.sheet.sections[0].subsections.length === 1);
    const subId = r.body.sheet.sections[0].subsections[0].id;

    r = await api('POST', `/sheets/${slug}/questions`, { token: tokenA, body: { problemId: twoSumId, sectionId } });
    check('add question into a topic', r.status === 201 && r.body.sheet.sections[0].questions.length === 1);

    r = await api('POST', `/sheets/${slug}/questions`, { token: tokenA, body: { problemId: twoSumId, sectionId } });
    check('duplicate question in sheet -> 409', r.status === 409);

    r = await api('POST', `/sheets/${slug}/questions`, { token: tokenA, body: { problemId: threeSumId, sectionId, subsectionId: subId } });
    check('add question into a subtopic', r.body.sheet.sections[0].subsections[0].questions.length === 1);

    check('solved status syncs into sheet automatically',
      r.body.sheet.sections[0].questions[0].status === 'solved',
      JSON.stringify(r.body.sheet.sections[0].questions[0]).slice(0, 150));
    check('sheet progress computed', r.body.progress.total === 2 && r.body.progress.solved >= 1,
      JSON.stringify(r.body.progress));

    r = await api('PUT', `/sheets/${slug}/questions/move`, {
      token: tokenA,
      body: {
        problemId: threeSumId, fromSectionId: sectionId, fromSubsectionId: subId, toSectionId: null,
      },
    });
    check('move question between locations',
      r.body.sheet.questions.length === 1 && r.body.sheet.sections[0].subsections[0].questions.length === 0);

    const csv = 'problemUrl,topic,subTopic\n'
      + 'https://leetcode.com/problems/valid-parentheses/,Stack,Basics\n'
      + 'https://codeforces.com/problemset/problem/1/A,Math,\n'
      + 'totally-bogus-url,Stack,Basics\n';
    r = await api('POST', `/sheets/${slug}/import`, { token: tokenA, body: { csv } });
    check('CSV import succeeds', r.status === 200 && r.body.imported === 2, JSON.stringify(r.body).slice(0, 250));
    check('CSV import reports bad rows', r.body.failures.length === 1);
    check('CSV import auto-creates topics', r.body.sheet.sections.some((s) => s.title === 'Stack'));
    check('CSV import auto-creates subtopics',
      r.body.sheet.sections.find((s) => s.title === 'Stack')?.subsections?.[0]?.title === 'Basics');

    r = await api('POST', `/sheets/${slug}/import`, { token: tokenA, body: { csv: 'name,foo\na,b\n' } });
    check('import without problemUrl column -> 400', r.status === 400);

    r = await api('GET', `/sheets/${slug}`, { token: tokenB });
    check('private sheet hidden from others -> 403', r.status === 403);

    r = await api('POST', `/sheets/${slug}/questions`, { token: tokenB, body: { problemId: twoSumId } });
    check('non-collaborator cannot edit -> 403', r.status === 403);

    r = await api('PUT', `/sheets/${slug}`, { token: tokenA, body: { visibility: 'public' } });
    check('owner can publish sheet', r.body.sheet.visibility === 'public');

    r = await api('GET', `/sheets/${slug}`, { token: tokenB });
    check('public sheet now viewable', r.status === 200);
    check('viewer cannot edit, cannot track before following',
      r.body.permissions.canEdit === false && r.body.permissions.canTrack === false);

    const publicProblemId = r.body.sheet.sections[0].questions[0].problem.id;
    r = await api('PUT', `/sheets/${slug}/questions/${publicProblemId}/track`, { token: tokenB, body: { status: 'solved' } });
    check('tracking before following is blocked -> 403', r.status === 403, JSON.stringify(r.body));

    r = await api('POST', `/sheets/${slug}/follow`, { token: tokenB });
    check('follow copies questions into follower workspace',
      r.body.isFollowing === true && r.body.questionsAdded > 0, JSON.stringify(r.body));

    r = await api('PUT', `/sheets/${slug}/questions/${publicProblemId}/track`, { token: tokenB, body: { status: 'solved' } });
    check('tracking works after following', r.status === 200 && r.body.question.status === 'solved');

    r = await api('GET', '/sheets?scope=followed', { token: tokenB });
    check('followed sheets appear under scope=followed', r.body.sheets.length === 1);

    r = await api('GET', '/sheets?scope=explore');
    check('explore lists public sheets anonymously', r.status === 200 && r.body.sheets.length >= 1);

    r = await api('DELETE', `/sheets/${slug}/follow`, { token: tokenB });
    check('unfollow succeeds', r.body.isFollowing === false);
    r = await api('GET', '/workspace?search=two', { token: tokenB });
    check('unfollowing KEEPS solved questions in workspace', r.body.questions.length === 1,
      JSON.stringify(r.body.pagination));

    r = await api('POST', `/sheets/${slug}/collaborators`, { token: tokenA, body: { email: 'bob@example.com' } });
    check('add collaborator by email', r.status === 200 && r.body.collaborators.length === 1);
    r = await api('POST', `/sheets/${slug}/sections`, { token: tokenB, body: { title: 'Added by collaborator' } });
    check('collaborator can now edit', r.status === 201);
    r = await api('PUT', `/sheets/${slug}`, { token: tokenB, body: { title: 'Hijacked' } });
    check('collaborator cannot change settings -> 403', r.status === 403);
    r = await api('DELETE', `/sheets/${slug}`, { token: tokenB });
    check('collaborator cannot delete sheet -> 403', r.status === 403);

    /* -------------------------------------------------------------- contests */
    section('Contest tracker');

    r = await api('GET', '/contests/upcoming?limit=5');
    check('upcoming contests fetched from live sources', r.status === 200 && r.body.contests.length > 0,
      JSON.stringify(r.body).slice(0, 150));
    const contest = r.body.contests[0];
    check('contest has google calendar link',
      (contest.googleCalendarUrl || '').startsWith('https://calendar.google.com/'), contest.googleCalendarUrl);
    check('contest has status', ['upcoming', 'ongoing'].includes(contest.status), contest.status);
    check('contest has registration url', !!contest.registrationUrl);

    const now = new Date();
    r = await api('GET', `/contests/calendar?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`);
    check('calendar month returns byDate buckets',
      r.status === 200 && typeof r.body.byDate === 'object', JSON.stringify(r.body).slice(0, 120));

    r = await api('GET', '/contests?platforms=leetcode');
    check('platform filter works',
      r.status === 200 && r.body.contests.every((c) => c.platform === 'leetcode'),
      `${r.body.contests?.length} contests`);

    r = await api('GET', '/contests/calendar?year=2026');
    check('calendar without month -> 400', r.status === 400);

    /* ------------------------------------------------------- company kits */
    section('Company interview kits');

    r = await api('POST', '/problems/resolve', { body: { url: 'https://www.geeksforgeeks.org/problems/kadanes-algorithm-1587115620/1' } });
    check('GFG problem resolves with difficulty', r.body.problem.difficulty === 'medium', JSON.stringify(r.body).slice(0, 150));
    check('GFG company tags imported automatically', (r.body.problem.companies || []).length > 5,
      `${r.body.problem.companies?.length} companies`);

    r = await api('GET', '/companies');
    check('companies aggregated from problem tags', r.status === 200 && r.body.companies.length > 0,
      `${r.body.companies?.length} companies`);
    check('company kit buckets exposed', r.body.buckets.length === 3);
    const companySlug = r.body.companies[0].slug;

    r = await api('GET', `/companies/${companySlug}`, { token: tokenA });
    check('company kit returns problems', r.status === 200 && r.body.problems.length > 0);
    check('kit has 3 preparation modes with counts', r.body.buckets.length === 3
      && typeof r.body.buckets[0].count === 'number');

    r = await api('GET', '/companies/not-a-real-company-xyz');
    check('unknown company -> 404', r.status === 404);

    /* ---------------------------------------------------------- portfolio */
    section('Portfolio tracker / C-Score');

    r = await api('GET', '/portfolio/platforms');
    check('portfolio platform metadata listed', r.status === 200 && r.body.platforms.length === 7,
      `${r.body.platforms?.length} platforms`);
    check('link-only platforms flagged',
      r.body.platforms.find((p) => p.key === 'geeksforgeeks')?.statsSupported === false);
    check('leaderboard platforms flagged',
      r.body.platforms.find((p) => p.key === 'github')?.countsTowardsLeaderboard === true);
    check('atcoder is portfolio-only',
      r.body.platforms.find((p) => p.key === 'atcoder')?.countsTowardsLeaderboard === false);
    check('verification field surfaced',
      r.body.platforms.find((p) => p.key === 'leetcode')?.verificationField === 'Summary');

    r = await api('PUT', '/portfolio/platforms/atcoder', { token: tokenA, body: { username: 'chokudai' } });
    check('connect AtCoder handle + fetch live stats',
      r.status === 200 && r.body.stats.rating > 0 && r.body.score > 0,
      JSON.stringify(r.body).slice(0, 200));
    check('verification code issued', (r.body.verification?.code || '').startsWith('CODEOVERTAKE-'));

    r = await api('PUT', '/portfolio/platforms/atcoder', { token: tokenA, body: { username: 'definitely-not-real-xyz-999' } });
    check('invalid handle rejected 400', r.status === 400 && !!r.body.errors);

    r = await api('POST', '/portfolio/platforms/atcoder/verify', { token: tokenA });
    check('verify fails when code not on profile', r.status === 400, JSON.stringify(r.body).slice(0, 150));

    r = await api('GET', '/portfolio/platforms/atcoder/verification', { token: tokenA });
    check('verification instructions returned',
      r.body.field === 'Affiliation' && r.body.instructions.includes('Affiliation'));

    r = await api('POST', '/portfolio/projects', {
      token: tokenA,
      body: {
        title: 'CodeOvertake', description: 'Leaderboard', repoUrl: 'https://github.com/x/y', techStack: ['React', 'Node'],
      },
    });
    check('add project', r.status === 201 && r.body.projects.length === 1);
    const projectId = r.body.projects[0]._id;

    r = await api('POST', '/portfolio/projects', { token: tokenA, body: { title: 'Second Project' } });
    check('second project added', r.body.projects.length === 2);
    const project2Id = r.body.projects.find((p) => p.title === 'Second Project')._id;

    r = await api('PUT', '/portfolio/projects/reorder', { token: tokenA, body: { order: [project2Id, projectId] } });
    check('projects reorder persists',
      r.body.projects.find((p) => String(p._id) === String(project2Id)).order === 0);

    r = await api('POST', '/portfolio/education', { token: tokenA, body: { institute: 'NSUT', degree: 'B.Tech', startYear: 2024 } });
    check('add education', r.status === 201 && r.body.education.length === 1);

    r = await api('POST', '/portfolio/education', { token: tokenA, body: {} });
    check('education requires institute -> 400', r.status === 400);

    r = await api('POST', '/portfolio/experience', { token: tokenA, body: { company: 'Acme', role: 'SWE Intern' } });
    check('add experience', r.status === 201 && r.body.experience.length === 1);

    r = await api('GET', `/portfolio/u/${handleA}`);
    check('public portfolio readable anonymously', r.status === 200 && r.body.profile.handle === handleA);
    check('portfolio exposes C-Score', typeof r.body.cScore.total === 'number', JSON.stringify(r.body.cScore));
    check('C-Score cp pillar reflects AtCoder', r.body.cScore.cp > 0, JSON.stringify(r.body.cScore));
    check('portfolio lists connected platforms', r.body.platforms.length === 1);
    check('portfolio lists projects in order', r.body.projects[0].title === 'Second Project');
    check('portfolio includes practice proof', r.body.practice.solved === 26, `solved=${r.body.practice.solved}`);
    check('portfolio includes education + experience',
      r.body.education.length === 1 && r.body.experience.length === 1);
    check('devCard locked until verified', r.body.devCard.unlocked === false);
    check('verification codes never leaked publicly',
      JSON.stringify(r.body).includes('CODEOVERTAKE-') === false);

    r = await api('POST', `/portfolio/u/${handleA}/projects/${projectId}/upvote`, { token: tokenB });
    check('another user can upvote a project', r.body.upvoted === true && r.body.upvotes === 1);
    r = await api('POST', `/portfolio/u/${handleA}/projects/${projectId}/upvote`, { token: tokenB });
    check('upvote toggles off', r.body.upvoted === false && r.body.upvotes === 0);
    r = await api('POST', `/portfolio/u/${handleA}/projects/${projectId}/upvote`, { token: tokenA });
    check('cannot upvote your own project -> 400', r.status === 400);

    r = await api('GET', `/portfolio/u/${handleA}/projects/${projectId}`);
    check('individual shareable project page', r.status === 200 && r.body.project.title === 'CodeOvertake');

    r = await api('POST', '/portfolio/sync', { token: tokenA });
    check('first sync runs', r.body.synced === true, JSON.stringify(r.body).slice(0, 150));

    r = await api('POST', '/portfolio/sync', { token: tokenA });
    check('second sync blocked by 15-minute cooldown',
      r.body.cooldown === true && r.body.retryInSeconds > 0, JSON.stringify(r.body).slice(0, 150));

    r = await api('POST', '/portfolio/sync', { token: tokenA, body: { force: true } });
    check('force sync bypasses cooldown', r.body.synced === true);

    r = await api('GET', '/portfolio/leaderboard');
    check('global leaderboard excludes unverified profiles',
      r.status === 200 && r.body.users.length === 0, JSON.stringify(r.body.pagination));

    r = await api('PUT', '/auth/me', { token: tokenB, body: { isPublic: false } });
    check('profile can be made private', r.body.user.isPublic === false);
    r = await api('GET', `/portfolio/u/${handleB}`);
    check('private profile blocked -> 403', r.status === 403);

    r = await api('DELETE', '/portfolio/platforms/atcoder', { token: tokenA });
    check('deregister platform clears stats', r.body.removed === true && r.body.cScore.cp === 0);

    /* ------------------------------------------------------ workspace delete */
    section('Cleanup semantics');
    r = await api('DELETE', `/workspace/${qId}`, { token: tokenA });
    check('remove question from workspace', r.status === 200);
    r = await api('GET', `/workspace/${qId}`, { token: tokenA });
    check('removed question is gone -> 404', r.status === 404);  } catch (err) {
    crash(err);
  } finally {
    await stop();
    process.exit(finish());
  }
})();
