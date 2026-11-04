const mongoose = require('mongoose');

const listSchema = new mongoose.Schema(
  {
    board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    position: { type: Number, required: true },
  },
  { timestamps: true }
);

// Supports "all lists of a board, in order" with an index scan, no in-memory sort.
listSchema.index({ board: 1, position: 1 });

module.exports = mongoose.model('List', listSchema);
