const authService = require('../services/authService');
const clerkService = require('../services/clerkService');

/**
 * Sign-in, sign-up, password resets and social providers are all handled by
 * Clerk in the frontend, so there are no credential endpoints here. What remains
 * is our local mirror of the account plus the extension pairing token.
 */

exports.me = async (req, res) => {
  res.json({ user: await authService.me(req.user) });
};

exports.updateAccount = async (req, res) => {
  res.json({ user: await authService.updateAccount(req.user, req.body) });
};

exports.checkHandle = async (req, res) => {
  res.json(await authService.checkHandle(req.query.handle));
};

exports.syncFromClerk = async (req, res) => {
  const user = await authService.syncFromClerk(req.user.clerkUserId);
  res.json({ user: (user || req.user).toSafeJSON() });
};

/** Lets the frontend show whether social sign-in is available at all. */
exports.config = async (req, res) => {
  res.json({
    clerkConfigured: clerkService.isConfigured(),
    instituteEmailDomain: process.env.INSTITUTE_EMAIL_DOMAIN || null,
  });
};

exports.extensionToken = async (req, res) => {
  res.json(await authService.getExtensionToken(req.userId));
};

exports.revokeExtensionToken = async (req, res) => {
  res.json(await authService.revokeExtensionToken(req.userId));
};
