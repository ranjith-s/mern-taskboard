const mongoose = require('mongoose');

const ROLES = ['owner', 'admin', 'member', 'viewer'];

// Higher number = more power. Used for "at least X" permission checks.
const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };

// Members are EMBEDDED: a board has a small, bounded number of members,
// and we need them on almost every request (permission checks).
// Lists and cards are REFERENCED (separate collections): they grow
// without limit and are updated independently.
const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { _id: false }
);

const boardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
  },
  { timestamps: true }
);

// "Which boards am I in?" -> multikey index on the embedded array.
boardSchema.index({ 'members.user': 1 });

boardSchema.methods.getRole = function getRole(userId) {
  const m = this.members.find((x) => x.user.toString() === userId.toString());
  return m ? m.role : null;
};

module.exports = mongoose.model('Board', boardSchema);
module.exports.ROLES = ROLES;
module.exports.ROLE_RANK = ROLE_RANK;
