const mongoose = require('mongoose');

// Append-only audit log: "Ravi moved 'Fix login' to Done".
const activitySchema = new mongoose.Schema(
  {
    board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true }, // e.g. 'card.created', 'card.moved'
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Newest-first feed per board, paginated by _id (cursor pagination).
activitySchema.index({ board: 1, _id: -1 });

module.exports = mongoose.model('Activity', activitySchema);
