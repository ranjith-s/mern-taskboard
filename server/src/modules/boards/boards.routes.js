const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const boardAccess = require('../../middlewares/boardAccess');
const { validate } = require('../../middlewares/validate');
const s = require('./boards.schema');
const ctrl = require('./boards.controller');
const listRoutes = require('../lists/lists.routes');
const cardRoutes = require('../cards/cards.routes');
const activityRoutes = require('../activity/activity.routes');

// Mounted at /api/boards (requireAuth is applied in app.js)
const router = express.Router();

router.get('/', asyncHandler(ctrl.list));
router.post('/', validate({ body: s.createBoardSchema }), asyncHandler(ctrl.create));

// --- Single board. Minimum role is declared per route = RBAC at a glance.
router.get('/:boardId', boardAccess('viewer'), asyncHandler(ctrl.get));
router.patch('/:boardId', boardAccess('admin'), validate({ body: s.updateBoardSchema }), asyncHandler(ctrl.update));
router.delete('/:boardId', boardAccess('owner'), asyncHandler(ctrl.remove));
router.get('/:boardId/stats', boardAccess('viewer'), asyncHandler(ctrl.stats));

// --- Members
router.post(
  '/:boardId/members',
  boardAccess('admin'),
  validate({ body: s.addMemberSchema }),
  asyncHandler(ctrl.addMember)
);
router.patch(
  '/:boardId/members/:userId',
  boardAccess('admin'),
  validate({ params: s.memberParams, body: s.updateMemberSchema }),
  asyncHandler(ctrl.updateMember)
);
// viewer+ so that anyone can leave; the service checks who can remove whom.
router.delete(
  '/:boardId/members/:userId',
  boardAccess('viewer'),
  validate({ params: s.memberParams }),
  asyncHandler(ctrl.removeMember)
);

// --- Nested resources (they read :boardId thanks to mergeParams)
router.use('/:boardId/lists', listRoutes);
router.use('/:boardId/cards', cardRoutes);
router.use('/:boardId/activity', activityRoutes);

module.exports = router;
