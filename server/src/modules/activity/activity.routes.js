const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const boardAccess = require('../../middlewares/boardAccess');
const { validate, objectId } = require('../../middlewares/validate');
const { listActivity } = require('./activity.service');

// Mounted at /api/boards/:boardId/activity
const router = express.Router({ mergeParams: true });

const listQuery = z.object({
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get(
  '/',
  boardAccess('viewer'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    res.json(await listActivity(req.board._id, req.query));
  })
);

module.exports = router;
