import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(getToken) {
  if (socket) return socket;
  socket = io({
    // A function, so every (re)connect sends the CURRENT access token.
    auth: (cb) => cb({ token: getToken() }),
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
export const getSocketId = () => socket?.id;
