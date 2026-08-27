const crypto = require('crypto');
const Student = require('../models/Student');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { getAllPlatforms, getPortfolioPlatform } = require('../platforms');
const { fetchVerificationText, textContainsCode, getVerificationField } = require('../platforms/verification');
const { lookupNsutStudent } = require('../utils/nsut');

/**
 * Claiming a leaderboard profile.
 *
 * The `Student` collection predates accounts entirely: records were created by
 * anyone who typed in a roll number, and they carry no owner. This service is
 * how such a record gets attached to a real, authenticated person.
 *
 * The trick is that a Student record already contains a proof primitive - the
 * coding platform handles on it. If you can demonstrate control of a handle that
 * is *already on the record*, you are almost certainly its rightful owner. That
 * needs no college infrastructure and reuses the same one-time-code mechanism
 * the portfolio already uses for platform verification.
 *
 * Three ways to claim, strongest first:
 *
 *   1. `platform-verified` - the handle on the record is one you have already
 *      verified on your portfolio. Instant, no extra steps.
 *   2. `platform-code`     - paste a one-time code into that platform's profile
 *      and we read it back.
 *   3. `institute-email`   - a Clerk-verified email on the institute domain plus
 *      a name match against the official student lookup. Only available when
 *      INSTITUTE_EMAIL_DOMAIN is configured.
 */

const CODE_TTL_MS = 60 * 60 * 1000; // one hour to go and paste it
const MAX_VERIFY_ATTEMPTS = 10;

function generateClaimCode() {
  return `CODEOVERTAKE-CLAIM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Masks a handle so the claim screen can say "which of these is yours?" without
 * leaking someone's usernames to a stranger probing roll numbers.
 * "sujalchaudhary" -> "su**********ry"
 */
function maskHandle(handle) {
  const value = String(handle || '');
  if (value.length <= 4) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(3, value.length - 4))}${value.slice(-2)}`;
}

/** Loose name comparison: punctuation-insensitive, order-insensitive tokens. */
function namesLookLikeMatch(a, b) {
  const tokens = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const left = tokens(a);
  const right = tokens(b);
  if (!left.length || !right.length) return false;

  const rightSet = new Set(right);
  const shared = left.filter((t) => rightSet.has(t));
  // Either every token of the shorter name appears, or at least two overlap
  const shorter = Math.min(left.length, right.length);
  return shared.length >= Math.min(2, shorter) && shared.length >= shorter - 1;
}

async function findStudent(rollno) {
  const student = await Student.findOne({ rollno: String(rollno || '').toUpperCase().trim() });
  if (!student) throw httpError(404, 'No leaderboard profile exists for that roll number');
  return student;
}

/**
 * What are the ways this user could prove they own this roll number?
 *
 * Only platforms that actually have a username on the record can be used, and
 * only the leaderboard platforms are considered, since those are what the record
 * stores.
 */
function buildProofOptions(student, user) {
  return getAllPlatforms()
    .filter((platform) => student[platform.key]?.username)
    .map((platform) => {
      const recordHandle = student[platform.key].username;
      const portfolioEntry = user?.platforms?.[platform.key];
      // Instant path: they already verified this exact handle on their portfolio
      const alreadyVerified = Boolean(
        portfolioEntry?.verified
        && portfolioEntry.username
        && portfolioEntry.username.toLowerCase() === recordHandle.toLowerCase(),
      );

      return {
        platform: platform.key,
        label: platform.label,
        maskedUsername: maskHandle(recordHandle),
        verificationField: getVerificationField(platform.key),
        alreadyVerified,
      };
    });
}

/** True when this user holds a Clerk-verified email on the institute domain. */
function instituteEmailFor(user) {
  const domain = (process.env.INSTITUTE_EMAIL_DOMAIN || '').toLowerCase().trim();
  if (!domain) return null;
  return (user.verifiedEmails || []).find((email) => email.endsWith(`@${domain}`)) || null;
}

