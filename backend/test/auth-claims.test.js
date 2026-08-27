/**
 * The Clerk-based auth model and the leaderboard-profile claim flow.
 *
 * CLERK_SECRET_KEY is deliberately left unset here, which also proves that
 * Clerk-shaped tokens are rejected when the instance is not configured.
 */
process.env.NODE_ENV = 'test';
delete process.env.CLERK_SECRET_KEY;
delete process.env.CLERK_JWT_KEY;

const path = require('path');
const crypto = require('crypto');
const { bootstrap, createReporter, createUser } = require('./harness');

const BACKEND = path.join(__dirname, '..');

(async () => {
  const { check, section, crash, finish } = createReporter('Auth + profile claiming');
  const { api, stop } = await bootstrap();

  const User = require('../models/User');
  const Student = require('../models/Student');
  const claimService = require('../services/claimService');
  const makeUser = createUser;

  try {
    /* ------------------------------------------------------------ auth model */
    section('Clerk-based auth model');

    let r = await api('GET', '/health');
    check('app boots with Clerk wired in', r.status === 200 && r.body.status === 'ok');

    r = await api('POST', '/auth/signup', { body: { email: 'a@b.com', password: 'x', name: 'X' } });
    check('POST /auth/signup no longer exists', r.status === 404, `got ${r.status}`);
    r = await api('POST', '/auth/login', { body: { email: 'a@b.com', password: 'x' } });
    check('POST /auth/login no longer exists', r.status === 404, `got ${r.status}`);
    r = await api('PUT', '/auth/password', { body: { newPassword: 'xxxxxxxx' } });
    check('password endpoint gone', r.status === 404, `got ${r.status}`);
    r = await api('GET', '/auth/github/url');
    check('hand-rolled GitHub OAuth endpoint gone', r.status === 404, `got ${r.status}`);

    r = await api('GET', '/auth/config');
    check('GET /auth/config reports Clerk not configured here',
      r.status === 200 && r.body.clerkConfigured === false, JSON.stringify(r.body));

    // A structurally valid but unsigned JWT must not authenticate
    const fakeJwt = `${Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')}.`
      + `${Buffer.from(JSON.stringify({ sub: 'user_fake' })).toString('base64url')}.sig`;
    r = await api('GET', '/auth/me', { token: fakeJwt });
    check('unsigned JWT is rejected', r.status === 401, `got ${r.status}`);

    r = await api('GET', '/auth/me');
    check('no token -> 401', r.status === 401);

    const alice = await makeUser({
      name: 'Alice Dev', email: 'alice@example.com', handle: 'alice-dev',
    });
    r = await api('GET', '/auth/me', { token: alice.token });
    check('extension pairing token still authenticates',
      r.status === 200 && r.body.user.email === 'alice@example.com', JSON.stringify(r.body).slice(0, 120));
    check('clerkUserId is exposed on the account', !!r.body.user.clerkUserId);
    check('passwordHash is gone from the model', r.body.user.passwordHash === undefined);
    check('extensionToken never leaves the server', r.body.user.extensionToken === undefined);
    check('githubAuth carries no access token', r.body.user.githubAuth?.accessToken === undefined);

    /* ------------------------------------------------------- rollno spoofing */
    section('Roll number cannot be self-assigned');

    r = await api('PUT', '/auth/me', { token: alice.token, body: { rollno: '2023UCS9999' } });
    check('PUT /auth/me ignores rollno', r.status === 200 && !r.body.user.rollno,
      `rollno=${r.body.user?.rollno}`);

    r = await api('PUT', '/auth/me', { token: alice.token, body: { headline: 'Hello' } });
    check('other profile fields still save', r.body.user.headline === 'Hello');
    check('editing name sets the override flag', r.body.user.nameOverridden === false);
    r = await api('PUT', '/auth/me', { token: alice.token, body: { name: 'Alice Custom' } });
    check('name edit marks nameOverridden so Clerk syncs stop clobbering it',
      r.body.user.nameOverridden === true && r.body.user.name === 'Alice Custom');

    /* ------------------------------------------------------------- webhooks */
    section('Clerk webhook is signature-gated');

    r = await api('POST', '/webhooks/clerk', {
      raw: JSON.stringify({ type: 'user.deleted', data: { id: alice.user.clerkUserId } }),
    });
    check('unsigned webhook is refused', r.status === 400, `got ${r.status}`);
    check('account survived the forged webhook',
      Boolean(await User.findById(alice.user._id)));

    r = await api('POST', '/webhooks/clerk', {
      raw: JSON.stringify({ type: 'user.updated', data: { id: 'x' } }),
      headers: { 'svix-id': 'msg_1', 'svix-timestamp': '123', 'svix-signature': 'v1,bogus' },
    });
    check('bogus svix signature is refused', r.status === 400, `got ${r.status}`);

    /* ------------------------------------------------------------ claim flow */
    section('Claiming an owner-less leaderboard profile');

    // A legacy record: no owner, carries platform handles
    await Student.create({
      rollno: '2023UCS1234',
      name: 'Alice Dev',
      branch: 'CSE',
      year: 2,
      leetcode: { username: 'alice_lc' },
      github: { username: 'alice-gh' },
    });

    r = await api('GET', '/claims/2023UCS1234');
    check('anonymous status lookup works', r.status === 200 && r.body.claimed === false);
    check('anonymous caller gets no proof options (no handle leakage)',
      r.body.proofOptions.length === 0, JSON.stringify(r.body.proofOptions));

    r = await api('GET', '/claims/2023UCS1234', { token: alice.token });
    check('signed-in caller sees proof options', r.body.proofOptions.length === 2,
      JSON.stringify(r.body.proofOptions));
    const lcOption = r.body.proofOptions.find((o) => o.platform === 'leetcode');
    check('handles are masked in proof options',
      lcOption.maskedUsername.includes('*') && !lcOption.maskedUsername.includes('lice'),
      lcOption.maskedUsername);
    check('proof option names the field to edit', lcOption.verificationField === 'Summary',
      lcOption.verificationField);
    check('nothing is pre-verified yet', lcOption.alreadyVerified === false);

    r = await api('GET', '/claims/NOPE9999', { token: alice.token });
    check('unknown roll number -> 404', r.status === 404);

    // Instant path requires a *verified* matching handle
    r = await api('POST', '/claims/2023UCS1234/claim-verified', {
      token: alice.token, body: { platform: 'leetcode' },
    });
    check('instant claim refused without a verified handle', r.status === 400, JSON.stringify(r.body));

    // Code path
    r = await api('POST', '/claims/2023UCS1234/start', {
      token: alice.token, body: { platform: 'leetcode' },
    });
    check('start issues a one-time code',
      r.status === 200 && String(r.body.code).startsWith('CODEOVERTAKE-CLAIM-'),
      JSON.stringify(r.body).slice(0, 160));
    check('start returns the field to paste into', r.body.field === 'Summary');
    const claimCode = r.body.code;

    r = await api('POST', '/claims/2023UCS1234/start', {
      token: alice.token, body: { platform: 'codeforces' },
    });
    check('cannot start with a platform absent from the record', r.status === 400,
      JSON.stringify(r.body));

    // Verification reads the handle ON THE RECORD, which we cannot satisfy here,
    // so it must fail rather than trust anything the caller sent.
    r = await api('POST', '/claims/2023UCS1234/verify', { token: alice.token });
    check('verify fails while the code is not on the profile',
      r.status === 400 || r.status === 502, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);

    let student = await Student.findOne({ rollno: '2023UCS1234' });
    check('failed verification does not assign ownership', student.claimedBy === null);
    check('failed attempt is counted', student.pendingClaim.attempts >= 1,
      `attempts=${student.pendingClaim.attempts}`);

    // Another user must not be able to hijack an in-flight claim
    const bob = await makeUser({ name: 'Bob', email: 'bob@example.com', handle: 'bob' });
    r = await api('POST', '/claims/2023UCS1234/start', {
      token: bob.token, body: { platform: 'leetcode' },
    });
    check('a second user cannot start while a claim is pending', r.status === 409, `got ${r.status}`);
    r = await api('POST', '/claims/2023UCS1234/verify', { token: bob.token });
    check('another user cannot verify someone else\'s pending claim', r.status === 400,
      JSON.stringify(r.body).slice(0, 120));

    /* --------------------------------------------- instant path, done right */
    section('Instant claim via an already-verified handle');

    const carol = await makeUser({
      name: 'Carol',
      email: 'carol@example.com',
      handle: 'carol',
      platforms: { leetcode: { username: 'carol_lc', verified: true } },
    });
    await Student.create({
      rollno: '2023UCS5678', name: 'Carol', branch: 'CSE', year: 2,
      leetcode: { username: 'carol_lc' },
    });

    r = await api('GET', '/claims/2023UCS5678', { token: carol.token });
    check('matching verified handle is flagged alreadyVerified',
      r.body.proofOptions[0].alreadyVerified === true, JSON.stringify(r.body.proofOptions));

    r = await api('POST', '/claims/2023UCS5678/claim-verified', {
      token: carol.token, body: { platform: 'leetcode' },
    });
    check('instant claim succeeds', r.status === 200 && r.body.claimed === true,
      JSON.stringify(r.body));
    check('method is recorded', r.body.method === 'platform-verified:leetcode', r.body.method);

    r = await api('GET', '/auth/me', { token: carol.token });
    check('roll number is now linked to the account', r.body.user.rollno === '2023UCS5678');
    check('claim timestamp recorded', !!r.body.user.rollnoClaimedAt);

    r = await api('GET', '/claims/2023UCS5678', { token: carol.token });
    check('status reports isMine', r.body.isMine === true && r.body.claimed === true);

    r = await api('GET', '/claims/2023UCS5678', { token: alice.token });
    check('another user sees it as claimed', r.body.claimed === true && r.body.isMine === false);
    check('owner is exposed only as a public handle',
      r.body.claimedBy.handle === 'carol' && r.body.claimedBy.email === undefined);

    r = await api('POST', '/claims/2023UCS5678/claim-verified', {
      token: alice.token, body: { platform: 'leetcode' },
    });
    check('a claimed profile cannot be re-claimed', r.status === 409, `got ${r.status}`);

    // Mismatched handle must not qualify
    const dave = await makeUser({
      name: 'Dave', email: 'dave@example.com', handle: 'dave',
      platforms: { leetcode: { username: 'someone_else', verified: true } },
    });
    await Student.create({
      rollno: '2023UCS4444', name: 'Dave', branch: 'CSE', year: 2,
      leetcode: { username: 'dave_lc' },
    });
    r = await api('POST', '/claims/2023UCS4444/claim-verified', {
      token: dave.token, body: { platform: 'leetcode' },
    });
    check('verified handle that does not match the record is refused', r.status === 400,
      JSON.stringify(r.body).slice(0, 140));

    /* ----------------------------------------------------- progressive lockdown */
    section('Progressive lockdown of username edits');

    // Unclaimed: still editable anonymously (original behaviour preserved)
    await Student.create({
      rollno: '2023UCS0000', name: 'Legacy Student', branch: 'CSE', year: 2,
      github: { username: 'octocat' },
    });
    r = await api('PUT', '/students/2023UCS0000/usernames', { body: { github: 'octocat' } });
    check('unclaimed record is still editable without an account',
      r.status === 200 || r.status === 400,
      `got ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);

    // Claimed: only the owner
    r = await api('PUT', '/students/2023UCS5678/usernames', { body: { leetcode: 'hijacked' } });
    check('claimed record rejects anonymous edits with 403', r.status === 403,
      `${r.status} ${JSON.stringify(r.body)}`);

    r = await api('PUT', '/students/2023UCS5678/usernames', {
      token: alice.token, body: { leetcode: 'hijacked' },
    });
    check('claimed record rejects a different account with 403', r.status === 403, `got ${r.status}`);

    r = await api('POST', '/students/2023UCS5678/restore', {
      token: alice.token, body: { index: 0 },
    });
    check('restore is gated by ownership too', r.status === 403, `got ${r.status}`);

    student = await Student.findOne({ rollno: '2023UCS5678' });
    check('hijack attempts left the record untouched',
      student.leetcode.username === 'carol_lc', student.leetcode.username);

    // Owner bypasses the 24h cooldown
    await Student.updateOne({ rollno: '2023UCS5678' }, { $set: { lastEditedAt: new Date() } });
    const access = claimService.assertCanEditStudent(
      await Student.findOne({ rollno: '2023UCS5678' }), carol.user,
    );
    check('owner access is reported as "owner" (cooldown skipped)', access === 'owner', access);
    const openAccess = claimService.assertCanEditStudent(
      await Student.findOne({ rollno: '2023UCS0000' }), null,
    );
    check('unclaimed access is reported as "open" (cooldown applies)', openAccess === 'open', openAccess);

    /* ------------------------------------------------------------- release */
    section('Releasing and reassigning');

    r = await api('DELETE', '/claims/2023UCS5678', { token: alice.token });
    check('non-owner cannot release', r.status === 403, `got ${r.status}`);

    r = await api('DELETE', '/claims/2023UCS5678', { token: carol.token });
    check('owner can release', r.status === 200 && r.body.released === true);

    r = await api('GET', '/auth/me', { token: carol.token });
    check('release unlinks the roll number from the account', !r.body.user.rollno);

    r = await api('PUT', '/students/2023UCS5678/usernames', { body: { leetcode: 'carol_lc' } });
    check('released record is openly editable again', r.status !== 403, `got ${r.status}`);

    // Admin reassignment
    process.env.ADMIN_SECRET = 'test-admin-secret';
    r = await api('POST', '/claims/2023UCS5678/admin-reassign', {
      body: { handle: 'carol' },
      headers: { 'x-admin-secret': 'test-admin-secret' },
    });
    check('admin can assign a profile to a handle',
      r.status === 200 && r.body.claimedBy === 'carol', JSON.stringify(r.body));

    /*
     * No credentials at all is 401, a wrong credential is 403. The middleware
     * used to answer 403 for both; separating them is deliberate, because "you
     * did not authenticate" and "you authenticated and still may not" need
     * different fixes on the caller's side.
     */
    r = await api('POST', '/claims/2023UCS5678/admin-reassign', { body: { handle: 'carol' } });
    check('admin reassign rejects an anonymous caller', r.status === 401, `got ${r.status}`);

    r = await api('POST', '/claims/2023UCS5678/admin-reassign', {
      body: { handle: 'carol' },
      headers: { 'x-admin-secret': 'wrong-secret-same-len' },
    });
    check('admin reassign rejects a wrong secret', r.status === 403, `got ${r.status}`);

    r = await api('POST', '/claims/2023UCS5678/admin-reassign', {
      body: { handle: 'carol' },
      headers: { 'x-admin-secret': 'test-admin-secre' },
    });
    check('admin reassign rejects a shorter secret without throwing',
      r.status === 403, `got ${r.status}`);

    r = await api('POST', '/claims/2023UCS5678/admin-reassign', {
      body: {},
      headers: { 'x-admin-secret': 'test-admin-secret' },
    });
    check('admin can unclaim by omitting the handle',
      r.status === 200 && r.body.claimedBy === null, JSON.stringify(r.body));

    /* -------------------------------------------------- institute email path */
    section('Institute email claim path');

    r = await api('POST', '/claims/2023UCS1234/claim-email', { token: alice.token });
    check('email path disabled when no domain is configured', r.status === 400,
      JSON.stringify(r.body).slice(0, 120));

    process.env.INSTITUTE_EMAIL_DOMAIN = 'nsut.ac.in';

    const eve = await makeUser({
      name: 'Eve Random', email: 'eve@gmail.com', handle: 'eve',
    });
    r = await api('POST', '/claims/2023UCS1234/claim-email', { token: eve.token });
    check('non-institute email is refused', r.status === 400,
      JSON.stringify(r.body).slice(0, 120));

    // Right domain, wrong person: name must still match
    const frank = await makeUser({
      name: 'Frank Notalice',
      email: 'frank@nsut.ac.in',
      handle: 'frank',
      verifiedEmails: ['frank@nsut.ac.in'],
    });
    r = await api('POST', '/claims/2023UCS1234/claim-email', { token: frank.token });
    check('institute email alone cannot grab a classmate\'s profile', r.status === 400,
      JSON.stringify(r.body).slice(0, 160));

    // Right domain and matching name
    const realAlice = await makeUser({
      name: 'Alice Dev',
      email: 'alice.dev@nsut.ac.in',
      handle: 'alice-real',
      verifiedEmails: ['alice.dev@nsut.ac.in'],
    });
    r = await api('POST', '/claims/2023UCS1234/claim-email', { token: realAlice.token });
    check('institute email + matching name succeeds', r.status === 200 && r.body.claimed === true,
      JSON.stringify(r.body).slice(0, 160));

    r = await api('GET', '/claims/2023UCS1234', { token: realAlice.token });
    check('claim persisted', r.body.isMine === true);

    // One account cannot hold two roll numbers
    await Student.create({
      rollno: '2023UCS7777', name: 'Alice Dev', branch: 'CSE', year: 2,
      leetcode: { username: 'x_lc' },
    });
    r = await api('POST', '/claims/2023UCS7777/claim-email', { token: realAlice.token });
    check('an account cannot claim a second roll number', r.status === 409,
      `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);

    /* ------------------------------------------ cascade on account deletion */
    section('Account deletion releases the claim');

    const authService = require(`${BACKEND}/services/authService`);
    await authService.deleteLocalAccount(realAlice.user.clerkUserId);
    check('local account removed', !(await User.findById(realAlice.user._id)));
    student = await Student.findOne({ rollno: '2023UCS1234' });
    check('leaderboard record survives (institutional data)', Boolean(student));
    check('but its claim is released so it can be claimed again',
      student.claimedBy === null, String(student.claimedBy));  } catch (err) {
    crash(err);
  } finally {
    await stop();
    process.exit(finish());
  }
})();
