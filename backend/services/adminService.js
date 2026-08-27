const mongoose = require('mongoose');
const Student = require('../models/Student');
const Snapshot = require('../models/Snapshot');
const User = require('../models/User');
const Problem = require('../models/Problem');
const Sheet = require('../models/Sheet');
const SheetFollow = require('../models/SheetFollow');
const Contest = require('../models/Contest');
const TrackedQuestion = require('../models/TrackedQuestion');
const Note = require('../models/Note');
const AuditLog = require('../models/AuditLog');
const Meta = require('../models/Meta');
const httpError = require('../utils/httpError');
const { recordAudit, diffFields } = require('../utils/audit');
const { getAllPlatforms, calculateTotalScore } = require('../platforms');
const problemService = require('./problemService');
const claimService = require('./claimService');
const contestService = require('./contestService');

const platforms = getAllPlatforms();

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paging(query, defaultLimit = 25, maxLimit = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function envelope(items, key, page, limit, total) {
  return {
    [key]: items,
    pagination: {
      page, limit, total, pages: Math.ceil(total / limit) || 0,
    },
  };
}

/* ============================================================== overview */

/**
 * Dashboard figures. Runs as one Promise.all because the panel's first paint
 * should not be a waterfall of round trips.
 */
async function getOverview() {
  const [
    studentCount, claimedCount, userCount, adminCount, suspendedCount,
    problemCount, trackedCount, sheetCount, curatedCount, contestCount,
    noteCount, lastCronRun, lastContestSync, recentAudit, topStudents,
  ] = await Promise.all([
    Student.countDocuments(),
    Student.countDocuments({ claimedBy: { $ne: null } }),
    User.countDocuments(),
    User.countDocuments({ isAdmin: true }),
    User.countDocuments({ suspended: true }),
    Problem.countDocuments(),
    TrackedQuestion.countDocuments(),
    Sheet.countDocuments(),
    Sheet.countDocuments({ isCurated: true }),
    Contest.countDocuments(),
    Note.countDocuments(),
    Meta.findOne({ key: 'lastCronRun' }).lean(),
    Meta.findOne({ key: 'lastContestSync' }).lean(),
    AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
    Student.find().sort({ 'scores.total': -1 }).limit(5)
      .select('rollno name branch year scores.total ranks.overall').lean(),
  ]);

  const upcomingContests = await Contest.countDocuments({ startTime: { $gt: new Date() } });

  return {
    students: {
      total: studentCount,
      claimed: claimedCount,
      unclaimed: studentCount - claimedCount,
      // The share of records still editable by anyone who knows the roll number
      claimedPercent: studentCount ? Math.round((claimedCount / studentCount) * 100) : 0,
    },
    users: {
      total: userCount, admins: adminCount, suspended: suspendedCount,
    },
    content: {
      problems: problemCount,
      trackedQuestions: trackedCount,
      notes: noteCount,
      sheets: sheetCount,
      curatedSheets: curatedCount,
      contests: contestCount,
      upcomingContests,
    },
    jobs: {
      lastCronRun: lastCronRun?.value || null,
      lastContestSync: lastContestSync?.value || null,
      running: listJobs(),
    },
    topStudents,
    recentAudit,
  };
}

/* ============================================================== students */

async function listStudents(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = {};

  if (query.q) {
    const regex = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$or = [{ rollno: regex }, { name: regex }];
  }
  if (query.branch) filter.branch = query.branch;
  if (query.year) filter.year = parseInt(query.year, 10);
  if (query.claimed === 'true') filter.claimedBy = { $ne: null };
  if (query.claimed === 'false') filter.claimedBy = null;

  const sortMap = {
    score: { 'scores.total': -1 },
    name: { name: 1 },
    rollno: { rollno: 1 },
    updated: { updatedAt: -1 },
  };

  const [students, total] = await Promise.all([
    Student.find(filter)
      .sort(sortMap[query.sortBy] || sortMap.score)
      .skip(skip)
      .limit(limit)
      .select('rollno name branch year scores ranks claimedBy claimedAt lastEditedAt updatedAt')
      .populate('claimedBy', 'handle name')
      .lean(),
    Student.countDocuments(filter),
  ]);

  return envelope(students, 'students', page, limit, total);
}

/** Full record including the usernames the public API deliberately masks. */
async function getStudentDetail(rollno) {
  const student = await Student.findOne({ rollno: String(rollno).toUpperCase() })
    .populate('claimedBy', 'handle name email')
    .lean();
  if (!student) throw httpError(404, 'Student not found');

  const snapshots = await Snapshot.find({ rollno: student.rollno })
    .sort({ date: -1 })
    .limit(30)
    .lean();

  return { student, snapshots };
}

/**
 * Edits a student record.
 *
 * Unlike the public endpoint this bypasses the 24h cooldown and the ownership
 * check — that is the entire point of an admin override — so every change is
 * written to the audit log with a before/after diff.
 */
async function updateStudent(req, rollno, data = {}) {
  const student = await Student.findOne({ rollno: String(rollno).toUpperCase() });
  if (!student) throw httpError(404, 'Student not found');

  const before = student.toObject();
  const scalarFields = ['name', 'branch', 'year'];
  for (const field of scalarFields) {
    if (data[field] !== undefined && data[field] !== '') student[field] = data[field];
  }

  // Usernames may be cleared here (unlike the public path, which refuses blanks)
  const usernameChanges = {};
  for (const platform of platforms) {
    const next = data[platform.key];
    if (next === undefined) continue;
    const current = student[platform.key]?.username || '';
    if (String(next) !== current) {
      usernameChanges[platform.key] = { from: current, to: String(next) };
      student[platform.key].username = String(next);
      // Stats belong to the old handle, so drop them rather than mislabel them
      if (!next) {
        student[platform.key].stats = {};
        student.scores[platform.key] = 0;
      }
    }
  }

  student.scores.total = calculateTotalScore(student.scores);
  await student.save();

  await recordAudit(req, {
    action: 'student.update',
    targetType: 'student',
    targetId: student.rollno,
    targetLabel: `${student.rollno} (${student.name})`,
    metadata: {
      fields: diffFields(before, student.toObject(), scalarFields),
      usernames: usernameChanges,
      cooldownBypassed: true,
    },
  });

  return { student: await Student.findOne({ rollno: student.rollno }).lean() };
}

/** Re-fetches stats for one student immediately, instead of waiting for cron. */
async function refreshStudent(req, rollno) {
  const student = await Student.findOne({ rollno: String(rollno).toUpperCase() });
  if (!student) throw httpError(404, 'Student not found');

  const results = await Promise.allSettled(
    platforms
      .filter((platform) => student[platform.key]?.username)
      .map(async (platform) => {
        const username = student[platform.key].username;
        const [stats, heatmap] = await Promise.all([
          platform.fetchStats(username),
          typeof platform.fetchHeatmap === 'function'
            ? platform.fetchHeatmap(username).catch(() => null)
            : null,
        ]);
        return { key: platform.key, stats, heatmap, platform };
      }),
  );

  const outcome = {};
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const {
      key, stats, heatmap, platform,
    } = result.value;

    // A null result means the fetch failed; keep the previous stats rather than
    // zeroing a real score (same rule as the cron).
    if (stats) {
      student[key].stats = stats;
      student[key].lastUpdated = new Date();
      outcome[key] = 'ok';
    } else {
      outcome[key] = 'failed';
    }
    if (heatmap) student.heatmap[key] = heatmap;
    student.scores[key] = platform.calculateScore(student[key].stats);
  }

  student.scores.total = calculateTotalScore(student.scores);
  await student.save();

  await recordAudit(req, {
    action: 'student.refresh',
    targetType: 'student',
    targetId: student.rollno,
    targetLabel: student.rollno,
    metadata: { platforms: outcome, total: student.scores.total },
  });

  return { student: await Student.findOne({ rollno: student.rollno }).lean(), platforms: outcome };
}