/**
 * Claim status for a roll number, including how the caller could prove ownership.
 * @param {string} rollno
 * @param {Object|null} user
 */
async function getClaimStatus(rollno, user = null) {
  const student = await findStudent(rollno);

  const claimedBy = student.claimedBy
    ? await User.findById(student.claimedBy).select('handle name').lean()
    : null;
  const isMine = Boolean(user && student.claimedBy && String(student.claimedBy) === String(user._id));

  const proofOptions = user ? buildProofOptions(student, user) : [];
  const instituteEmail = user ? instituteEmailFor(user) : null;

  const pending = student.pendingClaim?.user
    && String(student.pendingClaim.user) === String(user?._id)
    && student.pendingClaim.expiresAt > new Date()
    ? {
      platform: student.pendingClaim.platform,
      code: student.pendingClaim.code,
      field: getVerificationField(student.pendingClaim.platform),
      expiresAt: student.pendingClaim.expiresAt,
    }
    : null;

  return {
    rollno: student.rollno,
    name: student.name,
    branch: student.branch,
    year: student.year,
    claimed: Boolean(student.claimedBy),
    isMine,
    // Only the public handle of the owner, never their email
    claimedBy: claimedBy ? { handle: claimedBy.handle, name: claimedBy.name } : null,
    claimedAt: student.claimedAt,
    proofOptions,
    instituteEmail: instituteEmail
      ? { available: true, email: instituteEmail }
      : {
        available: false,
        domain: process.env.INSTITUTE_EMAIL_DOMAIN || null,
      },
    pendingClaim: pending,
  };
}

/** Shared guard: is this record claimable by this user at all? */
function assertClaimable(student, user) {
  if (student.claimedBy) {
    if (String(student.claimedBy) === String(user._id)) {
      throw httpError(409, 'You have already claimed this profile');
    }
    throw httpError(409, 'This profile has already been claimed by another account');
  }
  if (user.rollno && user.rollno !== student.rollno) {
    throw httpError(409, `Your account is already linked to ${user.rollno}. Release that link first.`);
  }
}

/** Marks the record as owned and links it onto the user's portfolio. */
async function finaliseClaim(student, user, method) {
  student.claimedBy = user._id;
  student.claimedAt = new Date();
  student.pendingClaim = {
    user: null, platform: '', code: '', expiresAt: null, attempts: 0,
  };
  await student.save();

  user.rollno = student.rollno;
  user.rollnoClaimedAt = new Date();
  await user.save();

  console.log(`[CLAIM] ${student.rollno} claimed by ${user.handle} via ${method}`);
  return {
    claimed: true,
    method,
    rollno: student.rollno,
    message: `${student.rollno} is now linked to your account.`,
  };
}

/**
 * Step 1 of the code path: issue a one-time code for a platform on the record.
 * @param {Object} user
 * @param {string} rollno
 * @param {string} platformKey
 */
