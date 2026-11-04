const request = require('supertest');
const app = require('../src/app');

let counter = 0;

async function registerUser(overrides = {}) {
  counter += 1;
  const data = {
    name: `User ${counter}`,
    email: `user${counter}@test.com`,
    password: 'password123',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(data);
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { ...data, id: res.body.user._id, token: res.body.accessToken, cookies: res.headers['set-cookie'] };
}

// Shorthand: api(user).get('/api/boards')
function api(user) {
  const auth = (r) => (user ? r.set('Authorization', `Bearer ${user.token}`) : r);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url) => auth(request(app).post(url)),
    patch: (url) => auth(request(app).patch(url)),
    delete: (url) => auth(request(app).delete(url)),
  };
}

async function createBoard(user, title = 'Test board') {
  const res = await api(user).post('/api/boards').send({ title });
  const detail = await api(user).get(`/api/boards/${res.body.board._id}`);
  return { board: detail.body.board, lists: detail.body.lists };
}

async function addMember(owner, boardId, member, role) {
  const res = await api(owner).post(`/api/boards/${boardId}/members`).send({ email: member.email, role });
  if (res.status !== 201) throw new Error(`addMember failed: ${JSON.stringify(res.body)}`);
}

module.exports = { app, api, registerUser, createBoard, addMember };
