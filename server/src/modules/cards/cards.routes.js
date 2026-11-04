const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const boardAccess = require('../../middlewares/boardAccess');
const { validate } = require('../../middlewares/validate');
const s = require('./cards.schema');
const ctrl = require('./cards.controller');

// Mounted at /api/boards/:boardId/cards
const router = express.Router({ mergeParams: true });

router.get('/', boardAccess('viewer'), validate({ query: s.searchQuerySchema }), asyncHandler(ctrl.search));

router.post('/', boardAccess('member'), validate({ body: s.createCardSchema }), asyncHandler(ctrl.create));
router.patch(
  '/:cardId',
  boardAccess('member'),
  validate({ params: s.cardParams, body: s.updateCardSchema }),
  asyncHandler(ctrl.update)
);
router.post(
  '/:cardId/move',
  boardAccess('member'),
  validate({ params: s.cardParams, body: s.moveCardSchema }),
  asyncHandler(ctrl.move)
);
router.delete('/:cardId', boardAccess('member'), validate({ params: s.cardParams }), asyncHandler(ctrl.remove));

module.exports = router;
