const { Server } = require('socket.io');
const Board = require('../models/Board');
const env = require('../config/env');
const { verifyAccessToken } = require('../utils/tokens');

let io = null;

const room = (boardId) => `board:${boardId}`;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
  });

  // Authenticate once, during the handshake (same JWT as the REST API).
  io.use((socket, next) => {
    try {
      const payload = verifyAccessToken(socket.handshake.auth?.token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Client asks to join a board's room. We check membership before joining,
    // otherwise anyone could listen to any board's updates.
    socket.on('board:join', async (boardId, ack) => {
      try {
        const isMember = await Board.exists({ _id: boardId, 'members.user': socket.data.userId });
        if (!isMember) return ack?.({ ok: false, message: 'Board not found' });
        socket.join(room(boardId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, message: 'Could not join board' });
      }
    });

    socket.on('board:leave', (boardId) => socket.leave(room(boardId)));
  });

  return io;
}

/**
 * Broadcast a change to everyone viewing the board.
 * `excludeSocketId` = the socket of the user who made the change: their UI
 * already updated from the HTTP response, so they don't need the event.
 */
function emitToBoard(boardId, event, payload, excludeSocketId) {
  if (!io) return; // e.g. in tests
  let target = io.to(room(boardId.toString()));
  if (excludeSocketId) target = target.except(excludeSocketId);
  target.emit(event, payload);
}

// Remove everyone from a room (board deleted / member removed).
function closeBoardRoom(boardId) {
  if (!io) return;
  io.in(room(boardId.toString())).socketsLeave(room(boardId.toString()));
}

module.exports = { initSocket, emitToBoard, closeBoardRoom };
