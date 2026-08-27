const authService = require('../services/authService');

exports.signup = async (req, res) => {
  const result = await authService.signup(req.body);
  res.status(201).json(result);
};

exports.login = async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
};

exports.me = async (req, res) => {
  res.json({ user: await authService.me(req.user) });
};

exports.updateAccount = async (req, res) => {
  res.json({ user: await authService.updateAccount(req.user, req.body) });
};

exports.changePassword = async (req, res) => {
  res.json(await authService.changePassword(req.user, req.body));
};

exports.checkHandle = async (req, res) => {
  res.json(await authService.checkHandle(req.query.handle));
};

exports.githubAuthorizeUrl = async (req, res) => {
  res.json(authService.githubAuthorizeUrl(req.query.redirect_uri));
};

exports.githubCallback = async (req, res) => {
  const result = await authService.githubOAuth(req.body.code);
  res.json(result);
};

exports.extensionToken = async (req, res) => {
  res.json(await authService.getExtensionToken(req.userId));
};

exports.revokeExtensionToken = async (req, res) => {
  res.json(await authService.revokeExtensionToken(req.userId));
};