/** Removes a student and their snapshots, releasing any claim first. */
async function deleteStudent(req, rollno) {
  const student = await Student.findOne({ rollno: String(rollno).toUpperCase() });
  if (!student) throw httpError(404, 'Student not found');

  const snapshotCount = await Snapshot.countDocuments({ rollno: student.rollno });

  await Promise.all([
    Snapshot.deleteMany({ rollno: student.rollno }),
    // Do not leave an account pointing at a record that no longer exists
    User.updateMany(
      { rollno: student.rollno },
      { $set: { rollno: null, rollnoClaimedAt: null } },
    ),
  ]);
  await Student.deleteOne({ _id: student._id });

  await recordAudit(req, {
    action: 'student.delete',
    targetType: 'student',
    targetId: student.rollno,
    targetLabel: `${student.rollno} (${student.name})`,
    metadata: { snapshotsDeleted: snapshotCount, wasClaimed: Boolean(student.claimedBy) },
  });

  return { deleted: true, rollno: student.rollno, snapshotsDeleted: snapshotCount };
}

/* ================================================================= users */

async function listUsers(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = {};

  if (query.q) {
    const regex = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$or = [{ handle: regex }, { name: regex }, { email: regex }, { rollno: regex }];
  }
  if (query.admin === 'true') filter.isAdmin = true;
  if (query.suspended === 'true') filter.suspended = true;

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort(query.sortBy === 'cscore' ? { 'cScore.total': -1 } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('handle name email rollno isAdmin suspended cScore createdAt revision.streak')
      .lean(),
    User.countDocuments(filter),
  ]);

  return envelope(users, 'users', page, limit, total);
}

