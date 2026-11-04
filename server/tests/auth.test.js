const request = require('supertest');
const { app, api, registerUser } = require('./helpers');

// "refreshToken=abc; Path=/api/auth; HttpOnly" -> "refreshToken=abc"
const refreshCookie = (cookies) => cookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];

describe('Auth', () => {
  test('register returns user + access token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha', email: 'Asha@Test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('asha@test.com'); // normalised
    expect(res.body.user.password).toBeUndefined(); // never leaked
    expect(res.body.accessToken).toBeDefined();

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  test('rejects duplicate email with 409', async () => {
    await registerUser({ email: 'dup@test.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup', email: 'dup@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('rejects weak passwords with field-level errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak', email: 'weak@test.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => d.field === 'body.password')).toBe(true);
  });

  test('login uses the same error for unknown email and wrong password', async () => {
    const user = await registerUser();
    const wrongPass = await request(app).post('/api/auth/login').send({ email: user.email, password: 'nope12345' });
    const noUser = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'nope12345' });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.body.message).toBe(noUser.body.message);
  });

  test('blocks NoSQL injection in login', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test('protected routes need a valid access token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const user = await registerUser();
    const me = await api(user).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
  });

  test('refresh rotates the token, and reusing an old token revokes all sessions', async () => {
    const user = await registerUser();
    const first = refreshCookie(user.cookies);

    // 1st refresh works and returns a NEW refresh token
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeDefined();
    const second = refreshCookie(r1.headers['set-cookie']);
    expect(second).not.toBe(first);

    // Reusing the OLD token = theft signal -> 401
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(reuse.status).toBe(401);
    expect(reuse.body.message).toMatch(/reuse/i);

    // ...and the newer token was revoked too (all sessions killed)
    const afterReuse = await request(app).post('/api/auth/refresh').set('Cookie', second);
    expect(afterReuse.status).toBe(401);
  });

  test('logout revokes the refresh token', async () => {
    const user = await registerUser();
    const cookie = refreshCookie(user.cookies);
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});
