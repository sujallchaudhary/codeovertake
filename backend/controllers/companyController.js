const companyService = require('../services/companyService');

exports.list = async (req, res) => {
  res.json(await companyService.listCompanies(req.query));
};

exports.getKit = async (req, res) => {
  res.json(await companyService.getCompanyKit(req.params.slug, req.query, req.user || null));
};
