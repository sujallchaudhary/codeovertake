const noteService = require('../services/noteService');

exports.list = async (req, res) => {
  res.json(await noteService.listNotes(req.userId, req.query));
};

exports.tags = async (req, res) => {
  res.json(await noteService.listNoteTags(req.userId));
};

exports.forProblem = async (req, res) => {
  res.json(await noteService.getNotesForProblem(req.userId, req.params.problemId));
};

exports.create = async (req, res) => {
  res.status(201).json(await noteService.createNote(req.userId, req.body));
};

exports.get = async (req, res) => {
  res.json(await noteService.getNote(req.userId, req.params.id));
};

exports.update = async (req, res) => {
  res.json(await noteService.updateNote(req.userId, req.params.id, req.body));
};

exports.remove = async (req, res) => {
  res.json(await noteService.deleteNote(req.userId, req.params.id));
};

exports.link = async (req, res) => {
  res.json(await noteService.linkProblem(req.userId, req.params.id, req.body.problem));
};

exports.unlink = async (req, res) => {
  res.json(await noteService.unlinkProblem(req.userId, req.params.id, req.params.problemId));
};