async function getUserDetail(handle) {
  const user = await User.findOne({ handle: String(handle).toLowerCase() });
  if (!user) throw httpError(404, 'Account not found');

  const [tracked, solved, notes, sheets, follows] = await Promise.all([
    TrackedQuestion.countDocuments({ user: user._id }),
    TrackedQuestion.countDocuments({ user: user._id, status: 'solved' }),
    Note.countDocuments({ user: user._id }),
    Sheet.countDocuments({ owner: user._id }),
    SheetFollow.countDocuments({ user: user._id }),
  ]);

  return {
    user: user.toSafeJSON(),
    activity: {
      trackedQuestions: tracked, solved, notes, sheetsOwned: sheets, sheetsFollowed: follows,
    },
  };
}

/**
 * Promotes or demotes an admin.
 *
 * `adminGrantedManually` records the intent so the next Clerk sync — which
 * recomputes isAdmin from ADMIN_EMAILS and Clerk roles — does not undo it.
 */
async function setUserAdmin(req, handle, isAdmin) {
  const user = await User.findOne({ handle: String(handle).toLowerCase() });
  if (!user) throw httpError(404, 'Account not found');

  // Removing your own access would lock you out of the panel mid-session
  if (!isAdmin && req.user && String(user._id) === String(req.user._id)) {
    throw httpError(400, 'You cannot remove your own admin access');
  }

  // Never leave the instance with no way in
  if (!isAdmin) {
    const remaining = await User.countDocuments({ isAdmin: true, _id: { $ne: user._id } });
    if (remaining === 0) {
      throw httpError(400, 'This is the only admin account; promote someone else first');
    }
  }

  user.isAdmin = Boolean(isAdmin);
  user.adminGrantedManually = Boolean(isAdmin);
  await user.save();

  await recordAudit(req, {
    action: isAdmin ? 'user.promote' : 'user.demote',
    targetType: 'user',
    targetId: String(user._id),
    targetLabel: user.handle,
    metadata: { isAdmin: user.isAdmin },
  });

  return { user: user.toSafeJSON() };
}

