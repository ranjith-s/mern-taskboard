const List = require('../../models/List');
const Card = require('../../models/Card');
const AppError = require('../../utils/AppError');
const { positionAtIndex } = require('../../utils/position');
const { withTransaction } = require('../../config/db');
const { emitToBoard } = require('../../socket');
const { logActivity } = require('../activity/activity.service');

function notify(board, ctx, type, data) {
  emitToBoard(board._id, 'board:event', { type, data, actorId: ctx.user.id }, ctx.socketId);
}

// Always query by { _id, board }: a list id from ANOTHER board must not work
// here, even if the user is a member of this board (prevents IDOR).
async function findListOrThrow(board, listId) {
  const list = await List.findOne({ _id: listId, board: board._id });
  if (!list) throw AppError.notFound('List not found');
  return list;
}

async function createList(board, ctx, { title }) {
  const position = await positionAtIndex(List, { board: board._id }); // append at end
  const list = await List.create({ board: board._id, title, position });
  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'list.created',
    message: `${ctx.user.name} added list "${title}"`,
  });
  notify(board, ctx, 'list.created', list);
  return list;
}

async function updateList(board, ctx, listId, { title }) {
  const list = await findListOrThrow(board, listId);
  list.title = title;
  await list.save();
  notify(board, ctx, 'list.updated', list);
  return list;
}

async function moveList(board, ctx, listId, { index }) {
  const list = await findListOrThrow(board, listId);
  list.position = await positionAtIndex(List, { board: board._id }, index, list._id);
  await list.save();
  notify(board, ctx, 'list.moved', list);
  return list;
}

async function deleteList(board, ctx, listId) {
  const list = await findListOrThrow(board, listId);
  await withTransaction(async (session) => {
    await Card.deleteMany({ list: list._id }, { session });
    await List.deleteOne({ _id: list._id }, { session });
  });
  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'list.deleted',
    message: `${ctx.user.name} deleted list "${list.title}"`,
  });
  notify(board, ctx, 'list.deleted', { listId: list._id });
}

module.exports = { findListOrThrow, createList, updateList, moveList, deleteList };
