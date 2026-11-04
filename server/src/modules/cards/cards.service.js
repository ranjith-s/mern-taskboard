const Card = require('../../models/Card');
const List = require('../../models/List');
const AppError = require('../../utils/AppError');
const { positionAtIndex } = require('../../utils/position');
const { emitToBoard } = require('../../socket');
const { logActivity } = require('../activity/activity.service');
const { findListOrThrow } = require('../lists/lists.service');

const ASSIGNEE_FIELDS = 'name email';

function notify(board, ctx, type, data) {
  emitToBoard(board._id, 'board:event', { type, data, actorId: ctx.user.id }, ctx.socketId);
}

async function findCardOrThrow(board, cardId) {
  const card = await Card.findOne({ _id: cardId, board: board._id });
  if (!card) throw AppError.notFound('Card not found');
  return card;
}

async function createCard(board, ctx, { listId, title, description }) {
  const list = await findListOrThrow(board, listId);
  const position = await positionAtIndex(Card, { list: list._id }); // append at bottom

  const card = await Card.create({
    board: board._id,
    list: list._id,
    title,
    description,
    position,
    createdBy: ctx.user.id,
  });

  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'card.created',
    message: `${ctx.user.name} added "${title}" to ${list.title}`,
    meta: { cardId: card._id },
  });
  notify(board, ctx, 'card.created', card);
  return card;
}

/**
 * OPTIMISTIC LOCKING
 *
 * Problem: Asha and Ravi open the same card. Asha saves a new description,
 * then Ravi saves his (older) copy -> Asha's change is silently lost
 * ("lost update").
 *
 * Fix: every card has a `version`. The update only matches if the version in
 * the DB is still the one the client read, and it bumps the version in the
 * SAME atomic operation. If someone else saved first, nothing matches and we
 * return 409 Conflict with the latest card, so the client can show it.
 * No locks are held, so it's cheap - a good fit when conflicts are rare.
 */
async function updateCard(board, ctx, cardId, { version, ...changes }) {
  if (changes.assignees) {
    const memberIds = new Set(board.members.map((m) => m.user.toString()));
    const invalid = changes.assignees.filter((id) => !memberIds.has(id));
    if (invalid.length) throw AppError.badRequest('Assignees must be board members');
    changes.assignees = [...new Set(changes.assignees)];
  }

  const updated = await Card.findOneAndUpdate(
    { _id: cardId, board: board._id, version },
    { $set: changes, $inc: { version: 1 } },
    { new: true, runValidators: true }
  ).populate('assignees', ASSIGNEE_FIELDS);

  if (!updated) {
    const current = await Card.findOne({ _id: cardId, board: board._id }).populate(
      'assignees',
      ASSIGNEE_FIELDS
    );
    if (!current) throw AppError.notFound('Card not found');
    throw AppError.conflict('This card was changed by someone else. Review the latest version.', {
      current,
    });
  }

  if (changes.completed !== undefined) {
    await logActivity({
      board: board._id,
      actor: ctx.user.id,
      type: changes.completed ? 'card.completed' : 'card.reopened',
      message: `${ctx.user.name} marked "${updated.title}" as ${changes.completed ? 'done' : 'not done'}`,
      meta: { cardId: updated._id },
    });
  }
  notify(board, ctx, 'card.updated', updated);
  return updated;
}

async function moveCard(board, ctx, cardId, { toListId, index }) {
  const card = await findCardOrThrow(board, cardId);
  const toList = await findListOrThrow(board, toListId);
  const fromListId = card.list.toString();

  const position = await positionAtIndex(Card, { list: toList._id }, index, card._id);

  // A single atomic update: list + position. Moving is not treated as a
  // content edit, so it does not bump `version`.
  const moved = await Card.findOneAndUpdate(
    { _id: card._id },
    { $set: { list: toList._id, position } },
    { new: true }
  ).populate('assignees', ASSIGNEE_FIELDS);

  if (fromListId !== toList._id.toString()) {
    const fromList = await List.findById(fromListId).select('title').lean();
    await logActivity({
      board: board._id,
      actor: ctx.user.id,
      type: 'card.moved',
      message: `${ctx.user.name} moved "${card.title}" from ${fromList?.title ?? 'a list'} to ${toList.title}`,
      meta: { cardId: card._id, from: fromListId, to: toList._id },
    });
  }
  notify(board, ctx, 'card.moved', moved);
  return moved;
}

async function deleteCard(board, ctx, cardId) {
  const card = await findCardOrThrow(board, cardId);
  await card.deleteOne();
  await logActivity({
    board: board._id,
    actor: ctx.user.id,
    type: 'card.deleted',
    message: `${ctx.user.name} deleted "${card.title}"`,
  });
  notify(board, ctx, 'card.deleted', { cardId: card._id });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Search + filter with OFFSET pagination (page/limit) and a total count -
 * fine for "page 1 of 5" UIs on small result sets. (The activity feed uses
 * cursor pagination instead; compare the two.)
 *
 * We use a case-insensitive regex so partial words match ("logi" -> "login").
 * The text index on the model is the faster option for whole-word search on
 * big collections: { $text: { $search: q } }.
 */
async function searchCards(board, { q, assignee, label, page, limit }) {
  const filter = { board: board._id };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i'); // escape user input: no ReDoS / regex injection
    filter.$or = [{ title: rx }, { description: rx }];
  }
  if (assignee) filter.assignees = assignee;
  if (label) filter.labels = label;

  const [items, total] = await Promise.all([
    Card.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('assignees', ASSIGNEE_FIELDS)
      .populate('list', 'title')
      .lean(),
    Card.countDocuments(filter),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = { createCard, updateCard, moveCard, deleteCard, searchCards };
