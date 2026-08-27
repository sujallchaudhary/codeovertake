const mongoose = require('mongoose');
const Note = require('../models/Note');
const Problem = require('../models/Problem');
const httpError = require('../utils/httpError');
const problemService = require('./problemService');
const workspaceService = require('./workspaceService');

const MAX_LINKS = 50;

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Adds the derived fields to a lean note.
 *
 * All reads use .lean() for speed, and lean() bypasses Mongoose virtuals, so
 * `isGeneral` is computed explicitly here rather than relying on the schema
 * virtual (which only applies to hydrated documents).
 */
function decorate(note) {
  if (!note) return note;
  return {
    ...note,
    id: String(note._id),
    isGeneral: !note.linkedProblems || note.linkedProblems.length === 0,
  };
}

/**
 * Normalizes whatever the client sent as "things to link this note to" into
 * problem ids. Accepts problem ids *or* raw problem URLs so the note editor's
 * link picker can paste links directly.
 *
 * Every linked problem is also ensured into the workspace, matching Codolio's
 * rule that interacting with a question (including annotating it) pulls it into
 * My Workspace.
 */
async function resolveLinks(userId, links = []) {
  if (!Array.isArray(links)) {
    throw httpError(400, 'linkedProblems must be an array');
  }
  const trimmed = links.slice(0, MAX_LINKS);
  const problemIds = [];

  for (const raw of trimmed) {
    const value = String(raw || '').trim();
    if (!value) continue;

    if (/^[a-f0-9]{24}$/i.test(value)) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await Problem.exists({ _id: value });
      if (exists) problemIds.push(value);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const problem = await problemService.resolveByUrl(value);
      problemIds.push(String(problem._id));
    }
  }

  const unique = [...new Set(problemIds.map(String))];
  await Promise.all(
    unique.map((id) => workspaceService.ensureTracked(userId, id, { source: 'manual' })),
  );
  return unique;
}

/**
 * Creates a note. With `linkedProblems` populated it becomes a linked note that
 * appears on every one of those problems; with none it is a standalone note in
 * the "My Notes" tab.
 */
async function createNote(userId, data = {}) {
  const title = String(data.title || '').trim();
  if (!title) {
    throw httpError(400, 'Title is required', [{ field: 'title', message: 'Required' }]);
  }

  const linkedProblems = await resolveLinks(userId, data.linkedProblems || []);

  const note = await Note.create({
    user: userId,
    title,
    content: String(data.content || ''),
    linkedProblems,
    tags: (data.tags || []).map((t) => String(t).trim()).filter(Boolean),
    pinned: Boolean(data.pinned),
  });

  const saved = await Note.findById(note._id)
    .populate('linkedProblems', 'title platform difficulty url slug')
    .lean();
  return { note: decorate(saved) };
}

/**
 * Lists notes.
 * @param {Object} query general=true limits to standalone notes; problemId
 *                       limits to notes visible on that problem.
 */
async function listNotes(userId, query = {}) {
  const filter = { user: userId };

  if (query.general === 'true' || query.general === true) {
    filter.$or = [{ linkedProblems: { $size: 0 } }, { linkedProblems: { $exists: false } }];
  }
  if (query.problemId) filter.linkedProblems = query.problemId;
  if (query.tag) filter.tags = query.tag;
  if (query.q) {
    const regex = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$and = [{ $or: [{ title: regex }, { content: regex }] }];
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));

  const [notes, total] = await Promise.all([
    Note.find(filter)
      .sort({ pinned: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('linkedProblems', 'title platform difficulty url slug')
      .lean(),
    Note.countDocuments(filter),
  ]);

  return {
    notes: notes.map(decorate),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 0 },
  };
}

async function getNote(userId, noteId) {
  const note = await Note.findOne({ _id: noteId, user: userId })
    .populate('linkedProblems', 'title platform difficulty url slug')
    .lean();
  if (!note) throw httpError(404, 'Note not found');
  return { note: decorate(note) };
}

async function updateNote(userId, noteId, data = {}) {
  const note = await Note.findOne({ _id: noteId, user: userId });
  if (!note) throw httpError(404, 'Note not found');

  if (data.title !== undefined) {
    const title = String(data.title).trim();
    if (!title) throw httpError(400, 'Title cannot be empty', [{ field: 'title', message: 'Required' }]);
    note.title = title;
  }
  if (data.content !== undefined) note.content = String(data.content);
  if (data.pinned !== undefined) note.pinned = Boolean(data.pinned);
  if (data.tags !== undefined) {
    note.tags = (data.tags || []).map((t) => String(t).trim()).filter(Boolean);
  }
  if (data.linkedProblems !== undefined) {
    note.linkedProblems = await resolveLinks(userId, data.linkedProblems);
  }

  await note.save();
  return getNote(userId, noteId);
}

async function deleteNote(userId, noteId) {
  const deleted = await Note.findOneAndDelete({ _id: noteId, user: userId });
  if (!deleted) throw httpError(404, 'Note not found');
  return { message: 'Note deleted', id: String(noteId) };
}

/** Adds one problem link without rewriting the whole array. */
async function linkProblem(userId, noteId, problemRef) {
  const note = await Note.findOne({ _id: noteId, user: userId });
  if (!note) throw httpError(404, 'Note not found');

  const [problemId] = await resolveLinks(userId, [problemRef]);
  if (!problemId) throw httpError(400, 'Could not resolve that problem');

  if (!note.linkedProblems.some((p) => String(p) === problemId)) {
    if (note.linkedProblems.length >= MAX_LINKS) {
      throw httpError(400, `A note can link at most ${MAX_LINKS} questions`);
    }
    note.linkedProblems.push(problemId);
    await note.save();
  }
  return getNote(userId, noteId);
}

async function unlinkProblem(userId, noteId, problemId) {
  const note = await Note.findOne({ _id: noteId, user: userId });
  if (!note) throw httpError(404, 'Note not found');
  note.linkedProblems = note.linkedProblems.filter((p) => String(p) !== String(problemId));
  await note.save();
  return getNote(userId, noteId);
}

/** Every note visible on a given problem (the "write once, see everywhere" read). */
async function getNotesForProblem(userId, problemId) {
  const notes = await Note.find({ user: userId, linkedProblems: problemId })
    .sort({ pinned: -1, updatedAt: -1 })
    .lean();
  return { notes: notes.map(decorate) };
}

/** Distinct note tags with counts. */
async function listNoteTags(userId) {
  const rows = await Note.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 100 },
  ]);
  return { tags: rows.map((r) => ({ name: r._id, count: r.count })) };
}

module.exports = {
  createNote,
  listNotes,
  getNote,
  updateNote,
  deleteNote,
  linkProblem,
  unlinkProblem,
  getNotesForProblem,
  listNoteTags,
};
