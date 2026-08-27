const Student = require('../models/Student');
const Snapshot = require('../models/Snapshot');
const { getAllPlatforms, calculateTotalScore } = require('../platforms');
const { lookupNsutStudent, fetchNsutBranches } = require('../utils/nsut');
const { parseRollNo } = require('../utils/parseRollNo');
const { assertCanEditStudent } = require('./claimService');

const platforms = getAllPlatforms();

/**
 * Lookup a student — first check DB, then NSUT API, then parse roll number.
 */
async function lookupStudent(rollno) {
  const upper = rollno.toUpperCase();
  const existing = await Student.findOne({ rollno: upper });

  if (existing) {
    const platformUsernames = {};
    for (const p of platforms) {
      platformUsernames[p.key] = existing[p.key]?.username || '';
    }
    return {
      exists: true,
      student: {
        rollno: existing.rollno,
        name: existing.name,
        branch: existing.branch,
        year: existing.year,
        ...platformUsernames,
      },
    };
  }

  // Try NSUT API
  const nsutData = await lookupNsutStudent(upper);
  if (nsutData) {
    return { exists: false, student: nsutData };
  }

  // Fallback — parse roll number
  const parsed = parseRollNo(upper);
  return {
    exists: false,
    student: {
      rollno: upper,
      name: '',
      branch: parsed.branch || '',
      branchFull: '',
      year: parsed.year || null,
    },
  };
}

/**
 * Register a new student with optional platform usernames.
 * Validates usernames, fetches initial stats, calculates scores & ranks.
 */
async function registerStudent(data) {
  const { rollno: rawRollno, name, branch, year, ...platformInputs } = data;
  const rollno = rawRollno.toUpperCase();

  // Check duplicate
  const existing = await Student.findOne({ rollno });
  if (existing) {
    const err = new Error('Student with this roll number already exists');
    err.statusCode = 409;
    throw err;
  }

  // Validate all platform usernames in parallel
  const usernameEntries = platforms
    .map((p) => ({ platform: p, username: (platformInputs[p.key] || '').trim() }))
    .filter((e) => e.username);

  const validationResults = await Promise.all(
    usernameEntries.map(async ({ platform, username }) => ({
      platform,
      username,
      valid: await platform.validateUsername(username),
    })),
  );

  const validationErrors = validationResults
    .filter((r) => !r.valid)
    .map((r) => ({
      field: r.platform.key,
      message: `${r.platform.label} username "${r.username}" not found`,
    }));

  if (validationErrors.length > 0) {
    const err = new Error('Validation failed');
    err.statusCode = 400;
    err.errors = validationErrors;
    throw err;
  }

  // Build platform fields
  const platformData = {};
  for (const p of platforms) {
    platformData[p.key] = { username: (platformInputs[p.key] || '').trim() };
  }

  const student = await Student.create({
    rollno,
    name: name.toUpperCase(),
    branch: branch.toUpperCase(),
    year: parseInt(year),
    ...platformData,
  });

  // Fetch stats immediately
  try {
    const fetchResults = await Promise.all(
      platforms.map(async (p) => {
        const username = student[p.key]?.username;
        if (!username) return { key: p.key, stats: null, heatmap: null };
        const [stats, heatmap] = await Promise.all([
          p.fetchStats(username),
          typeof p.fetchHeatmap === 'function' ? p.fetchHeatmap(username).catch(() => null) : null,
        ]);
        return { key: p.key, stats, heatmap };
      }),
    );

    for (const { key, stats, heatmap } of fetchResults) {
      if (stats) {
        student[key].stats = stats;
        student[key].lastUpdated = new Date();
      }
      if (heatmap) {
        student.heatmap[key] = heatmap;
      }
      const platform = platforms.find((p) => p.key === key);
      student.scores[key] = platform.calculateScore(student[key].stats);
    }
    student.scores.total = calculateTotalScore(student.scores);
    await student.save();

    // Recalculate rankings
    const { calculateRankings } = require('./rankingService');
    await calculateRankings();
  } catch (err) {
    console.error(`[REGISTER] Failed to fetch initial stats for ${rollno}:`, err.message);
  }

  // Return fresh copy
  return Student.findOne({ rollno });
}

/**
 * Get a student by roll number.
 */
async function getStudentByRollNo(rollno) {
  return Student.findOne({ rollno: rollno.toUpperCase() });
}

/**
 * Update platform usernames for a student.
 * Validates new usernames before saving.
 *
 * @param {string} rollno
 * @param {Object} usernameData
 * @param {Object|null} actingUser the signed-in account, when there is one
 */
