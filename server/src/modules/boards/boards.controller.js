const boardsService = require('./boards.service');
const { ctxOf } = require('../../utils/requestContext');

exports.list = async (req, res) => {
  res.json({ boards: await boardsService.listMyBoards(req.user.id) });
};

exports.create = async (req, res) => {
  const board = await boardsService.createBoard(ctxOf(req), req.body);
  res.status(201).json({ board });
};

exports.get = async (req, res) => {
  res.json(await boardsService.getBoardDetail(req.board, req.role));
};

exports.update = async (req, res) => {
  res.json({ board: await boardsService.updateBoard(req.board, ctxOf(req), req.body) });
};

exports.remove = async (req, res) => {
  await boardsService.deleteBoard(req.board, ctxOf(req));
  res.status(204).end();
};

exports.addMember = async (req, res) => {
  const member = await boardsService.addMember(req.board, ctxOf(req), req.role, req.body);
  res.status(201).json({ member });
};

exports.updateMember = async (req, res) => {
  await boardsService.updateMemberRole(
    req.board,
    ctxOf(req),
    req.role,
    req.params.userId,
    req.body.role
  );
  res.status(204).end();
};

exports.removeMember = async (req, res) => {
  await boardsService.removeMember(req.board, ctxOf(req), req.role, req.params.userId);
  res.status(204).end();
};

exports.stats = async (req, res) => {
  res.json(await boardsService.getStats(req.board));
};
