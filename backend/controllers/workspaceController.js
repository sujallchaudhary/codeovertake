const workspaceService = require('../services/workspaceService');

exports.list = async (req, res) => {
  res.json(await workspaceService.listQuestions(req.userId, req.query));
};

exports.stats = async (req, res) => {
  res.json(await workspaceService.getStats(req.userId));
};

exports.tags = async (req, res) => {
  res.json(await workspaceService.listTags(req.userId));
};

exports.add = async (req, res) => {
  const result = await workspaceService.addQuestion(req.userId, req.body);
  res.status(result.created ? 201 : 200).json(result);
};

exports.get = async (req, res) => {
  res.json(await workspaceService.getQuestion(req.userId, req.params.id));
};

exports.update = async (req, res) => {
  res.json(await workspaceService.updateQuestion(req.userId, req.params.id, req.body));
};

exports.setStatus = async (req, res) => {
  res.json(await workspaceService.setStatus(req.userId, req.params.id, req.body.status));
};

exports.remove = async (req, res) => {
  res.json(await workspaceService.removeQuestion(req.userId, req.params.id));
};
