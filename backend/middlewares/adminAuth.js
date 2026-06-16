function adminAuth(req, res, next) {
  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret) {
    return res.status(500).json({ error: 'ADMIN_SECRET is not configured' });
  }

  const providedSecret = req.headers['x-admin-secret'];
  if (providedSecret !== expectedSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return next();
}

module.exports = adminAuth;