async function setUserSuspended(req, handle, suspended, reason = '') {
  const user = await User.findOne({ handle: String(handle).toLowerCase() });
  if (!user) throw httpError(404, 'Account not found');

  if (req.user && String(user._id) === String(req.user._id)) {
    throw httpError(400, 'You cannot suspend your own account');
  }
  if (suspended && user.isAdmin) {
    throw httpError(400, 'Demote this admin before suspending the account');
  }

  user.suspended = Boolean(suspended);
  user.suspendedReason = suspended ? String(reason || '') : '';
  user.suspendedAt = suspended ? new Date() : null;
  await user.save();

  await recordAudit(req, {
    action: suspended ? 'user.suspend' : 'user.unsuspend',
    targetType: 'user',
    targetId: String(user._id),
    targetLabel: user.handle,
    metadata: { reason: user.suspendedReason },
  });

  return { user: user.toSafeJSON() };
}

/**
 * Deletes a local account and everything it owns.
 *
 * Note this does *not* delete the Clerk account, so the person could sign in
 * again and be re-provisioned. Suspension is usually what you want; deletion is
 * for clearing test accounts and honouring erasure requests (in which case delete
 * from the Clerk dashboard too).
 */
async function deleteUser(req, handle) {
  const user = await User.findOne({ handle: String(handle).toLowerCase() });
  if (!user) throw httpError(404, 'Account not found');
  if (req.user && String(user._id) === String(req.user._id)) {
    throw httpError(400, 'You cannot delete your own account from here');
  }
  if (user.isAdmin) {
    throw httpError(400, 'Demote this admin before deleting the account');
  }

  // eslint-disable-next-line global-require
  const authService = require('./authService');
  const result = await authService.deleteLocalAccount(user.clerkUserId);

  await recordAudit(req, {
    action: 'user.delete',
    targetType: 'user',
    targetId: String(user._id),
    targetLabel: user.handle,
    metadata: { email: user.email, clerkUserId: user.clerkUserId, note: 'Clerk account not deleted' },
  });

  return result;
}

/* ================================================================ claims */

