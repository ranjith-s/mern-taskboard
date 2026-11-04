const Board = require('../../models/Board');
const List = require('../../models/List');
const Card = require('../../models/Card');
const Activity = require('../../models/Activity');
const User = require('../../models/User');
const AppError = require('../../utils/AppError');
const { GAP } = require('../../utils/position');
const { withTransaction } = require('../../config/db');
const { emitToBoard, closeBoardRoom } = require('../../socket');
const { logActivity } = require('../activity/activity.service');

const { ROLE_RANK } = Board;

const DEFAULT_LISTS = ['To Do', 'In Progress', 'Done'];

// ctx = { user: { id, name }, socketId } - built by the controller.
function notify(board, ctx, type, data) {
  emitToBoard(board._id, 'board:event', { type, data, actorId: ctx.user.id }, ctx.socketId);
}

async function listMyBoards(userId) {
  const boards = await Board.find({ 'members.user': userId })
    .sort({ updatedAt: -1 })
    .populate('owner', 'name')
    .lean();

  return boards.map((b) => ({
    _id: b._id,
    title: b.title,
    description: b.description,
    owner: b.owner,
    memberCount: b.members.length,
    myRole: b.members.find((m) => m.user.toString() === userId).role,
    updatedAt: b.updatedAt,
  }));
}

async function createBoard(ctx, { title, description }) {
  // Board + its default lists are created together: all or nothing.
  return withTransaction(async (session) => {
    const [board] = await Board.create(
      [{ title, description, owner: ctx.user.id, members: [{ user: ctx.user.id, role: 'owner' }] }],
      { session }
    );
    await List.insertMany(
      DEFAULT_LISTS.map((t, i) => ({ board: board._id, title: t, position: (i + 1) * GAP })),
      { session }
    );
    return board;
  });
}

// Everything the board page needs, in 3 parallel queries.
async function getBoardDetail(board, role) {
  const [populated, lists, cards] = await Promise.all([
    board.populate('members.user', 'name email'),
    List.find({ board: board._id }).sort({ position: 1 }).lean(),
    Card.find({ board: board._id })
      .sort({ position: 1 })
      .populate('assignees', 'name email')
      .lean(),
  ]);
  return { board: populated, myRole: role, lists, cards };
}

async function updateBoard(board, ctx, data) {
  Object.assign(board, data);
  await board.save();
  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'board.updated',
    message: `${ctx.user.name} updated the board details`,
  });
  notify(board, ctx, 'board.updated', { title: board.title, description: board.description });
  return board;
}

// Deleting a board must remove its lists, cards and activity too. A
// transaction guarantees we never end up with orphaned cards if the server
// crashes halfway through.
async function deleteBoard(board, ctx) {
  await withTransaction(async (session) => {
    await Card.deleteMany({ board: board._id }, { session });
    await List.deleteMany({ board: board._id }, { session });
    await Activity.deleteMany({ board: board._id }, { session });
    await Board.deleteOne({ _id: board._id }, { session });
  });
  notify(board, ctx, 'board.deleted', { boardId: board._id });
  closeBoardRoom(board._id);
}

/* ---------------------------- Members ---------------------------- */

// Rule: you can only grant a role BELOW your own (owner can grant admin,
// admin can grant member/viewer) and only manage people below you.
function assertCanAssign(actorRole, role) {
  if (actorRole !== 'owner' && ROLE_RANK[role] >= ROLE_RANK[actorRole]) {
    throw AppError.forbidden(`An ${actorRole} cannot assign the ${role} role`);
  }
}

async function addMember(board, ctx, actorRole, { email, role }) {
  assertCanAssign(actorRole, role);

  const user = await User.findOne({ email });
  if (!user) throw AppError.notFound('No user with that email. Ask them to sign up first.');

  // Atomic "add if not already a member". A separate find() + push() would let
  // two concurrent requests add the same user twice.
  const result = await Board.updateOne(
    { _id: board._id, 'members.user': { $ne: user._id } },
    { $push: { members: { user: user._id, role } } }
  );
  if (result.modifiedCount === 0) throw AppError.conflict('User is already a member');

  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'member.added',
    message: `${ctx.user.name} added ${user.name} as ${role}`,
  });
  notify(board, ctx, 'member.added', { userId: user._id, role });
  return { user: { _id: user._id, name: user.name, email: user.email }, role };
}

