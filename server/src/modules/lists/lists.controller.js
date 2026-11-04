const listsService = require('./lists.service');
const { ctxOf } = require('../../utils/requestContext');

exports.create = async (req, res) => {
  res.status(201).json({ list: await listsService.createList(req.board, ctxOf(req), req.body) });
};

exports.update = async (req, res) => {
  const list = await listsService.updateList(req.board, ctxOf(req), req.params.listId, req.body);
  res.json({ list });
};

exports.move = async (req, res) => {
  const list = await listsService.moveList(req.board, ctxOf(req), req.params.listId, req.body);
  res.json({ list });
};

exports.remove = async (req, res) => {
  await listsService.deleteList(req.board, ctxOf(req), req.params.listId);
  res.status(204).end();
};
