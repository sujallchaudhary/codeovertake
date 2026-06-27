const mongoose = require('mongoose');

const metaSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Meta', metaSchema);
