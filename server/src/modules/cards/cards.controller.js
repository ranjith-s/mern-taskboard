const cardsService = require('./cards.service');
const { ctxOf } = require('../../utils/requestContext');

exports.search = async (req, res) => {
  res.json(await cardsService.searchCards(req.board, req.query));
};

exports.create = async (req, res) => {
  res.status(201).json({ card: await cardsService.createCard(req.board, ctxOf(req), req.body) });
};

exports.update = async (req, res) => {
  const card = await cardsService.updateCard(req.board, ctxOf(req), req.params.cardId, req.body);
  res.json({ card });
};

exports.move = async (req, res) => {
  const card = await cardsService.moveCard(req.board, ctxOf(req), req.params.cardId, req.body);
  res.json({ card });
};

exports.remove = async (req, res) => {
  await cardsService.deleteCard(req.board, ctxOf(req), req.params.cardId);
  res.status(204).end();
};
