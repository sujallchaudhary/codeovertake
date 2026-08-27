const revisionService = require('../services/revisionService');

exports.queue = async (req, res) => {
  res.json(await revisionService.getDailyQueue(req.userId));
};

exports.stats = async (req, res) => {
  res.json(await revisionService.getRevisionStats(req.userId));
};

exports.due = async (req, res) => {
  res.json(await revisionService.getDueQuestions(req.userId, parseInt(req.query.limit, 10) || 50));
};

exports.recent = async (req, res) => {
  res.json(await revisionService.getRecentRevisions(req.userId, parseInt(req.query.limit, 10) || 20));
};

exports.rate = async (req, res) => {
  res.json(await revisionService.rateQuestion(req.userId, req.params.id, req.body.rating));
};
