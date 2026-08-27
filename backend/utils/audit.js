const AuditLog = require('../models/AuditLog');

/**
 * Writes an audit entry.
 *
 * Never throws: an audit write failing must not roll back the action the admin
 * actually asked for. A missing log line is bad; a half-applied change is worse.
 *
 * @param {Object} req the Express request (for the actor and IP)
 * @param {{action:string, targetType:string, targetId?:string,
 *          targetLabel?:string, metadata?:Object, outcome?:string,
 *          error?:string}} entry
 */
async function recordAudit(req, entry) {
  try {
    await AuditLog.create({
      actor: req.user?._id || null,
      // Falls back to a marker for the shared-secret path, which has no user
      actorLabel: req.user?.handle || (req.adminViaSecret ? 'shared-secret' : 'unknown'),
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ? String(entry.targetId) : '',
      targetLabel: entry.targetLabel || '',
      metadata: entry.metadata || {},
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      outcome: entry.outcome || 'success',
      error: entry.error || '',
    });
  } catch (error) {
    console.error(`[AUDIT] Could not record "${entry.action}": ${error.message}`);
  }
}

/**
 * Builds a compact before/after diff for the fields that actually changed, so
 * the log records the change rather than the whole document.
 */
function diffFields(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    const from = before?.[field];
    const to = after?.[field];
    if (String(from ?? '') !== String(to ?? '')) {
      changes[field] = { from: from ?? null, to: to ?? null };
    }
  }
  return changes;
}

module.exports = { recordAudit, diffFields };