async function listClaims(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = { claimedBy: { $ne: null } };

  if (query.q) {
    const regex = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$or = [{ rollno: regex }, { name: regex }];
  }

  const [claims, total] = await Promise.all([
    Student.find(filter)
      .sort({ claimedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('rollno name branch year claimedBy claimedAt')
      .populate('claimedBy', 'handle name email')
      .lean(),
    Student.countDocuments(filter),
  ]);

  // Records with a claim in flight, useful for spotting a stuck verification
  const pending = await Student.find({
    'pendingClaim.user': { $ne: null },
    'pendingClaim.expiresAt': { $gt: new Date() },
  })
    .select('rollno name pendingClaim')
    .populate('pendingClaim.user', 'handle')
    .limit(50)
    .lean();

  return { ...envelope(claims, 'claims', page, limit, total), pending };
}

/** Reassigns or releases a claim; delegates the rules to claimService. */
async function reassignClaim(req, rollno, handle) {
  const result = await claimService.adminReassign(rollno, handle || null);

  await recordAudit(req, {
    action: handle ? 'claim.reassign' : 'claim.release',
    targetType: 'claim',
    targetId: result.rollno,
    targetLabel: result.rollno,
    metadata: { claimedBy: result.claimedBy },
  });

  return result;
}

/* ============================================================== problems */

async function listProblems(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = {};

  if (query.q) filter.title = { $regex: escapeRegex(query.q), $options: 'i' };
  if (query.platform) filter.platform = query.platform;
  if (query.difficulty) filter.difficulty = query.difficulty;
  if (query.partial === 'true') filter.metadataPartial = true;

  const [problems, total] = await Promise.all([
    Problem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Problem.countDocuments(filter),
  ]);

  return envelope(problems, 'problems', page, limit, total);
}

/** Forces a metadata re-fetch, useful for rows that resolved only partially. */
async function refreshProblem(req, id) {
  const problem = await Problem.findById(id);
  if (!problem) throw httpError(404, 'Problem not found');

  const refreshed = await problemService.resolveByUrl(problem.url, { refresh: true });

  await recordAudit(req, {
    action: 'problem.refresh',
    targetType: 'problem',
    targetId: String(problem._id),
    targetLabel: problem.title,
    metadata: { partial: refreshed.metadataPartial, difficulty: refreshed.difficulty },
  });

  return { problem: refreshed.toObject ? refreshed.toObject() : refreshed };
}

async function updateProblem(req, id, data = {}) {
  const problem = await Problem.findById(id);
  if (!problem) throw httpError(404, 'Problem not found');

  const before = problem.toObject();
  const editable = ['title', 'difficulty', 'rating', 'isPremium'];
  for (const field of editable) {
    if (data[field] !== undefined) problem[field] = data[field];
  }
  if (Array.isArray(data.topics)) {
    problem.topics = data.topics.map((t) => String(t).trim()).filter(Boolean);
  }
  // A hand-corrected row must not be overwritten by the next scheduled re-fetch
  problem.metadataPartial = false;
  problem.metadataFetchedAt = new Date();
  await problem.save();

  await recordAudit(req, {
    action: 'problem.update',
    targetType: 'problem',
    targetId: String(problem._id),
    targetLabel: problem.title,
    metadata: { fields: diffFields(before, problem.toObject(), editable) },
  });

  return { problem: problem.toObject() };
}

/**
 * Deletes a problem. Refuses while anything still references it, because the
 * alternative is dangling ids in workspaces, sheets and notes.
 */
async function deleteProblem(req, id) {
  const problem = await Problem.findById(id);
  if (!problem) throw httpError(404, 'Problem not found');

  const [tracked, inSheets, inNotes] = await Promise.all([
    TrackedQuestion.countDocuments({ problem: problem._id }),
    Sheet.countDocuments({
      $or: [
        { 'questions.problem': problem._id },
        { 'sections.questions.problem': problem._id },
        { 'sections.subsections.questions.problem': problem._id },
      ],
    }),
    Note.countDocuments({ linkedProblems: problem._id }),
  ]);

  if (tracked || inSheets || inNotes) {
    throw httpError(409,
      `Still referenced by ${tracked} workspace entr${tracked === 1 ? 'y' : 'ies'}, `
      + `${inSheets} sheet(s) and ${inNotes} note(s). Remove those first.`);
  }

  await Problem.deleteOne({ _id: problem._id });
  await recordAudit(req, {
    action: 'problem.delete',
    targetType: 'problem',
    targetId: String(problem._id),
    targetLabel: problem.title,
    metadata: { platform: problem.platform, slug: problem.slug },
  });

  return { deleted: true, id: String(problem._id) };
}

/* ================================================================ sheets */

/** Lists every sheet, including private ones the public API hides. */
async function listAllSheets(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = {};

  if (query.q) filter.title = { $regex: escapeRegex(query.q), $options: 'i' };
  if (query.category) filter.category = query.category;
  if (query.visibility) filter.visibility = query.visibility;
  if (query.curated === 'true') filter.isCurated = true;

  const [sheets, total] = await Promise.all([
    Sheet.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-questions -sections')
      .populate('owner', 'handle name')
      .lean(),
    Sheet.countDocuments(filter),
  ]);

  return envelope(sheets, 'sheets', page, limit, total);
}

/** Promotes a user sheet into the curated library, or demotes it back. */
async function setSheetCurated(req, idOrSlug, isCurated, category) {
  const sheet = await findSheetByIdOrSlug(idOrSlug);

  sheet.isCurated = Boolean(isCurated);
  if (isCurated) {
    // Curated sheets are public and read-only by definition
    sheet.visibility = 'public';
    if (category) sheet.category = category;
  }
  await sheet.save();

  await recordAudit(req, {
    action: isCurated ? 'sheet.curate' : 'sheet.uncurate',
    targetType: 'sheet',
    targetId: String(sheet._id),
    targetLabel: sheet.title,
    metadata: { category: sheet.category, visibility: sheet.visibility },
  });

  return { sheet: sheet.toObject() };
}

async function deleteSheetAsAdmin(req, idOrSlug) {
  const sheet = await findSheetByIdOrSlug(idOrSlug);
  const followers = await SheetFollow.countDocuments({ sheet: sheet._id });

  await Promise.all([
    Sheet.deleteOne({ _id: sheet._id }),
    SheetFollow.deleteMany({ sheet: sheet._id }),
  ]);

  await recordAudit(req, {
    action: 'sheet.delete',
    targetType: 'sheet',
    targetId: String(sheet._id),
    targetLabel: sheet.title,
    metadata: { followersRemoved: followers, wasCurated: sheet.isCurated },
  });

  return { deleted: true, id: String(sheet._id), followersRemoved: followers };
}

async function findSheetByIdOrSlug(idOrSlug) {
  const query = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: String(idOrSlug).toLowerCase() };
  const sheet = await Sheet.findOne(query);
  if (!sheet) throw httpError(404, 'Sheet not found');
  return sheet;
}

/* ============================================================== contests */

async function listAllContests(query = {}) {
  const { page, limit, skip } = paging(query, 50);
  const filter = {};
  const now = new Date();

  if (query.platform) filter.platform = query.platform;
  if (query.status === 'upcoming') filter.startTime = { $gt: now };
  if (query.status === 'finished') filter.endTime = { $lt: now };

  const [contests, total] = await Promise.all([
    Contest.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit).lean(),
    Contest.countDocuments(filter),
  ]);

  return envelope(contests, 'contests', page, limit, total);
}

