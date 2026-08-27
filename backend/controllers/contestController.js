const contestService = require('../services/contestService');

exports.getContests = async (req, res) => {
  res.json(await contestService.getContests(req.query));
};

exports.getUpcoming = async (req, res) => {
  res.json(await contestService.getUpcoming(req.query));
};

exports.getCalendar = async (req, res) => {
  res.json(await contestService.getCalendarMonth(req.query));
};

exports.getContest = async (req, res) => {
  res.json(await contestService.getContestById(req.params.id));
};

exports.sync = async (req, res) => {
  res.json(await contestService.syncContests());
};
