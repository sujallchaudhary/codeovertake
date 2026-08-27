const portfolioService = require('../services/portfolioService');

/* Public reads */

exports.platforms = async (req, res) => {
  res.json(portfolioService.listPortfolioPlatforms());
};

exports.leaderboard = async (req, res) => {
  res.json(await portfolioService.getGlobalLeaderboard(req.query));
};

exports.publicProfile = async (req, res) => {
  res.json(await portfolioService.getPublicPortfolio(req.params.handle, req.user || null));
};

exports.getProject = async (req, res) => {
  res.json(await portfolioService.getProject(
    req.params.handle, req.params.projectId, req.userId || null,
  ));
};

exports.upvoteProject = async (req, res) => {
  res.json(await portfolioService.toggleProjectUpvote(
    req.userId, req.params.handle, req.params.projectId,
  ));
};

/* Sync */

exports.sync = async (req, res) => {
  res.json(await portfolioService.syncPlatforms(req.userId, { force: req.body?.force === true }));
};

/* Platform connections */

exports.setPlatform = async (req, res) => {
  res.json(await portfolioService.setPlatformHandle(
    req.user, req.params.platform, req.body.username,
  ));
};

exports.verificationInfo = async (req, res) => {
  res.json(await portfolioService.getVerificationInfo(req.user, req.params.platform));
};

exports.verifyPlatform = async (req, res) => {
  res.json(await portfolioService.verifyPlatform(req.user, req.params.platform));
};

exports.removePlatform = async (req, res) => {
  res.json(await portfolioService.removePlatform(req.user, req.params.platform));
};

/* Projects */

exports.githubRepos = async (req, res) => {
  res.json(await portfolioService.listGithubRepos(req.userId));
};

exports.addProject = async (req, res) => {
  res.status(201).json(await portfolioService.addProject(req.user, req.body));
};

exports.updateProject = async (req, res) => {
  res.json(await portfolioService.updateProject(req.user, req.params.projectId, req.body));
};

exports.deleteProject = async (req, res) => {
  res.json(await portfolioService.deleteProject(req.user, req.params.projectId));
};

exports.reorderProjects = async (req, res) => {
  res.json(await portfolioService.reorderProjects(req.user, req.body.order));
};

/* Education */

exports.addEducation = async (req, res) => {
  res.status(201).json(await portfolioService.educationOps.add(req.user, req.body));
};

exports.updateEducation = async (req, res) => {
  res.json(await portfolioService.educationOps.update(req.user, req.params.itemId, req.body));
};

exports.deleteEducation = async (req, res) => {
  res.json(await portfolioService.educationOps.remove(req.user, req.params.itemId));
};

/* Experience */

exports.addExperience = async (req, res) => {
  res.status(201).json(await portfolioService.experienceOps.add(req.user, req.body));
};

exports.updateExperience = async (req, res) => {
  res.json(await portfolioService.experienceOps.update(req.user, req.params.itemId, req.body));
};

exports.deleteExperience = async (req, res) => {
  res.json(await portfolioService.experienceOps.remove(req.user, req.params.itemId));
};
