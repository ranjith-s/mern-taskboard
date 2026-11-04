const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const boardAccess = require('../../middlewares/boardAccess');
const { validate, objectId } = require('../../middlewares/validate');
const ctrl = require('./lists.controller');

// Mounted at /api/boards/:boardId/lists
const router = express.Router({ mergeParams: true });

const titleBody = z.object({ title: z.string().trim().min(1).max(100) });
const listParams = z.object({ boardId: objectId, listId: objectId });
const moveBody = z.object({ index: z.number().int().min(0) });

// Every list operation needs at least the 'member' role.
router.use(boardAccess('member'));

router.post('/', validate({ body: titleBody }), asyncHandler(ctrl.create));
router.patch('/:listId', validate({ params: listParams, body: titleBody }), asyncHandler(ctrl.update));
router.post('/:listId/move', validate({ params: listParams, body: moveBody }), asyncHandler(ctrl.move));
router.delete('/:listId', validate({ params: listParams }), asyncHandler(ctrl.remove));

module.exports = router;