async function updateStudentUsernames(rollno, usernameData, actingUser = null) {
  const student = await Student.findOne({ rollno: rollno.toUpperCase() });
  if (!student) {
    const err = new Error('Student not found');
    err.statusCode = 404;
    throw err;
  }

  /**
   * Ownership gate. A claimed profile is editable only by its owner; an
   * unclaimed one keeps the original open-with-cooldown behaviour so nobody who
   * has not made an account yet is locked out. Throws 403 for a claimed record
   * being edited by anyone else.
   */
  const access = assertCanEditStudent(student, actingUser);

  // The 24h cooldown exists to stop drive-by edits of records nobody owns. Once
  // a profile is claimed, the owner is editing their own data, so it no longer
  // applies.
  if (access === 'open' && student.lastEditedAt) {
    const elapsed = Date.now() - student.lastEditedAt.getTime();
    const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
    if (elapsed < cooldownMs) {
      const hoursLeft = Math.ceil((cooldownMs - elapsed) / 3600000);
      const err = new Error(`Please wait ${hoursLeft} hour(s) before editing again`);
      err.statusCode = 429;
      throw err;
    }
  }

  // Save current usernames to history before making changes (cap at 10)
  const snapshot = {};
  for (const p of platforms) {
    snapshot[p.key] = student[p.key]?.username || '';
  }
  if (!student.usernameHistory) student.usernameHistory = [];
  student.usernameHistory.push({ changedAt: new Date(), usernames: snapshot });
  if (student.usernameHistory.length > 10) {
    student.usernameHistory = student.usernameHistory.slice(-10);
  }

  const updates = [];
  for (const p of platforms) {
    const newUsername = usernameData[p.key];
    // Skip undefined and empty strings — don't overwrite existing usernames with blank
    if (newUsername !== undefined && newUsername !== '' && newUsername !== (student[p.key]?.username || '')) {
      updates.push({ platform: p, username: newUsername });
    }
  }

  // Validate new usernames in parallel
  const validationResults = await Promise.all(
    updates.map(async ({ platform, username }) => ({
      platform,
      username,
      valid: await platform.validateUsername(username),
    })),
  );

  const validationErrors = [];
  for (const { platform, username, valid } of validationResults) {
    if (!valid) {
      validationErrors.push({
        field: platform.key,
        message: `${platform.label} username "${username}" not found`,
      });
    } else {
      student[platform.key].username = username;
    }
  }

  if (validationErrors.length > 0) {
    const err = new Error('Validation failed');
    err.statusCode = 400;
    err.errors = validationErrors;
    throw err;
  }

  student.lastEditedAt = new Date();
  await student.save();

  // Fetch stats, calculate scores & rankings (same as registration)
  try {
    const fetchResults = await Promise.all(
      platforms.map(async (p) => {
        const username = student[p.key]?.username;
        if (!username) return { key: p.key, stats: null, heatmap: null };
        const [stats, heatmap] = await Promise.all([
          p.fetchStats(username),
          typeof p.fetchHeatmap === 'function' ? p.fetchHeatmap(username).catch(() => null) : null,
        ]);
        return { key: p.key, stats, heatmap };
      }),
    );

    for (const { key, stats, heatmap } of fetchResults) {
      if (stats) {
        student[key].stats = stats;
        student[key].lastUpdated = new Date();
      }
      if (heatmap) {
        student.heatmap[key] = heatmap;
      }
      const platform = platforms.find((p) => p.key === key);
      student.scores[key] = platform.calculateScore(student[key].stats);
    }
    student.scores.total = calculateTotalScore(student.scores);
    await student.save();

    const { calculateRankings } = require('./rankingService');
    await calculateRankings();
  } catch (err) {
    console.error(`[UPDATE] Failed to fetch stats for ${student.rollno}:`, err.message);
  }

  return Student.findOne({ rollno: student.rollno });
}

/**
 * Restore a student's usernames from a specific history entry.
 * @param {string} rollno
 * @param {number} index — index in usernameHistory array to restore from
 */
async function restoreUsernames(rollno, index, actingUser = null) {
  const student = await Student.findOne({ rollno: rollno.toUpperCase() });
  if (!student) {
    const err = new Error('Student not found');
    err.statusCode = 404;
    throw err;
  }

  // Same ownership rule as editing
  const access = assertCanEditStudent(student, actingUser);

  if (!student.usernameHistory || student.usernameHistory.length === 0) {
    const err = new Error('No username history to restore from');
    err.statusCode = 400;
    throw err;
  }

  if (index < 0 || index >= student.usernameHistory.length) {
    const err = new Error('Invalid history index');
    err.statusCode = 400;
    throw err;
  }

  // Cooldown check (unclaimed records only - see updateStudentUsernames)
  if (access === 'open' && student.lastEditedAt) {
    const elapsed = Date.now() - student.lastEditedAt.getTime();
    const cooldownMs = 24 * 60 * 60 * 1000;
    if (elapsed < cooldownMs) {
      const hoursLeft = Math.ceil((cooldownMs - elapsed) / 3600000);
      const err = new Error(`Please wait ${hoursLeft} hour(s) before editing again`);
      err.statusCode = 429;
      throw err;
    }
  }

  // Save current state to history before restoring
  const currentSnapshot = {};
  for (const p of platforms) {
    currentSnapshot[p.key] = student[p.key]?.username || '';
  }
  student.usernameHistory.push({ changedAt: new Date(), usernames: currentSnapshot });
  if (student.usernameHistory.length > 10) {
    student.usernameHistory = student.usernameHistory.slice(-10);
  }

  // Apply the selected history entry
  const entry = student.usernameHistory[index];
  for (const p of platforms) {
    const restored = entry.usernames.get(p.key);
    if (restored !== undefined) {
      student[p.key].username = restored;
    }
  }

  student.lastEditedAt = new Date();
  await student.save();
  return Student.findOne({ rollno: student.rollno });
}

/**
 * Get score history snapshots for a student.
 */
async function getStudentHistory(rollno, days = 30) {
  const upper = rollno.toUpperCase();
  const student = await Student.findOne({ rollno: upper });
  if (!student) {
    const err = new Error('Student not found');
    err.statusCode = 404;
    throw err;
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await Snapshot.find({
    rollno: upper,
    date: { $gte: since },
  }).sort({ date: 1 });

  return { rollno: upper, snapshots };
}

/**
 * Search students in DB by name or roll number.
 */
async function searchStudentsByName(query) {
  const students = await Student.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { rollno: { $regex: query, $options: 'i' } },
    ],
  })
    .limit(10)
    .select('rollno name branch year');

  return students.map((s) => ({
    rollno: s.rollno,
    name: s.name,
    branch: s.branch,
    year: s.year,
  }));
}

module.exports = {
  lookupStudent,
  registerStudent,
  getStudentByRollNo,
  updateStudentUsernames,
  restoreUsernames,
  getStudentHistory,
  searchStudentsByName,
  fetchNsutBranches,
};