async function deleteContest(req, id) {
  const contest = await Contest.findById(id);
  if (!contest) throw httpError(404, 'Contest not found');

  await Contest.deleteOne({ _id: contest._id });
  await recordAudit(req, {
    action: 'contest.delete',
    targetType: 'contest',
    targetId: String(contest._id),
    targetLabel: contest.name,
    metadata: { platform: contest.platform },
  });

  return { deleted: true, id: String(contest._id) };
}

/* ================================================================== jobs */

/**
 * In-memory registry of background jobs.
 *
 * The student refresh takes minutes, so these endpoints start work and return
 * immediately; the panel polls for status. State is per-process and deliberately
 * not persisted — it is progress reporting, not a queue. A restart clears it.
 */
const jobRegistry = {};

const JOB_DEFINITIONS = {
  'student-update': {
    label: 'Refresh all student stats',
    description: 'Fetches every platform for every student, then recalculates rankings.',
    run: async () => {
      // eslint-disable-next-line global-require
      const { updateAllStudents } = require('../cron/updateData');
      return updateAllStudents();
    },
  },
  rankings: {
    label: 'Recalculate rankings',
    description: 'Recomputes overall, year and branch ranks from current scores.',
    run: async () => {
      // eslint-disable-next-line global-require
      const { calculateRankings } = require('./rankingService');
      await calculateRankings();
      return { message: 'Rankings recalculated' };
    },
  },
  'contest-sync': {
    label: 'Sync contests',
    description: 'Pulls fresh schedules from LeetCode, Codeforces, CodeChef and AtCoder.',
    run: () => contestService.syncContests(),
  },
  'seed-content': {
    label: 'Seed curated content',
    description: 'Re-creates the curated sheets and company kits. Idempotent.',
    run: async () => {
      /* eslint-disable global-require */
      const curatedSheets = require('../scripts/data/curatedSheets');
      const companyKits = require('../scripts/data/companyKits');
      /* eslint-enable global-require */
      // The seeding logic lives in the script; here we only report the shape so
      // an operator can confirm the data files loaded before running the script.
      return {
        message: 'Run `npm run seed:content` on the host to apply',
        sheets: curatedSheets.length,
        companies: companyKits.length,
      };
    },
  },
  analytics: {
    label: 'Recompute analytics',
    description: "Rebuilds today's analytics cache.",
    run: async () => {
      // eslint-disable-next-line global-require
      const analyticsService = require('./analyticsService');
      // eslint-disable-next-line global-require
      const AnalyticsCache = require('../models/AnalyticsCache');
      const todayKey = new Date().toISOString().slice(0, 10);
      await AnalyticsCache.deleteOne({ date: todayKey });
      await analyticsService.getOverview();
      return { message: `Analytics recomputed for ${todayKey}` };
    },
  },
};