async function startClaim(user, rollno, platformKey) {
  const student = await findStudent(rollno);
  assertClaimable(student, user);

  const platform = getPortfolioPlatform(platformKey);
  if (!platform) throw httpError(400, `Unknown platform: ${platformKey}`);

  const recordHandle = student[platformKey]?.username;
  if (!recordHandle) {
    throw httpError(400, `That profile has no ${platform.label} handle to verify against`, [
      { field: 'platform', message: 'Pick a platform that is on the record' },
    ]);
  }

  // Someone else mid-claim on the same record: let their window lapse first
  const pending = student.pendingClaim;
  if (pending?.user && String(pending.user) !== String(user._id) && pending.expiresAt > new Date()) {
    throw httpError(409, 'Another claim is currently in progress for this profile. Try again shortly.');
  }

  student.pendingClaim = {
    user: user._id,
    platform: platformKey,
    code: generateClaimCode(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
  };
  await student.save();

  const field = getVerificationField(platformKey);
  return {
    rollno: student.rollno,
    platform: platformKey,
    label: platform.label,
    maskedUsername: maskHandle(recordHandle),
    code: student.pendingClaim.code,
    field,
    expiresAt: student.pendingClaim.expiresAt,
    instructions: `Paste ${student.pendingClaim.code} into the "${field}" field of the `
      + `${platform.label} account on this record, save it, then press Verify. `
      + 'You can change the field back immediately afterwards.',
  };
}

/**
 * Step 2 of the code path: read the platform profile back and look for the code.
 *
 * Critically, the handle is taken from the *Student record*, never from user
 * input - otherwise a claimant could simply point us at their own account.
 */
async function verifyClaim(user, rollno) {
  const student = await findStudent(rollno);
  assertClaimable(student, user);

  const pending = student.pendingClaim;
  if (!pending?.code || String(pending.user) !== String(user._id)) {
    throw httpError(400, 'Start a claim first to get a verification code');
  }
  if (pending.expiresAt < new Date()) {
    throw httpError(400, 'That verification code has expired. Start the claim again.');
  }
  if (pending.attempts >= MAX_VERIFY_ATTEMPTS) {
    throw httpError(429, 'Too many verification attempts. Start the claim again.');
  }

  student.pendingClaim.attempts += 1;
  await student.save();

  const platformKey = pending.platform;
  const recordHandle = student[platformKey]?.username;
  if (!recordHandle) {
    throw httpError(400, 'That platform handle is no longer on the record');
  }

  const text = await fetchVerificationText(platformKey, recordHandle);
  if (!text) {
    const platform = getPortfolioPlatform(platformKey);
    throw httpError(502, `Could not read that ${platform?.label || platformKey} profile right now. `
      + 'Make sure it is public and try again in a minute.');
  }

  if (!textContainsCode(text, pending.code)) {
    throw httpError(400, 'Verification code not found on that profile yet', [{
      field: 'code',
      message: `Paste ${pending.code} into your ${getVerificationField(platformKey)} and save before verifying`,
    }]);
  }

  // Proving the handle here also verifies it on their portfolio
  if (user.platforms?.[platformKey]) {
    if (!user.platforms[platformKey].username) {
      user.platforms[platformKey].username = recordHandle;
    }
    if (user.platforms[platformKey].username.toLowerCase() === recordHandle.toLowerCase()) {
      user.platforms[platformKey].verified = true;
      user.platforms[platformKey].verifiedAt = new Date();
    }
  }

  return finaliseClaim(student, user, `platform-code:${platformKey}`);
}

/**
 * Instant path: the handle on the record is one the user has *already* verified
 * on their portfolio, so no second round trip is needed.
 */
async function claimViaVerifiedPlatform(user, rollno, platformKey) {
  const student = await findStudent(rollno);
  assertClaimable(student, user);

  const recordHandle = student[platformKey]?.username;
  const entry = user.platforms?.[platformKey];
  if (!recordHandle || !entry?.verified || !entry.username) {
    throw httpError(400, 'You have no verified handle matching that platform on this record');
  }
  if (entry.username.toLowerCase() !== recordHandle.toLowerCase()) {
    throw httpError(400, 'Your verified handle does not match the one on this record');
  }

  return finaliseClaim(student, user, `platform-verified:${platformKey}`);
}

/**
 * Institute-email path, for records whose platform handles cannot be verified
 * (all changed, or the profiles went private).
 *
 * Requires a Clerk-verified address on INSTITUTE_EMAIL_DOMAIN *and* a name match
 * against the official student lookup, so a college address alone is not enough
 * to grab an arbitrary classmate's profile.
 */
async function claimViaInstituteEmail(user, rollno) {
  const domain = (process.env.INSTITUTE_EMAIL_DOMAIN || '').toLowerCase().trim();
  if (!domain) {
    throw httpError(400, 'Institute email claiming is not enabled on this deployment');
  }

  const student = await findStudent(rollno);
  assertClaimable(student, user);

  const email = instituteEmailFor(user);
  if (!email) {
    throw httpError(400, `Add and verify your @${domain} email address first`, [
      { field: 'email', message: `A verified @${domain} address is required` },
    ]);
  }

  // Strongest signal: the roll number appears in the address itself
  const localPart = email.split('@')[0].toLowerCase();
  const rollInEmail = localPart.includes(student.rollno.toLowerCase());

  if (!rollInEmail) {
    // Otherwise require the official record's name to match the account name
    const official = await lookupNsutStudent(student.rollno).catch(() => null);
    const officialName = official?.name || student.name;
    if (!namesLookLikeMatch(officialName, user.name)) {
      throw httpError(400,
        'Your account name does not match the name on that roll number. '
        + 'Verify one of the coding platform handles on the record instead, or contact an admin.',
        [{ field: 'name', message: `Expected a name matching "${officialName}"` }]);
    }
  }

  return finaliseClaim(student, user, rollInEmail ? 'institute-email:rollno' : 'institute-email:name');
}

/** Releases the caller's own claim, making the profile claimable again. */
async function releaseClaim(user, rollno) {
  const student = await findStudent(rollno);
  if (!student.claimedBy || String(student.claimedBy) !== String(user._id)) {
    throw httpError(403, 'You do not own that profile');
  }

  student.claimedBy = null;
  student.claimedAt = null;
  await student.save();

  if (user.rollno === student.rollno) {
    user.rollno = null;
    user.rollnoClaimedAt = null;
    await user.save();
  }

  return { released: true, rollno: student.rollno };
}

/** The profile this account owns, if any. */
async function getMyClaim(user) {
  if (!user.rollno) return { claimed: false, student: null };
  const student = await Student.findOne({ rollno: user.rollno, claimedBy: user._id })
    .select('rollno name branch year scores ranks')
    .lean();
  return { claimed: Boolean(student), student };
}

/**
 * Admin escape hatch for the cases self-service cannot cover: a student who
 * changed every handle, or a record claimed by the wrong person.
 */
async function adminReassign(rollno, handleOrNull) {
  const student = await findStudent(rollno);

  if (!handleOrNull) {
    if (student.claimedBy) {
      await User.updateOne({ _id: student.claimedBy }, { $set: { rollno: null, rollnoClaimedAt: null } });
    }
    student.claimedBy = null;
    student.claimedAt = null;
    await student.save();
    return { rollno: student.rollno, claimedBy: null };
  }

  const target = await User.findOne({ handle: String(handleOrNull).toLowerCase().trim() });
  if (!target) throw httpError(404, 'No account with that handle');

  if (student.claimedBy && String(student.claimedBy) !== String(target._id)) {
    await User.updateOne({ _id: student.claimedBy }, { $set: { rollno: null, rollnoClaimedAt: null } });
  }

  student.claimedBy = target._id;
  student.claimedAt = new Date();
  await student.save();

  target.rollno = student.rollno;
  target.rollnoClaimedAt = new Date();
  await target.save();

  console.log(`[CLAIM] admin assigned ${student.rollno} to ${target.handle}`);
  return { rollno: student.rollno, claimedBy: target.handle };
}

/**
 * Ownership check used by studentService before allowing username edits.
 *
 * Returns 'owner' when the caller owns it, 'open' when the record is unclaimed
 * (legacy behaviour, cooldown applies), or throws when someone else owns it.
 */
function assertCanEditStudent(student, user) {
  if (!student.claimedBy) return 'open';
  if (user && String(student.claimedBy) === String(user._id)) return 'owner';
  throw httpError(403,
    'This profile has been claimed by its owner. Sign in as that account to edit it.');
}

module.exports = {
  CODE_TTL_MS,
  getClaimStatus,
  startClaim,
  verifyClaim,
  claimViaVerifiedPlatform,
  claimViaInstituteEmail,
  releaseClaim,
  getMyClaim,
  adminReassign,
  assertCanEditStudent,
  maskHandle,
  namesLookLikeMatch,
};
