const mongoose = require('mongoose');

/**
 * Append-only record of every privileged action.
 *
 * The admin panel can edit student records, reassign claimed profiles, delete
 * accounts and trigger jobs — all of which are invisible after the fact without
 * this. It answers "who changed this, when, and what was it before?", which
 * matters most when something was changed by mistake.
 */
const auditLogSchema = new mongoose.Schema({
  /** Null when the action came from the shared-secret path (scripts, CI). */
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  /** Denormalized so the log stays readable after an account is deleted. */
  actorLabel: { type: String, default: 'unknown' },

  action: { type: String, required: true, index: true },

  targetType: {
    type: String,
    enum: ['student', 'user', 'claim', 'problem', 'sheet', 'contest', 'job', 'system'],
    required: true,
    index: true,
  },
  targetId: { type: String, default: '' },
  /** Human-readable target, e.g. a roll number or sheet title. */
  targetLabel: { type: String, default: '' },

  /**
   * Free-form context: for an edit, the before/after of the changed fields; for
   * a job, its result summary.
   */
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

  ip: { type: String, default: '' },
  outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
  error: { type: String, default: '' },
}, {
  timestamps: true,
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
