import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { getAccessToken, refreshAccessToken, setAccessToken, setOnSessionExpired } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until we know if a session exists

  const startSession = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    const socket = connectSocket(getAccessToken);
    // The socket authenticates only during the handshake. If it reconnects
    // after the access token expired, refresh the token and try again.
    socket.off('connect_error').on('connect_error', (err) => {
      if (err.message !== 'Unauthorized') return;
      refreshAccessToken()
        .then(() => socket.connect())
        .catch(() => {});
    });
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  // On page load: try to restore the session from the refresh cookie.
  useEffect(() => {
    setOnSessionExpired(endSession);
    refreshAccessToken()
      .then(startSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [startSession, endSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (email, password) => startSession((await api.post('/auth/login', { email, password })).data),
      register: async (form) => startSession((await api.post('/auth/register', form)).data),
      logout: async () => {
        await api.post('/auth/logout').catch(() => {});
        endSession();
      },
    }),
    [user, loading, startSession, endSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
