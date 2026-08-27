/**
 * Clerk session-token verification.
 *
 * The other suites authenticate through the extension pairing-token branch,
 * because minting a Clerk session token normally needs a live Clerk instance.
 * That left the branch every browser request actually uses untested.
 *
 * This suite closes that gap by generating an RSA keypair and pointing
 * CLERK_JWT_KEY at the public half, which is exactly the "networkless
 * verification" mode Clerk supports. We can then mint tokens that are genuinely
 * signed and assert on each way verification can fail — including the azp
 * mismatch that presents as "Authentication required" on a user who is very
 * definitely signed in.
 */
const crypto = require('crypto');
const path = require('path');

const BACKEND = path.join(__dirname, '..');

/* ------------------------------------------------------------------ signing */

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const OTHER_PRIVATE = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

function b64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Mints a Clerk-shaped RS256 session token. */
function mintToken(claims = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    nbf: now - 5,
    exp: now + 600,
    iss: 'https://test.clerk.accounts.dev',
    sid: 'sess_test',
    ...claims,
  };
  const header = b64url({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' });
  const body = b64url(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(key).toString('base64url')}`;
}

/* Set before the app is required, so the first verification already sees them. */
const FRONTEND = 'http://localhost:5173';
process.env.CLERK_JWT_KEY = PUBLIC_PEM;
process.env.FRONTEND_URL = FRONTEND;
process.env.ALLOWED_ORIGINS = 'https://preview-7.example.com,https://*.vercel.app';
delete process.env.CLERK_SECRET_KEY;

// eslint-disable-next-line import/order
const { bootstrap, createReporter } = require('./harness');

const { check, section, crash, finish } = createReporter('Clerk session tokens');

(async () => {
  const { api, stop } = await bootstrap();

  try {
    const User = require(`${BACKEND}/models/User`);
    const clerkService = require(`${BACKEND}/services/clerkService`);

    /* ------------------------------------------------- authorized parties */
    section('Authorized parties');

    const parties = clerkService.authorizedParties();
    check('includes FRONTEND_URL', parties.includes(FRONTEND), parties.join(','));
    check('includes literal ALLOWED_ORIGINS entries',
      parties.includes('https://preview-7.example.com'), parties.join(','));
    check('skips wildcard patterns, which azp cannot express',
      !parties.some((p) => p.includes('*')), parties.join(','));

    process.env.FRONTEND_URL = 'http://localhost:5173/';
    check('strips a trailing slash, which would never match azp',
      clerkService.authorizedParties().includes(FRONTEND),
      clerkService.authorizedParties().join(','));
    process.env.FRONTEND_URL = FRONTEND;

    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3999';
    check('CLERK_AUTHORIZED_PARTIES is additive',
      clerkService.authorizedParties().includes('http://localhost:3999'));
    delete process.env.CLERK_AUTHORIZED_PARTIES;

    /* -------------------------------------------------------- happy path */
    section('A validly signed session token authenticates');

    /*
     * Pre-creating the local mirror keeps just-in-time provisioning from calling
     * the Clerk API, which is unreachable here. Resolution then short-circuits on
     * the existing clerkUserId, which is the steady-state path anyway.
     */
    const clerkUserId = 'user_2abcdefghijklmnop';
    await User.create({
      clerkUserId,
      email: 'session@example.com',
      verifiedEmails: ['session@example.com'],
      name: 'Session Tester',
      handle: 'sessiontester',
    });

    let r = await api('GET', '/auth/me', { token: mintToken({ sub: clerkUserId, azp: FRONTEND }) });
    check('GET /auth/me returns 200', r.status === 200, `got ${r.status}`);
    check('and resolves to the right account',
      r.body?.user?.handle === 'sessiontester', JSON.stringify(r.body).slice(0, 120));
    check('isAdmin is present so the frontend can gate the admin nav',
      r.body?.user?.isAdmin === false, String(r.body?.user?.isAdmin));

    /* ----------------------------------------------------- the reported bug */
    section('Origin mismatch is the classic false 401');

    r = await api('GET', '/auth/me', {
      token: mintToken({ sub: clerkUserId, azp: 'http://localhost:3999' }),
    });
    check('a token minted for another origin is refused', r.status === 401, `got ${r.status}`);
    check('and reads as an auth failure, not a server error',
      r.body?.error === 'Authentication required', JSON.stringify(r.body));

    // Naming that origin as an authorized party is the fix
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3999';
    r = await api('GET', '/auth/me', {
      token: mintToken({ sub: clerkUserId, azp: 'http://localhost:3999' }),
    });
    check('naming the origin in CLERK_AUTHORIZED_PARTIES fixes it',
      r.status === 200, `got ${r.status}`);
    delete process.env.CLERK_AUTHORIZED_PARTIES;

    r = await api('GET', '/auth/me', { token: mintToken({ sub: clerkUserId }) });
    check('a token with no azp claim at all is also refused',
      r.status === 401, `got ${r.status}`);

    /* ------------------------------------------------ other failure modes */
    section('Other rejection modes');

    const now = Math.floor(Date.now() / 1000);
    r = await api('GET', '/auth/me', {
      token: mintToken({
        sub: clerkUserId, azp: FRONTEND, exp: now - 60, iat: now - 700, nbf: now - 700,
      }),
    });
    check('an expired token is refused', r.status === 401, `got ${r.status}`);

    r = await api('GET', '/auth/me', {
      token: mintToken({ sub: clerkUserId, azp: FRONTEND }, OTHER_PRIVATE),
    });
    check('a token signed by a different key is refused', r.status === 401, `got ${r.status}`);

    r = await api('GET', '/auth/me', {
      token: mintToken({ sub: clerkUserId, azp: FRONTEND, nbf: now + 600, iat: now + 600 }),
    });
    check('a not-yet-valid token is refused', r.status === 401, `got ${r.status}`);

    r = await api('GET', '/auth/me', { token: 'not-a-jwt-at-all' });
    check('garbage is refused', r.status === 401, `got ${r.status}`);

    r = await api('GET', '/auth/me');
    check('no token at all is 401 — which is what a browser address bar sends',
      r.status === 401, `got ${r.status}`);

    /* ------------------------------------------------- public routes still open */
    section('Optional auth is unaffected');

    r = await api('GET', '/leaderboard');
    check('a public route works with no token', r.status === 200, `got ${r.status}`);

    r = await api('GET', '/leaderboard', { token: mintToken({ sub: clerkUserId, azp: 'http://wrong' }) });
    check('a public route works even with a rejected token',
      r.status === 200, `got ${r.status}`);

    /* ------------------------------------------- unverifiable is 503, not 401 */
    section('An unverifiable server reports 503, not 401');

    /*
     * With no jwtKey and a malformed secret, *no* token could ever verify. A 401
     * would tell the caller to fix their credentials, which is the one thing that
     * cannot help — so this must surface as a server-side failure.
     */
    delete process.env.CLERK_JWT_KEY;
    process.env.CLERK_SECRET_KEY = 'sk_test_not_a_real_key';

    r = await api('GET', '/auth/me', { token: mintToken({ sub: clerkUserId, azp: FRONTEND }) });
    check('a broken key configuration yields 503', r.status === 503, `got ${r.status}`);
    check('and says so rather than blaming the credential',
      /misconfigured/i.test(r.body?.error || ''), JSON.stringify(r.body));

    // An extension pairing token must still work: it never touches Clerk
    const extToken = crypto.randomBytes(24).toString('hex');
    await User.updateOne({ clerkUserId }, { extensionToken: extToken });
    r = await api('GET', '/auth/me', { token: extToken });
    check('extension pairing tokens are unaffected by Clerk being broken',
      r.status === 200, `got ${r.status}`);

    process.env.CLERK_JWT_KEY = PUBLIC_PEM;
    delete process.env.CLERK_SECRET_KEY;

    /* ------------------------------------------------------ suspended account */
    section('Suspension still applies to session tokens');

    await User.updateOne({ clerkUserId }, { suspended: true, suspendedReason: 'spam' });
    r = await api('GET', '/auth/me', { token: mintToken({ sub: clerkUserId, azp: FRONTEND }) });
    check('a suspended account gets 403, not 401', r.status === 403, `got ${r.status}`);
    check('and the reason is surfaced', /spam/.test(r.body?.error || ''), JSON.stringify(r.body));
  } catch (err) {
    crash(err);
  } finally {
    await stop();
    process.exit(finish());
  }
})();
