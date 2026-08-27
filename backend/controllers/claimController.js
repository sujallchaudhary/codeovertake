const claimService = require('../services/claimService');

exports.status = async (req, res) => {
  res.json(await claimService.getClaimStatus(req.params.rollno, req.user || null));
};

exports.mine = async (req, res) => {
  res.json(await claimService.getMyClaim(req.user));
};

exports.start = async (req, res) => {
  res.json(await claimService.startClaim(req.user, req.params.rollno, req.body.platform));
};

exports.verify = async (req, res) => {
  res.json(await claimService.verifyClaim(req.user, req.params.rollno));
};

exports.claimVerified = async (req, res) => {
  res.json(await claimService.claimViaVerifiedPlatform(
    req.user, req.params.rollno, req.body.platform,
  ));
};

exports.claimEmail = async (req, res) => {
  res.json(await claimService.claimViaInstituteEmail(req.user, req.params.rollno));
};

exports.release = async (req, res) => {
  res.json(await claimService.releaseClaim(req.user, req.params.rollno));
};

exports.adminReassign = async (req, res) => {
  res.json(await claimService.adminReassign(req.params.rollno, req.body.handle || null));
};
