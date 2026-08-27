const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  platform: { type: String, required: true, index: true },
  externalId: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true },
  registrationUrl: { type: String, default: '' },
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true },
  durationSeconds: { type: Number, default: 0 },
  contestType: { type: String, default: '' },
  ratedRange: { type: String, default: '' },
}, {
  timestamps: true,
});

// One row per contest per platform; the sync job upserts on this key
contestSchema.index({ platform: 1, externalId: 1 }, { unique: true });
contestSchema.index({ startTime: 1, platform: 1 });

/** Derived phase, computed at read time so it is never stale in the DB. */
contestSchema.virtual('status').get(function status() {
  const now = Date.now();
  if (now < this.startTime.getTime()) return 'upcoming';
  if (now <= this.endTime.getTime()) return 'ongoing';
  return 'finished';
});

contestSchema.set('toJSON', { virtuals: true });
contestSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Contest', contestSchema);
