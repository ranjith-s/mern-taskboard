const mongoose = require('mongoose');
const Board = require('../models/Board');
const AppError = require('../utils/AppError');

const { ROLE_RANK } = Board;

/**
 * RBAC for everything under /api/boards/:boardId.
 *
 *   router.patch('/', boardAccess('admin'), handler)  -> admin or owner only
 *
 * Loads the board ONLY if the user is a member. A non-member gets 404, not 403,
 * so we don't reveal that the board exists at all.
 */
function boardAccess(minRole = 'viewer') {
  return async (req, _res, next) => {
    try {
      if (!req.board) {
        const { boardId } = req.params;
        if (!mongoose.isValidObjectId(boardId)) throw AppError.notFound('Board not found');

        const board = await Board.findOne({ _id: boardId, 'members.user': req.user.id });
        if (!board) throw AppError.notFound('Board not found');

        req.board = board;
        req.role = board.getRole(req.user.id);
      }

      if (ROLE_RANK[req.role] < ROLE_RANK[minRole]) {
        throw AppError.forbidden(`Requires ${minRole} role or higher`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = boardAccess;
