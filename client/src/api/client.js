import axios from 'axios';
import { getSocketId } from './socket';

// Access token lives in memory only (not localStorage), so an XSS script
// can't simply read it from storage. After a page reload it is gone, and we
// get a fresh one from /auth/refresh (the refresh token is an httpOnly cookie).
let accessToken = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (t) => {
  accessToken = t;
};

let onSessionExpired = () => {};
export const setOnSessionExpired = (fn) => {
  onSessionExpired = fn;
};

const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  const socketId = getSocketId();
  if (socketId) config.headers['x-socket-id'] = socketId; // don't echo realtime events back to us
  return config;
});

// If several requests get 401 at the same time, they must share ONE refresh
// call. Otherwise the 2nd refresh would reuse a rotated token -> the server
// sees "reuse" and logs the user out everywhere.
let refreshPromise = null;

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/auth/refresh', null, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const expired = error.response?.status === 401 && !original._retry && !original.url.startsWith('/auth/');
    if (!expired) return Promise.reject(error);

    original._retry = true;
    try {
      await refreshAccessToken();
      return api(original); // retry once with the new token
    } catch (refreshError) {
      setAccessToken(null);
      onSessionExpired();
      return Promise.reject(refreshError);
    }
  }
);

export const errorMessage = (err) => err.response?.data?.message || err.message || 'Something went wrong';

export default api;
