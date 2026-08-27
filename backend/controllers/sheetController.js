const sheetService = require('../services/sheetService');

exports.list = async (req, res) => {
  res.json(await sheetService.listSheets(req.query, req.user || null));
};

exports.get = async (req, res) => {
  res.json(await sheetService.getSheet(req.params.idOrSlug, req.user || null));
};

exports.create = async (req, res) => {
  res.status(201).json(await sheetService.createSheet(req.userId, req.body));
};

exports.update = async (req, res) => {
  res.json(await sheetService.updateSheet(req.user, req.params.idOrSlug, req.body));
};

exports.remove = async (req, res) => {
  res.json(await sheetService.deleteSheet(req.user, req.params.idOrSlug));
};

/* Sections (topics / subtopics) */

exports.addSection = async (req, res) => {
  res.status(201).json(await sheetService.addSection(req.user, req.params.idOrSlug, req.body));
};

exports.updateSection = async (req, res) => {
  res.json(await sheetService.updateSection(
    req.user, req.params.idOrSlug, req.params.sectionId, req.body,
  ));
};

exports.deleteSection = async (req, res) => {
  res.json(await sheetService.deleteSection(
    req.user, req.params.idOrSlug, req.params.sectionId, req.query.subsectionId,
  ));
};

exports.reorderSections = async (req, res) => {
  res.json(await sheetService.reorderSections(req.user, req.params.idOrSlug, req.body.order));
};

/* Questions */

exports.addQuestion = async (req, res) => {
  res.status(201).json(await sheetService.addQuestion(req.user, req.params.idOrSlug, req.body));
};

exports.removeQuestion = async (req, res) => {
  res.json(await sheetService.removeQuestion(
    req.user, req.params.idOrSlug, req.params.problemId, req.query,
  ));
};

exports.moveQuestion = async (req, res) => {
  res.json(await sheetService.moveQuestion(req.user, req.params.idOrSlug, req.body));
};

exports.importQuestions = async (req, res) => {
  res.json(await sheetService.importQuestions(req.user, req.params.idOrSlug, req.body.csv));
};

exports.trackQuestion = async (req, res) => {
  res.json(await sheetService.trackQuestion(
    req.user, req.params.idOrSlug, req.params.problemId, req.body,
  ));
};

/* Follow + collaborate */

exports.follow = async (req, res) => {
  res.json(await sheetService.followSheet(req.user, req.params.idOrSlug));
};

exports.unfollow = async (req, res) => {
  res.json(await sheetService.unfollowSheet(req.user, req.params.idOrSlug));
};

exports.addCollaborator = async (req, res) => {
  res.json(await sheetService.addCollaborator(req.user, req.params.idOrSlug, req.body.email));
};

exports.removeCollaborator = async (req, res) => {
  res.json(await sheetService.removeCollaborator(req.user, req.params.idOrSlug, req.params.email));
};
