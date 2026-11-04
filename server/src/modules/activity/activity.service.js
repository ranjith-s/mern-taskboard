const mongoose = require('mongoose');
const Activity = require('../../models/Activity');
const { emitToBoard } = require('../../socket');

async function logActivity({ board, actor, type, message, meta = {} }, session) {
  const [activity] = await Activity.create([{ board, actor, type, message, meta }], { session });
  emitToBoard(board, 'activity:new', activity);
  return activity;
}

/**
 * Cursor-based pagination (newest first).
 *
 * Offset pagination (skip/limit) gets slower on deep pages (Mongo still walks
 * the skipped docs) and shows duplicates when new items are inserted while
 * the user is paging. A cursor ("give me items older than this _id") uses the
 * { board, _id } index directly and is stable. ObjectIds grow with time,
 * so sorting by _id is the same as sorting by creation time.
 */
async function listActivity(boardId, { cursor, limit }) {
  const filter = { board: boardId };
  if (cursor) filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };

  // Fetch one extra item to know whether another page exists.
  const items = await Activity.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('actor', 'name email')
    .lean();

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, nextCursor: hasMore ? items[items.length - 1]._id : null };
}

module.exports = { logActivity, listActivity };
