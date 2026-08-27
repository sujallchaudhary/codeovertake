const mongoose = require('mongoose');

/**
 * Following a sheet is what makes it trackable: Codolio only lets you mark
 * questions done / star / annotate on a public sheet once you follow it, and
 * followed sheets show up under "My Sheets".
 *
 * Unfollowing removes the shortcut but never touches the user's solved
 * questions, which live independently on TrackedQuestion.
 */
const sheetFollowSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sheet: { type: mongoose.Schema.Types.ObjectId, ref: 'Sheet', required: true, index: true },
}, {
  timestamps: true,
});

sheetFollowSchema.index({ user: 1, sheet: 1 }, { unique: true });

module.exports = mongoose.model('SheetFollow', sheetFollowSchema);
