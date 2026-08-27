const mongoose = require('mongoose');
const Sheet = require('../models/Sheet');
const SheetFollow = require('../models/SheetFollow');
const Problem = require('../models/Problem');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { parseCsvToObjects } = require('../utils/csv');
const { parseProblemUrl } = require('../utils/problemUrl');
const problemService = require('./problemService');
const workspaceService = require('./workspaceService');

const MAX_QUESTIONS_PER_SHEET = 3000;

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function allocateSlug(title) {
  let base = slugify(title) || 'sheet';
  if (!(await Sheet.exists({ slug: base }))) return base;
  for (let i = 2; i < 500; i += 1) {
    const candidate = `${base}-${i}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await Sheet.exists({ slug: candidate }))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/* --------------------------------------------------------------- permissions */

function isOwner(sheet, userId) {
  return Boolean(userId) && String(sheet.owner || '') === String(userId);
}

function isCollaborator(sheet, userId, email) {
  if (!userId && !email) return false;
  return (sheet.collaborators || []).some((c) => (
    (c.user && String(c.user) === String(userId))
    || (email && c.email === String(email).toLowerCase())
  ));
}

/** Owner and collaborators may edit the question list. */
function canEdit(sheet, user) {
  if (!user) return false;
  if (sheet.isCurated) return false; // curated sheets are read-only
  return isOwner(sheet, user._id) || isCollaborator(sheet, user._id, user.email);
}

/** Public sheets are visible to everyone; private ones only to owner/collaborators. */
function canView(sheet, user) {
  if (sheet.visibility === 'public' || sheet.isCurated) return true;
  return canEdit(sheet, user) || isOwner(sheet, user?._id);
}

function assertCanEdit(sheet, user) {
  if (!canEdit(sheet, user)) {
    throw httpError(403, sheet.isCurated
      ? 'Curated sheets cannot be edited'
      : 'You do not have edit access to this sheet');
  }
}

/* ------------------------------------------------------------------- helpers */

/** Every problem id referenced anywhere in the sheet, in display order. */
function collectProblemIds(sheet) {
  const ids = [];
  for (const q of sheet.questions || []) ids.push(String(q.problem));
  for (const section of sheet.sections || []) {
    for (const q of section.questions || []) ids.push(String(q.problem));
    for (const sub of section.subsections || []) {
      for (const q of sub.questions || []) ids.push(String(q.problem));
    }
  }
  return ids;
}

function countQuestions(sheet) {
  return collectProblemIds(sheet).length;
}

/** True when the problem already appears anywhere in the sheet. */
function sheetContains(sheet, problemId) {
  return collectProblemIds(sheet).includes(String(problemId));
}

async function recountAndSave(sheet) {
  sheet.questionCount = countQuestions(sheet);
  await sheet.save();
  return sheet;
}

/**
 * Recomputes followerCount from the join collection.
 *
 * Deriving it beats `$inc`: concurrent follows racing on the unique index would
 * otherwise double-count, and any drift would be permanent.
 */
async function syncFollowerCount(sheetId) {
  const followerCount = await SheetFollow.countDocuments({ sheet: sheetId });
  await Sheet.updateOne({ _id: sheetId }, { $set: { followerCount } });
  return followerCount;
}

/**
 * Replaces problem ids with full problem docs and folds in the caller's
 * progress, so the frontend renders a sheet in one request.
 */
function hydrate(sheet, problemMap, progressMap) {
  const mapQuestion = (q) => {
    const problem = problemMap[String(q.problem)];
    if (!problem) return null;
    const progress = progressMap[String(q.problem)] || null;
    return {
      problem,
      order: q.order,
      hint: q.hint || '',
      status: progress?.status || 'unsolved',
      starred: progress?.starred || false,
      tags: progress?.tags || [],
      trackedQuestionId: progress?.trackedQuestionId || null,
    };
  };
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

  return {
    questions: (sheet.questions || []).slice().sort(byOrder).map(mapQuestion).filter(Boolean),
    sections: (sheet.sections || []).slice().sort(byOrder).map((section) => ({
      id: String(section._id),
      title: section.title,
      order: section.order,
      questions: (section.questions || []).slice().sort(byOrder).map(mapQuestion).filter(Boolean),
      subsections: (section.subsections || []).slice().sort(byOrder).map((sub) => ({
        id: String(sub._id),
        title: sub.title,
        order: sub.order,
        questions: (sub.questions || []).slice().sort(byOrder).map(mapQuestion).filter(Boolean),
      })),
    })),
  };
}

/** Progress rollup: totals plus a per-difficulty split. */
function computeProgress(problemIds, problemMap, progressMap) {
  const stats = {
    total: problemIds.length,
    solved: 0,
    byDifficulty: {
      easy: { total: 0, solved: 0 },
      medium: { total: 0, solved: 0 },
      hard: { total: 0, solved: 0 },
      unrated: { total: 0, solved: 0 },
    },
  };

  for (const id of problemIds) {
    const problem = problemMap[id];
    if (!problem) continue;
    const difficulty = problem.difficulty || 'unrated';
    const solved = progressMap[id]?.status === 'solved';
    stats.byDifficulty[difficulty].total += 1;
    if (solved) {
      stats.solved += 1;
      stats.byDifficulty[difficulty].solved += 1;
    }
  }

  stats.percent = stats.total ? Math.round((stats.solved / stats.total) * 100) : 0;
  return stats;
}

/* --------------------------------------------------------------------- reads */

/**
 * Explore / My Sheets listing.
 * @param {Object} query category, q, scope=explore|mine|followed, page, limit
 * @param {Object|null} user
 */
async function listSheets(query = {}, user = null) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(query.limit, 10) || 24));
  const scope = query.scope || 'explore';

  let filter;
  if (scope === 'mine') {
    if (!user) throw httpError(401, 'Authentication required');
    filter = {
      $or: [
        { owner: user._id },
        { 'collaborators.user': user._id },
        { 'collaborators.email': user.email },
      ],
    };
  } else if (scope === 'followed') {
    if (!user) throw httpError(401, 'Authentication required');
    const follows = await SheetFollow.find({ user: user._id }).select('sheet').lean();
    filter = { _id: { $in: follows.map((f) => f.sheet) } };
  } else {
    // Explore: curated sheets and other people's public sheets
    filter = { $or: [{ isCurated: true }, { visibility: 'public' }] };
  }

  const and = [filter];
  if (query.category && query.category !== 'all') and.push({ category: query.category });
  if (query.q) {
    const regex = { $regex: escapeRegex(query.q), $options: 'i' };
    and.push({ $or: [{ title: regex }, { description: regex }, { curator: regex }] });
  }
  const finalFilter = and.length > 1 ? { $and: and } : filter;

  const sort = scope === 'explore'
    ? { isCurated: -1, followerCount: -1, questionCount: -1 }
    : { updatedAt: -1 };

  const [sheets, total] = await Promise.all([
    Sheet.find(finalFilter)
      .select('-questions -sections')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name handle avatarUrl')
      .lean(),
    Sheet.countDocuments(finalFilter),
  ]);

  // Which of these does the caller already follow, and how far along are they?
  let followedIds = new Set();
  let progressBySheet = {};
  if (user) {
    const follows = await SheetFollow.find({
      user: user._id,
      sheet: { $in: sheets.map((s) => s._id) },
    }).select('sheet').lean();
    followedIds = new Set(follows.map((f) => String(f.sheet)));

    progressBySheet = await getBulkProgress(user._id, sheets.map((s) => s._id));
  }

  return {
    sheets: sheets.map((s) => ({
      ...s,
      id: String(s._id),
      isFollowing: followedIds.has(String(s._id)),
      isOwner: isOwner(s, user?._id),
      progress: progressBySheet[String(s._id)] || null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
    categories: Sheet.SHEET_CATEGORIES,
  };
}

/** Solved/total per sheet for the explore cards, in one pass. */
async function getBulkProgress(userId, sheetIds) {
  if (!sheetIds.length) return {};
  const sheets = await Sheet.find({ _id: { $in: sheetIds } })
    .select('questions sections')
    .lean();

  const allIds = new Set();
  const perSheet = {};
  for (const sheet of sheets) {
    const ids = collectProblemIds(sheet);
    perSheet[String(sheet._id)] = ids;
    ids.forEach((id) => allIds.add(id));
  }

  const progressMap = await workspaceService.getProgressForProblems(userId, [...allIds]);

  const result = {};
  for (const [sheetId, ids] of Object.entries(perSheet)) {
    const solved = ids.filter((id) => progressMap[id]?.status === 'solved').length;
    result[sheetId] = {
      total: ids.length,
      solved,
      percent: ids.length ? Math.round((solved / ids.length) * 100) : 0,
    };
  }
  return result;
}

async function findSheet(idOrSlug) {
  const query = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: String(idOrSlug).toLowerCase() };
  const sheet = await Sheet.findOne(query);
  if (!sheet) throw httpError(404, 'Sheet not found');
  return sheet;
}

/** Full sheet with hydrated problems and the caller's progress. */
async function getSheet(idOrSlug, user = null) {
  const sheet = await findSheet(idOrSlug);
  if (!canView(sheet, user)) {
    throw httpError(403, 'This sheet is private');
  }

  const problemIds = collectProblemIds(sheet);
  const problems = await Problem.find({ _id: { $in: problemIds } }).lean();
  const problemMap = problems.reduce((acc, p) => {
    acc[String(p._id)] = { ...p, id: String(p._id) };
    return acc;
  }, {});

  const progressMap = user
    ? await workspaceService.getProgressForProblems(user._id, problemIds)
    : {};

  const [isFollowing, owner] = await Promise.all([
    user ? SheetFollow.exists({ user: user._id, sheet: sheet._id }) : Promise.resolve(false),
    sheet.owner ? User.findById(sheet.owner).select('name handle avatarUrl').lean() : null,
  ]);

  const hydrated = hydrate(sheet, problemMap, progressMap);

  return {
    sheet: {
      id: String(sheet._id),
      title: sheet.title,
      slug: sheet.slug,
      description: sheet.description,
      category: sheet.category,
      visibility: sheet.visibility,
      isCurated: sheet.isCurated,
      curator: sheet.curator,
      tags: sheet.tags,
      icon: sheet.icon,
      owner,
      questionCount: sheet.questionCount,
      followerCount: sheet.followerCount,
      collaborators: canEdit(sheet, user)
        ? sheet.collaborators.map((c) => ({ email: c.email, addedAt: c.addedAt }))
        : [],
      createdAt: sheet.createdAt,
      updatedAt: sheet.updatedAt,
      ...hydrated,
    },
    permissions: {
      canEdit: canEdit(sheet, user),
      canTrack: Boolean(user) && (Boolean(isFollowing) || isOwner(sheet, user?._id)),
      isFollowing: Boolean(isFollowing),
      isOwner: isOwner(sheet, user?._id),
    },
    progress: computeProgress(problemIds, problemMap, progressMap),
  };
}

/* -------------------------------------------------------------------- writes */

async function createSheet(userId, data = {}) {
  const title = String(data.title || '').trim();
  if (!title) {
    throw httpError(400, 'Title is required', [{ field: 'title', message: 'Required' }]);
  }

  const sheet = await Sheet.create({
    title,
    slug: await allocateSlug(title),
    description: String(data.description || ''),
    owner: userId,
    category: 'custom',
    visibility: data.visibility === 'public' ? 'public' : 'private',
    tags: (data.tags || []).map((t) => String(t).trim()).filter(Boolean),
    icon: data.icon || '',
  });

  return getSheet(sheet._id, await User.findById(userId));
}

async function updateSheet(user, idOrSlug, data = {}) {
  const sheet = await findSheet(idOrSlug);
  // Curated sheets have no owner, so isOwner already rejects them; this is an
  // explicit guard so the intent survives any future change to ownership rules.
  if (sheet.isCurated) throw httpError(403, 'Curated sheets cannot be edited');
  // Only the owner can change settings; collaborators edit content only
  if (!isOwner(sheet, user._id)) {
    throw httpError(403, 'Only the sheet owner can change its settings');
  }

  if (data.title !== undefined) {
    const title = String(data.title).trim();
    if (!title) throw httpError(400, 'Title cannot be empty', [{ field: 'title', message: 'Required' }]);
    sheet.title = title;
  }
  if (data.description !== undefined) sheet.description = String(data.description);
  if (data.visibility !== undefined) {
    if (!['public', 'private'].includes(data.visibility)) {
      throw httpError(400, 'visibility must be "public" or "private"');
    }
    sheet.visibility = data.visibility;
  }
  if (data.tags !== undefined) {
    sheet.tags = (data.tags || []).map((t) => String(t).trim()).filter(Boolean);
  }
  if (data.icon !== undefined) sheet.icon = String(data.icon);

  await sheet.save();
  return getSheet(sheet._id, user);
}

async function deleteSheet(user, idOrSlug) {
  const sheet = await findSheet(idOrSlug);
  if (sheet.isCurated) throw httpError(403, 'Curated sheets cannot be deleted');
  if (!isOwner(sheet, user._id)) {
    throw httpError(403, 'Only the sheet owner can delete it');
  }
  await Promise.all([
    Sheet.deleteOne({ _id: sheet._id }),
    SheetFollow.deleteMany({ sheet: sheet._id }),
  ]);
  return { message: 'Sheet deleted', id: String(sheet._id) };
}

/* ------------------------------------------------------- structure: sections */

/** Adds a topic (root) or subtopic (when parentSectionId is given). */
async function addSection(user, idOrSlug, { title, parentSectionId }) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  const clean = String(title || '').trim();
  if (!clean) throw httpError(400, 'Section title is required', [{ field: 'title', message: 'Required' }]);

  if (parentSectionId) {
    const section = sheet.sections.id(parentSectionId);
    if (!section) throw httpError(404, 'Parent topic not found');
    section.subsections.push({ title: clean, order: section.subsections.length, questions: [] });
  } else {
    sheet.sections.push({
      title: clean, order: sheet.sections.length, questions: [], subsections: [],
    });
  }

  await sheet.save();
  return getSheet(sheet._id, user);
}

async function updateSection(user, idOrSlug, sectionId, { title, subsectionId }) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  const section = sheet.sections.id(sectionId);
  if (!section) throw httpError(404, 'Topic not found');

  const target = subsectionId ? section.subsections.id(subsectionId) : section;
  if (!target) throw httpError(404, 'Subtopic not found');

  const clean = String(title || '').trim();
  if (!clean) throw httpError(400, 'Section title is required', [{ field: 'title', message: 'Required' }]);
  target.title = clean;

  await sheet.save();
  return getSheet(sheet._id, user);
}

async function deleteSection(user, idOrSlug, sectionId, subsectionId) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  const section = sheet.sections.id(sectionId);
  if (!section) throw httpError(404, 'Topic not found');

  if (subsectionId) {
    const sub = section.subsections.id(subsectionId);
    if (!sub) throw httpError(404, 'Subtopic not found');
    sub.deleteOne();
  } else {
    section.deleteOne();
  }

  await recountAndSave(sheet);
  return getSheet(sheet._id, user);
}

/** Persists a drag-and-drop reorder of topics (and optionally subtopics). */
async function reorderSections(user, idOrSlug, order = []) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  order.forEach((entry, index) => {
    const section = sheet.sections.id(entry.sectionId || entry);
    if (!section) return;
    section.order = index;
    if (Array.isArray(entry.subsections)) {
      entry.subsections.forEach((subId, subIndex) => {
        const sub = section.subsections.id(subId);
        if (sub) sub.order = subIndex;
      });
    }
  });

  await sheet.save();
  return getSheet(sheet._id, user);
}

/* ------------------------------------------------------ structure: questions */

/** Returns the questions array for a target location in the sheet. */
function resolveBucket(sheet, sectionId, subsectionId) {
  if (!sectionId) return sheet.questions;

  const section = sheet.sections.id(sectionId);
  if (!section) throw httpError(404, 'Topic not found');
  if (!subsectionId) return section.questions;

  const sub = section.subsections.id(subsectionId);
  if (!sub) throw httpError(404, 'Subtopic not found');
  return sub.questions;
}

/**
 * Adds a question by URL or problem id, into the root, a topic or a subtopic.
 * Difficulty and topic are fetched automatically by the catalog.
 */
async function addQuestion(user, idOrSlug, data = {}) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  if (sheet.questionCount >= MAX_QUESTIONS_PER_SHEET) {
    throw httpError(400, `A sheet can hold at most ${MAX_QUESTIONS_PER_SHEET} questions`);
  }

  let problem;
  if (data.problemId) {
    problem = await Problem.findById(data.problemId);
    if (!problem) throw httpError(404, 'Problem not found');
  } else if (data.url) {
    problem = await problemService.resolveByUrl(data.url);
  } else {
    throw httpError(400, 'Provide a problem URL or problemId', [
      { field: 'url', message: 'Required' },
    ]);
  }

  if (sheetContains(sheet, problem._id)) {
    throw httpError(409, 'That question is already in this sheet');
  }

  const bucket = resolveBucket(sheet, data.sectionId, data.subsectionId);
  bucket.push({ problem: problem._id, order: bucket.length, hint: data.hint || '' });

  await recountAndSave(sheet);
  return getSheet(sheet._id, user);
}

async function removeQuestion(user, idOrSlug, problemId, { sectionId, subsectionId } = {}) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  const bucket = resolveBucket(sheet, sectionId, subsectionId);
  const index = bucket.findIndex((q) => String(q.problem) === String(problemId));
  if (index === -1) throw httpError(404, 'Question not found in that location');
  bucket.splice(index, 1);
  bucket.forEach((q, i) => { q.order = i; });

  await recountAndSave(sheet);
  return getSheet(sheet._id, user);
}

/**
 * Moves a question between locations and/or to a new index — the drag-and-drop
 * "rearrange questions from one topic to another" behaviour.
 */
async function moveQuestion(user, idOrSlug, data = {}) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  const from = resolveBucket(sheet, data.fromSectionId, data.fromSubsectionId);
  const index = from.findIndex((q) => String(q.problem) === String(data.problemId));
  if (index === -1) throw httpError(404, 'Question not found in the source location');

  const [moved] = from.splice(index, 1);
  from.forEach((q, i) => { q.order = i; });

  const to = resolveBucket(sheet, data.toSectionId, data.toSubsectionId);
  const target = Number.isInteger(data.toIndex)
    ? Math.max(0, Math.min(data.toIndex, to.length))
    : to.length;
  to.splice(target, 0, moved);
  to.forEach((q, i) => { q.order = i; });

  await recountAndSave(sheet);
  return getSheet(sheet._id, user);
}

/**
 * Bulk import from CSV/spreadsheet text.
 *
 * Required column: problemUrl. Optional: topic, subTopic.
 * Topics/subtopics named in the file are created on the fly, so a flat
 * spreadsheet becomes a structured, trackable sheet in one step.
 *
 * @returns {Promise<{imported:number, skipped:number, failures:Array}>}
 */
async function importQuestions(user, idOrSlug, csvText) {
  const sheet = await findSheet(idOrSlug);
  assertCanEdit(sheet, user);

  const { headers, rows } = parseCsvToObjects(csvText);
  if (!rows.length) throw httpError(400, 'The file has no data rows');

  // Accept problemurl / url / link / problem
  const urlKey = ['problemurl', 'url', 'link', 'problem', 'problemlink']
    .find((k) => headers.includes(k));
  if (!urlKey) {
    throw httpError(400, 'Missing required column "problemUrl"', [{
      field: 'file',
      message: 'Add a problemUrl column (optional: topic, subTopic)',
    }]);
  }

  const entries = rows
    .map((row) => ({
      url: row[urlKey],
      topic: row.topic || row.section || '',
      subTopic: row.subtopic || row.subsection || '',
    }))
    .filter((e) => e.url);

  if (!entries.length) throw httpError(400, 'No problem URLs found in the file');
  if (entries.length + sheet.questionCount > MAX_QUESTIONS_PER_SHEET) {
    throw httpError(400, `Import would exceed the ${MAX_QUESTIONS_PER_SHEET} question limit`);
  }

  // Resolve all URLs (bounded concurrency, per-row failure reporting)
  const { problems, failures } = await problemService.resolveMany(entries.map((e) => e.url));

  const byUrl = new Map();
  problems.forEach((p) => byUrl.set(p.url, p));
  // Also index by slug so a differently-shaped input URL still matches
  const bySlug = new Map(problems.map((p) => [`${p.platform}:${p.slug}`, p]));

  const existing = new Set(collectProblemIds(sheet));

  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    const ref = parseProblemUrl(entry.url);
    const problem = (ref && bySlug.get(`${ref.platform}:${ref.slug}`)) || byUrl.get(entry.url);
    if (!problem) continue;

    if (existing.has(String(problem._id))) {
      skipped += 1;
      continue;
    }

    let bucket;
    if (entry.topic) {
      let section = sheet.sections.find(
        (s) => s.title.toLowerCase() === entry.topic.toLowerCase(),
      );
      if (!section) {
        sheet.sections.push({
          title: entry.topic, order: sheet.sections.length, questions: [], subsections: [],
        });
        section = sheet.sections[sheet.sections.length - 1];
      }

      if (entry.subTopic) {
        let sub = section.subsections.find(
          (s) => s.title.toLowerCase() === entry.subTopic.toLowerCase(),
        );
        if (!sub) {
          section.subsections.push({
            title: entry.subTopic, order: section.subsections.length, questions: [],
          });
          sub = section.subsections[section.subsections.length - 1];
        }
        bucket = sub.questions;
      } else {
        bucket = section.questions;
      }
    } else {
      bucket = sheet.questions;
    }

    bucket.push({ problem: problem._id, order: bucket.length });
    existing.add(String(problem._id));
    imported += 1;
  }

  await recountAndSave(sheet);

  return {
    imported,
    skipped,
    failures,
    totalRows: entries.length,
    sheet: (await getSheet(sheet._id, user)).sheet,
  };
}

/* ------------------------------------------------------------------- follows */

/**
 * Follows a sheet. Following is what unlocks tracking (marking done, starring,
 * notes) on someone else's sheet, and it copies the sheet's questions into the
 * follower's workspace so progress has somewhere to live.
 */
async function followSheet(user, idOrSlug) {
  const sheet = await findSheet(idOrSlug);
  if (!canView(sheet, user)) throw httpError(403, 'This sheet is private');
  if (isOwner(sheet, user._id)) {
    throw httpError(400, 'You already own this sheet');
  }

  const already = await SheetFollow.exists({ user: user._id, sheet: sheet._id });
  if (already) return { message: 'Already following', isFollowing: true };

  try {
    await SheetFollow.create({ user: user._id, sheet: sheet._id });
  } catch (err) {
    // Unique index race: someone already created it, so do not count it twice
    if (err.code !== 11000) throw err;
  }
  await syncFollowerCount(sheet._id);

  // Seed the workspace so the user can immediately mark things done
  const problemIds = collectProblemIds(sheet);
  const { added } = await workspaceService.addManyProblems(user._id, problemIds, {
    source: 'sheet',
    sheetId: sheet._id,
  });

  return {
    message: 'Following sheet', isFollowing: true, questionsAdded: added,
  };
}

/** Unfollowing keeps solved questions — they live on TrackedQuestion. */
async function unfollowSheet(user, idOrSlug) {
  const sheet = await findSheet(idOrSlug);
  const deleted = await SheetFollow.findOneAndDelete({ user: user._id, sheet: sheet._id });
  if (deleted) await syncFollowerCount(sheet._id);
  return {
    message: 'Unfollowed. Your solved questions are still in My Workspace.',
    isFollowing: false,
  };
}

/* -------------------------------------------------------------- collaborators */

async function addCollaborator(user, idOrSlug, email) {
  const sheet = await findSheet(idOrSlug);
  if (!isOwner(sheet, user._id)) {
    throw httpError(403, 'Only the sheet owner can manage collaborators');
  }

  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized || !normalized.includes('@')) {
    throw httpError(400, 'A valid email is required', [{ field: 'email', message: 'Invalid email' }]);
  }
  if (normalized === user.email) {
    throw httpError(400, 'You already own this sheet');
  }
  if (sheet.collaborators.some((c) => c.email === normalized)) {
    throw httpError(409, 'That person is already a collaborator');
  }

  // Link to an account if one exists; otherwise the email alone grants access
  // as soon as they sign up with it.
  const invitee = await User.findOne({ email: normalized }).select('_id').lean();
  sheet.collaborators.push({ user: invitee?._id || null, email: normalized });
  await sheet.save();

  return {
    message: 'Collaborator added',
    collaborators: sheet.collaborators.map((c) => ({ email: c.email, addedAt: c.addedAt })),
  };
}

async function removeCollaborator(user, idOrSlug, email) {
  const sheet = await findSheet(idOrSlug);
  if (!isOwner(sheet, user._id)) {
    throw httpError(403, 'Only the sheet owner can manage collaborators');
  }
  const normalized = String(email || '').toLowerCase().trim();
  sheet.collaborators = sheet.collaborators.filter((c) => c.email !== normalized);
  await sheet.save();
  return {
    message: 'Collaborator removed',
    collaborators: sheet.collaborators.map((c) => ({ email: c.email, addedAt: c.addedAt })),
  };
}

/**
 * Marks a sheet question solved/unsolved.
 *
 * Requires the user to follow (or own) the sheet, matching Codolio's rule that
 * you must follow a sheet before you can track it. The write itself goes to the
 * workspace, which is why it instantly reflects in every other sheet too.
 */
async function trackQuestion(user, idOrSlug, problemId, { status, starred, tags }) {
  const sheet = await findSheet(idOrSlug);
  if (!canView(sheet, user)) throw httpError(403, 'This sheet is private');

  const following = await SheetFollow.exists({ user: user._id, sheet: sheet._id });
  if (!following && !isOwner(sheet, user._id)) {
    throw httpError(403, 'Follow this sheet to start tracking your progress');
  }
  if (!sheetContains(sheet, problemId)) {
    throw httpError(404, 'That question is not in this sheet');
  }

  const tracked = await workspaceService.ensureTracked(user._id, problemId, {
    source: 'sheet',
    sheetId: sheet._id,
  });

  const update = {};
  if (status !== undefined) update.status = status;
  if (starred !== undefined) update.starred = starred;
  if (tags !== undefined) update.tags = tags;

  return workspaceService.updateQuestion(user._id, tracked._id, update);
}

module.exports = {
  listSheets,
  getSheet,
  createSheet,
  updateSheet,
  deleteSheet,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  addQuestion,
  removeQuestion,
  moveQuestion,
  importQuestions,
  followSheet,
  unfollowSheet,
  addCollaborator,
  removeCollaborator,
  trackQuestion,
  getBulkProgress,
  collectProblemIds,
  allocateSlug,
  canEdit,
  canView,
};
