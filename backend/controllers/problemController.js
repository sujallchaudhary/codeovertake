const problemService = require('../services/problemService');

exports.search = async (req, res) => {
  res.json(await problemService.searchProblems(req.query));
};

exports.resolve = async (req, res) => {
  const problem = await problemService.resolveByUrl(req.body.url, { refresh: Boolean(req.body.refresh) });
  res.json({ problem });
};

exports.getProblem = async (req, res) => {
  res.json(await problemService.getProblemById(req.params.id));
};

exports.topics = async (req, res) => {
  res.json(await problemService.listTopics());
};

exports.platforms = async (req, res) => {
  res.json(problemService.listPlatforms());
};
