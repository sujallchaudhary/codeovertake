const studentService = require('../services/studentService');
const { fetchNsutBranches, searchNsutStudents } = require('../utils/nsut');
const { getPlatform, getAllPlatforms, calculateTotalScore } = require('../platforms');

const PLATFORM_KEYS = getAllPlatforms().map((platform) => platform.key);

/**
 * Strip usernames from a student doc, replacing with hasUsername boolean.
 */
function stripUsernames(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  for (const key of PLATFORM_KEYS) {
    if (obj[key]) {
      obj[key].hasUsername = !!obj[key].username;
      delete obj[key].username;
    }
  }
  // Strip usernames from history too
  if (obj.usernameHistory) {
    obj.usernameHistory = obj.usernameHistory.map((entry) => ({
      changedAt: entry.changedAt,
      // Keep platform keys but mask values
      platforms: entry.usernames ? Object.keys(
        entry.usernames instanceof Map ? Object.fromEntries(entry.usernames) : entry.usernames
      ) : [],
    }));
  }
  // Strip heatmap from response (served via separate endpoint)
  delete obj.heatmap;
  return obj;
}

const getBranches = async (req, res) => {
  const branches = await fetchNsutBranches();
  if (!branches) return res.status(502).json({ error: 'Failed to fetch branches' });
  res.json(branches);
};

const searchStudents = async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query || query.length < 2) return res.json({ results: [] });

  // Search in our DB first
  const dbResults = await studentService.searchStudentsByName(query);

  // Also search NSUT API
  const nsutResults = await searchNsutStudents(query);

  // Merge: DB students marked as exists, NSUT students not yet in DB
  const dbRollNos = new Set(dbResults.map((s) => s.rollno));
  const results = [
    ...dbResults.map((s) => ({ ...s, exists: true })),
    ...nsutResults
      .filter((s) => !dbRollNos.has(s.rollno))
      .map((s) => ({ ...s, exists: false })),
  ];

  res.json({ results: results.slice(0, 10) });
};

const lookupStudent = async (req, res) => {
  const result = await studentService.lookupStudent(req.params.rollno);
  res.json(result);
};

const registerStudent = async (req, res) => {
  const student = await studentService.registerStudent(req.body);
  res.status(201).json({ message: 'Student registered successfully', student: stripUsernames(student) });
};

/**
 * Check if a platform's stats are empty (all zeros / defaults).
 */
function isStatsEmpty(stats) {
  if (!stats) return true;
  const obj = stats.toObject ? stats.toObject() : stats;
  return Object.values(obj).every((v) => v === 0 || v === '' || v == null);
}

const getStudent = async (req, res) => {
  const student = await studentService.getStudentByRollNo(req.params.rollno);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  // Backfill: if any platform has a username but empty stats, fetch live
  const platforms = getAllPlatforms();
  const toFetch = platforms.filter(
    (p) => student[p.key]?.username && isStatsEmpty(student[p.key]?.stats),
  );

  if (toFetch.length > 0) {
    let dirty = false;
    await Promise.all(
      toFetch.map(async (p) => {
        try {
          const stats = await p.fetchStats(student[p.key].username);
          if (stats) {
            student[p.key].stats = stats;
            student[p.key].lastUpdated = new Date();
            student.scores[p.key] = p.calculateScore(stats);
            dirty = true;
          }
        } catch (err) {
          console.error(`[BACKFILL] ${p.key} stats error for ${student.rollno}:`, err.message);
        }
      }),
    );
    if (dirty) {
      student.scores.total = calculateTotalScore(student.scores);
      await student.save();
    }
  }

  res.json(stripUsernames(student));
};

const updateUsernames = async (req, res) => {
  const student = await studentService.updateStudentUsernames(req.params.rollno, req.body);
  res.json({ message: 'Usernames updated successfully', student: stripUsernames(student) });
};

const restoreUsernames = async (req, res) => {
  const index = parseInt(req.body.index);
  const student = await studentService.restoreUsernames(req.params.rollno, index);
  res.json({ message: 'Usernames restored successfully', student: stripUsernames(student) });
};

const getHistory = async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const result = await studentService.getStudentHistory(req.params.rollno, days);
  res.json(result);
};

const validateUsername = async (req, res) => {
  const { platform: platformKey, username } = req.params;
  const platform = getPlatform(platformKey);
  if (!platform) return res.status(400).json({ valid: false, error: 'Unknown platform' });

  const valid = await platform.validateUsername(username);
  if (!valid) return res.json({ valid: false });

  // Fetch basic stats to show a preview
  const stats = await platform.fetchStats(username);
  res.json({ valid: true, stats });
};

const getHeatmap = async (req, res) => {
  const student = await studentService.getStudentByRollNo(req.params.rollno);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const heatmapKeys = ['github', 'leetcode', 'codeforces'];
  const results = {};
  const toFetch = [];

  for (const key of heatmapKeys) {
    const hasData = student.heatmap?.[key] && student.heatmap[key] instanceof Map && student.heatmap[key].size > 0;
    if (hasData) {
      results[key] = Object.fromEntries(student.heatmap[key]);
    } else if (student[key]?.username) {
      toFetch.push(key);
    }
  }

  // Backfill missing heatmaps from live APIs
  if (toFetch.length > 0) {
    let dirty = false;
    await Promise.all(
      toFetch.map(async (key) => {
        const platform = getPlatform(key);
        if (!platform?.fetchHeatmap) return;
        try {
          const data = await platform.fetchHeatmap(student[key].username);
          if (data && Object.keys(data).length > 0) {
            results[key] = data;
            student.heatmap[key] = data;
            dirty = true;
          }
        } catch (err) {
          console.error(`[BACKFILL] ${key} heatmap error for ${student.rollno}:`, err.message);
        }
      }),
    );
    if (dirty) {
      await student.save();
    }
  }

  res.json(results);
};

module.exports = {
  getBranches,
  searchStudents,
  lookupStudent,
  registerStudent,
  getStudent,
  updateUsernames,
  restoreUsernames,
  getHistory,
  validateUsername,
  getHeatmap,
};