function listJobs() {
  return Object.entries(JOB_DEFINITIONS).map(([name, definition]) => ({
    name,
    label: definition.label,
    description: definition.description,
    ...(jobRegistry[name] || { status: 'idle' }),
  }));
}

/**
 * Starts a job without waiting for it. Refuses to start a second copy, because
 * two concurrent full student refreshes would double the load on every platform
 * API and race on the same documents.
 */
async function runJob(req, name) {
  const definition = JOB_DEFINITIONS[name];
  if (!definition) {
    throw httpError(400, `Unknown job "${name}". Known jobs: ${Object.keys(JOB_DEFINITIONS).join(', ')}`);
  }
  if (jobRegistry[name]?.status === 'running') {
    throw httpError(409, `"${definition.label}" is already running`);
  }

  jobRegistry[name] = { status: 'running', startedAt: new Date(), finishedAt: null };

  await recordAudit(req, {
    action: 'job.start',
    targetType: 'job',
    targetId: name,
    targetLabel: definition.label,
  });

  // Intentionally not awaited: the response returns immediately and the panel polls
  definition.run()
    .then((result) => {
      jobRegistry[name] = {
        status: 'succeeded',
        startedAt: jobRegistry[name].startedAt,
        finishedAt: new Date(),
        result: typeof result === 'object' ? result : { result },
      };
      console.log(`[ADMIN JOB] ${name} finished`);
    })
    .catch((error) => {
      jobRegistry[name] = {
        status: 'failed',
        startedAt: jobRegistry[name].startedAt,
        finishedAt: new Date(),
        error: error.message,
      };
      console.error(`[ADMIN JOB] ${name} failed:`, error.message);
    });

  return { started: true, job: name, label: definition.label };
}

/* ================================================================= audit */

async function listAuditLog(query = {}) {
  const { page, limit, skip } = paging(query, 50);
  const filter = {};

  if (query.action) filter.action = query.action;
  if (query.targetType) filter.targetType = query.targetType;
  if (query.targetId) filter.targetId = String(query.targetId);
  if (query.actor) filter.actorLabel = query.actor;

  const [entries, total, actions] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', 'handle name')
      .lean(),
    AuditLog.countDocuments(filter),
    // Drives the filter dropdown without hardcoding the action list
    AuditLog.distinct('action'),
  ]);

  return { ...envelope(entries, 'entries', page, limit, total), actions: actions.sort() };
}

module.exports = {
  getOverview,
  listStudents,
  getStudentDetail,
  updateStudent,
  refreshStudent,
  deleteStudent,
  listUsers,
  getUserDetail,
  setUserAdmin,
  setUserSuspended,
  deleteUser,
  listClaims,
  reassignClaim,
  listProblems,
  refreshProblem,
  updateProblem,
  deleteProblem,
  listAllSheets,
  setSheetCurated,
  deleteSheetAsAdmin,
  listAllContests,
  deleteContest,
  listJobs,
  runJob,
  listAuditLog,
  JOB_DEFINITIONS,
};
