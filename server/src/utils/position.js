// Ordering cards/lists with "fractional indexing".
//
// Naive approach: store index 0,1,2,3... -> moving one card means rewriting
// the index of every card after it (O(n) writes).
// Here: each item has a float `position`. To move an item between A and B we
// set position = (A + B) / 2 -> exactly ONE write per move.
//
// Floats eventually run out of precision after many moves into the same gap,
// so when the gap gets too small we rebalance the whole list once
// (a single bulkWrite) and continue.

const GAP = 1024;
const MIN_GAP = 1e-6;

function positionBetween(before, after) {
  if (before == null && after == null) return GAP;
  if (before == null) return after / 2;
  if (after == null) return before + GAP;
  return (before + after) / 2;
}

function needsRebalance(before, after) {
  if (before == null || after == null) return false;
  return Math.abs(after - before) < MIN_GAP;
}

/**
 * Position for an item dropped at `index` among the items matching `filter`
 * (the item being moved is excluded). The client only sends the index it got
 * from drag-and-drop; the server works out the neighbours itself, so a
 * stale client can't send nonsense positions.
 */
async function positionAtIndex(Model, filter, index, excludeId, session) {
  const query = { ...filter };
  if (excludeId) query._id = { $ne: excludeId };

  let siblings = await Model.find(query)
    .sort({ position: 1 })
    .select('position')
    .session(session || null)
    .lean();

  const i = Math.max(0, Math.min(index ?? siblings.length, siblings.length));

  if (needsRebalance(siblings[i - 1]?.position, siblings[i]?.position)) {
    // Reset positions to 1024, 2048, 3072... in one round trip.
    await Model.bulkWrite(
      siblings.map((s, k) => ({
        updateOne: { filter: { _id: s._id }, update: { $set: { position: (k + 1) * GAP } } },
      })),
      { session }
    );
    siblings = siblings.map((s, k) => ({ ...s, position: (k + 1) * GAP }));
  }

  return positionBetween(siblings[i - 1]?.position, siblings[i]?.position);
}

module.exports = { GAP, positionBetween, needsRebalance, positionAtIndex };
