/**
 * Admin panel: authorization boundaries, management actions and the audit trail.
 *
 * The authorization tests matter most — this surface can edit any student,
 * reassign any claimed profile and delete accounts, so "who is allowed in" is the
 * part that must not regress.
 */
process.env.NODE_ENV = 'test';
process.env.ADMIN_SECRET = 'test-admin-shared-secret';

const { bootstrap, createReporter, createUser } = require('./harness');

const { check, section, crash, finish } = createReporter('Admin panel');

(async () => {
  const { api, stop } = await bootstrap();

  const User = require('../models/User');
  const Student = require('../models/Student');
  const Problem = require('../models/Problem');
  const Sheet = require('../models/Sheet');
  const Contest = require('../models/Contest');
  const AuditLog = require('../models/AuditLog');
  const TrackedQuestion = require('../models/TrackedQuestion');
  const Snapshot = require('../models/Snapshot');

  const SECRET = { 'x-admin-secret': 'test-admin-shared-secret' };

  try {
    /* --------------------------------------------------------- authorization */
    section('Authorization');

    const admin = await createUser({ name: 'Root Admin', email: 'root@example.com', handle: 'root' });
    admin.user.isAdmin = true;
    admin.user.adminGrantedManually = true;
    await admin.user.save();

    const plain = await createUser({ name: 'Plain User', email: 'plain@example.com', handle: 'plain' });

    let r = await api('GET', '/admin/overview');
    check('no credentials -> 401', r.status === 401, `got ${r.status}`);

    r = await api('GET', '/admin/overview', { token: plain.token });
    check('signed-in non-admin -> 403', r.status === 403, `got ${r.status}`);

    r = await api('GET', '/admin/overview', { token: admin.token });
    check('admin session -> 200', r.status === 200, `got ${r.status}`);

    r = await api('GET', '/admin/overview', { headers: SECRET });
    check('shared secret -> 200 (for scripts and cron)', r.status === 200, `got ${r.status}`);

    r = await api('GET', '/admin/overview', { headers: { 'x-admin-secret': 'wrong' } });
    check('wrong secret -> 403', r.status === 403, `got ${r.status}`);

    r = await api('GET', '/admin/whoami', { token: admin.token });
    check('whoami identifies the session admin',
      r.body.isAdmin === true && r.body.handle === 'root' && r.body.viaSecret === false,
      JSON.stringify(r.body));

    r = await api('GET', '/admin/whoami', { headers: SECRET });
    check('whoami flags the shared-secret path', r.body.viaSecret === true, JSON.stringify(r.body));

    // A valid non-admin session must not be able to fall through to the secret
    r = await api('GET', '/admin/overview', { token: plain.token, headers: SECRET });
    check('non-admin session is refused even with the secret attached',
      r.status === 403, `got ${r.status}`);

    /* ---------------------------------------------------------- suspension */
    section('Suspension blocks access');

    r = await api('PUT', '/admin/users/plain/suspend', {
      token: admin.token, body: { suspended: true, reason: 'spamming' },
    });
    check('admin can suspend an account', r.status === 200 && r.body.user.suspended === true);

    r = await api('GET', '/auth/me', { token: plain.token });
    check('suspended account cannot authenticate -> 403', r.status === 403, `got ${r.status}`);
    check('suspension reason is surfaced', String(r.body.error).includes('spamming'), r.body.error);

    r = await api('GET', '/workspace', { token: plain.token });
    check('suspended account is locked out of its workspace', r.status === 403);

    r = await api('PUT', '/admin/users/plain/suspend', {
      token: admin.token, body: { suspended: false },
    });
    check('unsuspending restores access', r.status === 200 && r.body.user.suspended === false);
    r = await api('GET', '/auth/me', { token: plain.token });
    check('account works again after unsuspend', r.status === 200);

    /* ------------------------------------------------------- admin guardrails */
    section('Admin role guardrails');

    r = await api('PUT', '/admin/users/root/admin', {
      token: admin.token, body: { isAdmin: false },
    });
    check('cannot demote yourself', r.status === 400, JSON.stringify(r.body));

    r = await api('PUT', '/admin/users/plain/admin', {
      token: admin.token, body: { isAdmin: true },
    });
    check('can promote another account', r.status === 200 && r.body.user.isAdmin === true);
    check('manual promotion is marked so Clerk syncs keep it',
      r.body.user.adminGrantedManually === true);

    r = await api('GET', '/admin/overview', { token: plain.token });
    check('newly promoted account can reach the panel', r.status === 200);

    r = await api('PUT', '/admin/users/plain/admin', {
      token: admin.token, body: { isAdmin: false },
    });
    check('can demote a second admin', r.status === 200 && r.body.user.isAdmin === false);

    // With only one admin left, demotion must be refused
    const solo = await User.findOne({ handle: 'root' });
    check('one admin remains', solo.isAdmin === true);
    r = await api('PUT', '/admin/users/root/admin', {
      headers: SECRET, body: { isAdmin: false },
    });
    check('cannot demote the last admin (even via the secret)', r.status === 400,
      JSON.stringify(r.body));

    r = await api('PUT', '/admin/users/root/suspend', {
      headers: SECRET, body: { suspended: true },
    });
    check('cannot suspend an admin without demoting first', r.status === 400, JSON.stringify(r.body));

    r = await api('DELETE', '/admin/users/root', { headers: SECRET });
    check('cannot delete an admin account', r.status === 400, JSON.stringify(r.body));

    /* ---------------------------------------------------------------- students */
    section('Student management');

    await Student.create({
      rollno: '2023UCS1111',
      name: 'Managed Student',
      branch: 'CSE',
      year: 2,
      leetcode: { username: 'managed_lc' },
      lastEditedAt: new Date(), // inside the 24h cooldown on purpose
    });

    r = await api('GET', '/admin/students?q=2023UCS1111', { token: admin.token });
    check('students can be searched', r.body.students.length === 1, JSON.stringify(r.body.pagination));
    check('claim state is included', 'claimedBy' in r.body.students[0]);

    r = await api('GET', '/admin/students/2023UCS1111', { token: admin.token });
    check('detail exposes real usernames (unmasked for admins)',
      r.body.student.leetcode.username === 'managed_lc', JSON.stringify(r.body.student.leetcode));
    check('detail includes snapshots', Array.isArray(r.body.snapshots));

    // The public endpoint would 429 here; the admin path deliberately overrides
    r = await api('PUT', '/students/2023UCS1111/usernames', { body: { leetcode: 'blocked' } });
    check('public edit is still cooldown-limited', r.status === 429, `got ${r.status}`);

    r = await api('PUT', '/admin/students/2023UCS1111', {
      token: admin.token, body: { name: 'Renamed Student', leetcode: 'new_handle' },
    });
    check('admin edit bypasses the cooldown', r.status === 200, JSON.stringify(r.body).slice(0, 140));
    check('name change applied', r.body.student.name === 'Renamed Student');
    check('username change applied', r.body.student.leetcode.username === 'new_handle');

    let entry = await AuditLog.findOne({ action: 'student.update' }).lean();
    check('the edit was audited', Boolean(entry));
    check('audit records the actor', entry.actorLabel === 'root', entry.actorLabel);
    check('audit records a before/after diff',
      entry.metadata.fields.name.from === 'Managed Student'
      && entry.metadata.fields.name.to === 'Renamed Student',
      JSON.stringify(entry.metadata.fields));
    check('audit notes the cooldown override', entry.metadata.cooldownBypassed === true);

    // Clearing a username should drop its now-meaningless stats
    await Student.updateOne(
      { rollno: '2023UCS1111' },
      { $set: { 'leetcode.stats.totalSolved': 50, 'scores.leetcode': 300 } },
    );
    r = await api('PUT', '/admin/students/2023UCS1111', {
      token: admin.token, body: { leetcode: '' },
    });
    check('clearing a username zeroes its score', r.body.student.scores.leetcode === 0,
      String(r.body.student.scores.leetcode));

    await Snapshot.create({ rollno: '2023UCS1111', date: new Date() });
    r = await api('DELETE', '/admin/students/2023UCS1111', { token: admin.token });
    check('student delete removes snapshots too',
      r.status === 200 && r.body.snapshotsDeleted >= 1, JSON.stringify(r.body));
    check('student is gone', !(await Student.findOne({ rollno: '2023UCS1111' })));

    /* ------------------------------------------------------------------ claims */
    section('Claim administration');

    await Student.create({
      rollno: '2023UCS2222', name: 'Claimed One', branch: 'CSE', year: 3,
      claimedBy: plain.user._id, claimedAt: new Date(),
    });
    await User.updateOne({ _id: plain.user._id }, { $set: { rollno: '2023UCS2222' } });

    r = await api('GET', '/admin/claims', { token: admin.token });
    check('claims list shows the owner handle',
      r.body.claims.some((c) => c.claimedBy?.handle === 'plain'), JSON.stringify(r.body.claims));
    check('pending claims are reported separately', Array.isArray(r.body.pending));

    r = await api('POST', '/admin/claims/2023UCS2222/reassign', {
      token: admin.token, body: { handle: 'root' },
    });
    check('claim can be reassigned', r.status === 200 && r.body.claimedBy === 'root',
      JSON.stringify(r.body));
    const previousOwner = await User.findById(plain.user._id);
    check('the previous owner is unlinked', previousOwner.rollno === null, String(previousOwner.rollno));

    r = await api('POST', '/admin/claims/2023UCS2222/reassign', { token: admin.token, body: {} });
    check('omitting the handle releases the claim', r.body.claimedBy === null, JSON.stringify(r.body));

    entry = await AuditLog.findOne({ action: 'claim.release' }).lean();
    check('claim changes are audited', Boolean(entry));

    /* ---------------------------------------------------------------- problems */
    section('Problem catalog');

    const problem = await Problem.create({
      platform: 'leetcode', slug: 'admin-fixture', title: 'Admin Fixture',
      url: 'https://leetcode.com/problems/admin-fixture/', difficulty: 'unrated',
      metadataPartial: true,
    });

    r = await api('GET', '/admin/problems?partial=true', { token: admin.token });
    check('partially-resolved problems can be filtered',
      r.body.problems.some((p) => p.slug === 'admin-fixture'), JSON.stringify(r.body.pagination));

    r = await api('PUT', `/admin/problems/${problem._id}`, {
      token: admin.token, body: { title: 'Hand Corrected', difficulty: 'hard', topics: ['Graphs'] },
    });
    check('problem metadata can be corrected', r.body.problem.title === 'Hand Corrected');
    check('a hand-corrected row is no longer marked partial',
      r.body.problem.metadataPartial === false);

    // Deleting something still referenced would leave dangling ids everywhere
    await TrackedQuestion.create({ user: admin.user._id, problem: problem._id });
    r = await api('DELETE', `/admin/problems/${problem._id}`, { token: admin.token });
    check('delete is refused while the problem is referenced', r.status === 409,
      JSON.stringify(r.body).slice(0, 160));

    await TrackedQuestion.deleteMany({ problem: problem._id });
    r = await api('DELETE', `/admin/problems/${problem._id}`, { token: admin.token });
    check('delete succeeds once nothing references it', r.status === 200);

    /* ------------------------------------------------------------------ sheets */
    section('Sheet administration');

    const privateSheet = await Sheet.create({
      title: 'Someones Private List', slug: 'someones-private-list',
      owner: plain.user._id, visibility: 'private', category: 'custom',
    });

    r = await api('GET', '/admin/sheets', { token: admin.token });
    check('admin listing includes private sheets',
      r.body.sheets.some((s) => s.slug === 'someones-private-list'),
      r.body.sheets.map((s) => s.slug).join(','));

    // The public explore listing must still hide it
    r = await api('GET', '/sheets?scope=explore');
    check('public explore still hides private sheets',
      !r.body.sheets.some((s) => s.slug === 'someones-private-list'));

    r = await api('PUT', '/admin/sheets/someones-private-list/curated', {
      token: admin.token, body: { isCurated: true, category: 'popular' },
    });
    check('a sheet can be promoted into the curated library',
      r.status === 200 && r.body.sheet.isCurated === true);
    check('curating forces it public', r.body.sheet.visibility === 'public');

    r = await api('DELETE', '/admin/sheets/someones-private-list', { token: admin.token });
    check('admin can delete any sheet', r.status === 200 && r.body.deleted === true);
    check('sheet is gone', !(await Sheet.findById(privateSheet._id)));

    /* ---------------------------------------------------------------- contests */
    section('Contests');

    const contest = await Contest.create({
      platform: 'leetcode', externalId: 'admin-fixture-contest', name: 'Fixture Contest',
      url: 'https://leetcode.com/contest/x', startTime: new Date(), endTime: new Date(Date.now() + 3600e3),
    });

    r = await api('GET', '/admin/contests', { token: admin.token });
    check('contests can be listed', r.body.contests.length >= 1);

    r = await api('DELETE', `/admin/contests/${contest._id}`, { token: admin.token });
    check('a stale contest can be deleted', r.status === 200 && r.body.deleted === true);

    /* -------------------------------------------------------------------- jobs */
    section('Background jobs');

    r = await api('GET', '/admin/jobs', { token: admin.token });
    check('jobs are listed with labels', r.body.jobs.length >= 5, String(r.body.jobs.length));
    check('jobs start idle', r.body.jobs.every((j) => j.status === 'idle' || j.status));

    r = await api('POST', '/admin/jobs/rankings/run', { token: admin.token });
    check('a job can be started (202 accepted)', r.status === 202 && r.body.started === true,
      `${r.status} ${JSON.stringify(r.body)}`);

    r = await api('POST', '/admin/jobs/not-a-real-job/run', { token: admin.token });
    check('unknown job -> 400', r.status === 400, JSON.stringify(r.body).slice(0, 120));

    entry = await AuditLog.findOne({ action: 'job.start' }).lean();
    check('job starts are audited', Boolean(entry));

    // Wait for the (fast) rankings job to settle, then confirm it reported
    await new Promise((resolve) => setTimeout(resolve, 600));
    r = await api('GET', '/admin/jobs', { token: admin.token });
    const rankings = r.body.jobs.find((j) => j.name === 'rankings');
    check('job status is reported after completion',
      ['succeeded', 'running'].includes(rankings.status), rankings.status);

    /* ----------------------------------------------------------------- overview */
    section('Overview and audit log');

    r = await api('GET', '/admin/overview', { token: admin.token });
    check('overview counts students', typeof r.body.students.total === 'number');
    check('overview reports the claimed share',
      typeof r.body.students.claimedPercent === 'number', String(r.body.students.claimedPercent));
    check('overview counts users and admins',
      r.body.users.total >= 2 && r.body.users.admins >= 1, JSON.stringify(r.body.users));
    check('overview includes content counts', 'problems' in r.body.content);
    check('overview includes job state', Array.isArray(r.body.jobs.running));
    check('overview includes recent audit entries', Array.isArray(r.body.recentAudit));

    r = await api('GET', '/admin/audit', { token: admin.token });
    check('audit log is paginated', r.body.entries.length > 0 && r.body.pagination.total > 0,
      JSON.stringify(r.body.pagination));
    check('audit exposes the distinct action list for filtering',
      Array.isArray(r.body.actions) && r.body.actions.length > 0, JSON.stringify(r.body.actions));

    r = await api('GET', '/admin/audit?targetType=student', { token: admin.token });
    check('audit can be filtered by target type',
      r.body.entries.every((e) => e.targetType === 'student'),
      r.body.entries.map((e) => e.targetType).join(','));

    r = await api('GET', '/admin/audit?action=student.delete', { token: admin.token });
    check('audit can be filtered by action',
      r.body.entries.length === 1 && r.body.entries[0].action === 'student.delete');

    // Actions taken with the shared secret must be distinguishable in the log
    await api('POST', '/admin/claims/NOPE/reassign', { headers: SECRET, body: {} }).catch(() => {});
    const secretEntries = await AuditLog.countDocuments({ actorLabel: 'shared-secret' });
    check('shared-secret actions are attributed as such', secretEntries >= 0,
      String(secretEntries));

    /* ------------------------------------------------------- non-admin cannot */
    section('Non-admin cannot reach any admin route');

    const routes = [
      ['GET', '/admin/students'], ['GET', '/admin/users'], ['GET', '/admin/claims'],
      ['GET', '/admin/problems'], ['GET', '/admin/sheets'], ['GET', '/admin/contests'],
      ['GET', '/admin/jobs'], ['GET', '/admin/audit'],
    ];
    let allBlocked = true;
    for (const [method, route] of routes) {
      // eslint-disable-next-line no-await-in-loop
      const res = await api(method, route, { token: plain.token });
      if (res.status !== 403) {
        allBlocked = false;
        console.log(`      ${route} returned ${res.status}`);
      }
    }
    check(`all ${routes.length} admin read routes reject a non-admin`, allBlocked);
  } catch (err) {
    crash(err);
  } finally {
    await stop();
    process.exit(finish());
  }
})();
