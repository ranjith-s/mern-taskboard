const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
  {
    board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
    list: { type: mongoose.Schema.Types.ObjectId, ref: 'List', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    position: { type: Number, required: true },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    labels: [{ type: String, trim: true, maxlength: 30 }],
    dueDate: { type: Date, default: null },
    completed: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  // `version` is used for optimistic locking (see cards.service.js#updateCard)
  { timestamps: true, versionKey: 'version' }
);

// Cards of a list in order (board view + moving cards).
cardSchema.index({ list: 1, position: 1 });
// Board-wide queries: search, filter by assignee, stats aggregation.
cardSchema.index({ board: 1, assignees: 1 });
// Full-text search on title + description.
cardSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Card', cardSchema);