async function updateMemberRole(board, ctx, actorRole, userId, role) {
  const targetRole = board.getRole(userId);
  if (!targetRole) throw AppError.notFound('Member not found');
  if (targetRole === 'owner') throw AppError.forbidden('The owner role cannot be changed');
  if (actorRole !== 'owner' && ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]) {
    throw AppError.forbidden('You can only manage members below your role');
  }
  assertCanAssign(actorRole, role);

  // Positional operator `$` updates the matched array element in place.
  await Board.updateOne(
    { _id: board._id, 'members.user': userId },
    { $set: { 'members.$.role': role } }
  );

  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'member.role_changed',
    message: `${ctx.user.name} changed a member's role to ${role}`,
    meta: { userId, role },
  });
  notify(board, ctx, 'member.updated', { userId, role });
}

async function removeMember(board, ctx, actorRole, userId) {
  const targetRole = board.getRole(userId);
  if (!targetRole) throw AppError.notFound('Member not found');
  if (targetRole === 'owner') throw AppError.forbidden('The owner cannot be removed');

  const isSelf = userId === ctx.user.id; // anyone can leave a board
  if (!isSelf && ROLE_RANK[actorRole] < ROLE_RANK.admin) {
    throw AppError.forbidden('Only admins can remove members');
  }
  if (!isSelf && ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]) {
    throw AppError.forbidden('You can only remove members below your role');
  }

  await withTransaction(async (session) => {
    await Board.updateOne({ _id: board._id }, { $pull: { members: { user: userId } } }, { session });
    // Removed members should not stay assigned to cards.
    await Card.updateMany(
      { board: board._id, assignees: userId },
      { $pull: { assignees: userId } },
      { session }
    );
  });

  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'member.removed',
    message: isSelf ? `${ctx.user.name} left the board` : `${ctx.user.name} removed a member`,
    meta: { userId },
  });
  notify(board, ctx, 'member.removed', { userId });
}

/* ----------------------------- Stats ----------------------------- */

// One aggregation, several reports at once via $facet.
async function getStats(board) {
  const now = new Date();
  const [result] = await Card.aggregate([
    { $match: { board: board._id } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: { $sum: { $cond: ['$completed', 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$dueDate', null] },
                        { $lt: ['$dueDate', now] },
                        { $eq: ['$completed', false] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
          { $project: { _id: 0 } },
        ],
        byList: [
          { $group: { _id: '$list', count: { $sum: 1 } } },
          { $lookup: { from: 'lists', localField: '_id', foreignField: '_id', as: 'list' } },
          { $unwind: '$list' },
          { $project: { _id: 0, listId: '$_id', title: '$list.title', position: '$list.position', count: 1 } },
          { $sort: { position: 1 } },
        ],
        byAssignee: [
          { $unwind: '$assignees' },
          {
            $group: {
              _id: '$assignees',
              open: { $sum: { $cond: ['$completed', 0, 1] } },
              done: { $sum: { $cond: ['$completed', 1, 0] } },
            },
          },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
          { $unwind: '$user' },
          { $project: { _id: 0, userId: '$_id', name: '$user.name', open: 1, done: 1 } },
          { $sort: { open: -1 } },
        ],
      },
    },
  ]);

  return {
    totals: result.totals[0] || { total: 0, completed: 0, overdue: 0 },
    byList: result.byList,
    byAssignee: result.byAssignee,
  };
}

module.exports = {
  listMyBoards,
  createBoard,
  getBoardDetail,
  updateBoard,
  deleteBoard,
  addMember,
  updateMemberRole,
  removeMember,
  getStats,
};
