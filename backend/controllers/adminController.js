const adminService = require('../services/adminService');
const { updateAllStudents } = require('../cron/updateData');

/**
 * Fire-and-forget data refresh. Predates the admin panel and is kept because
 * external schedulers call it with the shared secret.
 */
exports.triggerUpdate = async (req, res) => {
  updateAllStudents().catch((err) => console.error('[ADMIN] Update error:', err));
  res.json({ message: 'Data update triggered' });
};

/* ---------------------------------------------------------------- overview */

exports.overview = async (req, res) => {
  res.json(await adminService.getOverview());
};

/** Lets the frontend decide whether to show the admin nav at all. */
exports.whoami = async (req, res) => {
  res.json({
    isAdmin: true,
    viaSecret: Boolean(req.adminViaSecret),
    handle: req.user?.handle || null,
    name: req.user?.name || null,
  });
};

/* ---------------------------------------------------------------- students */

exports.listStudents = async (req, res) => {
  res.json(await adminService.listStudents(req.query));
};

exports.getStudent = async (req, res) => {
  res.json(await adminService.getStudentDetail(req.params.rollno));
};

exports.updateStudent = async (req, res) => {
  res.json(await adminService.updateStudent(req, req.params.rollno, req.body));
};

exports.refreshStudent = async (req, res) => {
  res.json(await adminService.refreshStudent(req, req.params.rollno));
};

exports.deleteStudent = async (req, res) => {
  res.json(await adminService.deleteStudent(req, req.params.rollno));
};

/* ------------------------------------------------------------------- users */

exports.listUsers = async (req, res) => {
  res.json(await adminService.listUsers(req.query));
};

exports.getUser = async (req, res) => {
  res.json(await adminService.getUserDetail(req.params.handle));
};

exports.setUserAdmin = async (req, res) => {
  res.json(await adminService.setUserAdmin(req, req.params.handle, req.body.isAdmin === true));
};

exports.setUserSuspended = async (req, res) => {
  res.json(await adminService.setUserSuspended(
    req, req.params.handle, req.body.suspended === true, req.body.reason,
  ));
};

exports.deleteUser = async (req, res) => {
  res.json(await adminService.deleteUser(req, req.params.handle));
};

/* ------------------------------------------------------------------ claims */

exports.listClaims = async (req, res) => {
  res.json(await adminService.listClaims(req.query));
};

exports.reassignClaim = async (req, res) => {
  res.json(await adminService.reassignClaim(req, req.params.rollno, req.body.handle || null));
};

/* ---------------------------------------------------------------- problems */

exports.listProblems = async (req, res) => {
  res.json(await adminService.listProblems(req.query));
};

exports.refreshProblem = async (req, res) => {
  res.json(await adminService.refreshProblem(req, req.params.id));
};

exports.updateProblem = async (req, res) => {
  res.json(await adminService.updateProblem(req, req.params.id, req.body));
};

exports.deleteProblem = async (req, res) => {
  res.json(await adminService.deleteProblem(req, req.params.id));
};

/* ------------------------------------------------------------------ sheets */

exports.listSheets = async (req, res) => {
  res.json(await adminService.listAllSheets(req.query));
};

exports.setSheetCurated = async (req, res) => {
  res.json(await adminService.setSheetCurated(
    req, req.params.idOrSlug, req.body.isCurated === true, req.body.category,
  ));
};

exports.deleteSheet = async (req, res) => {
  res.json(await adminService.deleteSheetAsAdmin(req, req.params.idOrSlug));
};

/* ---------------------------------------------------------------- contests */

exports.listContests = async (req, res) => {
  res.json(await adminService.listAllContests(req.query));
};

exports.deleteContest = async (req, res) => {
  res.json(await adminService.deleteContest(req, req.params.id));
};

/* -------------------------------------------------------------------- jobs */

exports.listJobs = async (req, res) => {
  res.json({ jobs: adminService.listJobs() });
};

exports.runJob = async (req, res) => {
  res.status(202).json(await adminService.runJob(req, req.params.name));
};

/* ------------------------------------------------------------------- audit */

exports.auditLog = async (req, res) => {
  res.json(await adminService.listAuditLog(req.query));
};
