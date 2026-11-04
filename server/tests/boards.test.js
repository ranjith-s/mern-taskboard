const { api, registerUser, createBoard, addMember } = require('./helpers');
const Card = require('../src/models/Card');
const List = require('../src/models/List');

describe('Boards', () => {
  test('creating a board makes you owner and adds 3 default lists', async () => {
    const owner = await registerUser();
    const { board, lists } = await createBoard(owner);
    expect(board.members).toHaveLength(1);
    expect(board.members[0].role).toBe('owner');
    expect(lists.map((l) => l.title)).toEqual(['To Do', 'In Progress', 'Done']);

    const mine = await api(owner).get('/api/boards');
    expect(mine.body.boards).toHaveLength(1);
    expect(mine.body.boards[0].myRole).toBe('owner');
  });

  test('non-members get 404 (not 403) so board existence is not leaked', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const { board } = await createBoard(owner);
    const res = await api(stranger).get(`/api/boards/${board._id}`);
    expect(res.status).toBe(404);
  });

  test('invalid board id returns 404, not 500', async () => {
    const owner = await registerUser();
    expect((await api(owner).get('/api/boards/not-an-id')).status).toBe(404);
  });

  describe('RBAC', () => {
    let owner, admin, member, viewer, board, lists;

    beforeEach(async () => {
      owner = await registerUser();
      admin = await registerUser();
      member = await registerUser();
      viewer = await registerUser();
      ({ board, lists } = await createBoard(owner));
      await addMember(owner, board._id, admin, 'admin');
      await addMember(owner, board._id, member, 'member');
      await addMember(owner, board._id, viewer, 'viewer');
    });

    test('viewer can read but not write', async () => {
      expect((await api(viewer).get(`/api/boards/${board._id}`)).status).toBe(200);
      const res = await api(viewer)
        .post(`/api/boards/${board._id}/cards`)
        .send({ listId: lists[0]._id, title: 'Nope' });
      expect(res.status).toBe(403);
    });

    test('member can create cards but cannot rename the board', async () => {
      const card = await api(member)
        .post(`/api/boards/${board._id}/cards`)
        .send({ listId: lists[0]._id, title: 'Yes' });
      expect(card.status).toBe(201);
      expect((await api(member).patch(`/api/boards/${board._id}`).send({ title: 'X' })).status).toBe(403);
    });

    test('admin can rename, but only the owner can delete', async () => {
      expect((await api(admin).patch(`/api/boards/${board._id}`).send({ title: 'Renamed' })).status).toBe(200);
      expect((await api(admin).delete(`/api/boards/${board._id}`)).status).toBe(403);
    });

    test('admin cannot create another admin or demote an admin', async () => {
      const newbie = await registerUser();
      const res = await api(admin)
        .post(`/api/boards/${board._id}/members`)
        .send({ email: newbie.email, role: 'admin' });
      expect(res.status).toBe(403);

      const other = await registerUser();
      await addMember(owner, board._id, other, 'admin');
      const demote = await api(admin)
        .patch(`/api/boards/${board._id}/members/${other.id}`)
        .send({ role: 'viewer' });
      expect(demote.status).toBe(403);
    });

    test('owner role cannot be assigned through the API (mass assignment)', async () => {
      const newbie = await registerUser();
      const res = await api(owner)
        .post(`/api/boards/${board._id}/members`)
        .send({ email: newbie.email, role: 'owner' });
      expect(res.status).toBe(400);
    });

    test('member cannot remove others but can leave the board', async () => {
      expect((await api(member).delete(`/api/boards/${board._id}/members/${viewer.id}`)).status).toBe(403);
      expect((await api(member).delete(`/api/boards/${board._id}/members/${member.id}`)).status).toBe(204);
      expect((await api(member).get(`/api/boards/${board._id}`)).status).toBe(404);
    });

    test('removing a member unassigns them from cards', async () => {
      const { body } = await api(owner)
        .post(`/api/boards/${board._id}/cards`)
        .send({ listId: lists[0]._id, title: 'Task' });
      await api(owner)
        .patch(`/api/boards/${board._id}/cards/${body.card._id}`)
        .send({ version: body.card.version, assignees: [member.id] });

      await api(admin).delete(`/api/boards/${board._id}/members/${member.id}`).expect(204);
      const card = await Card.findById(body.card._id);
      expect(card.assignees).toHaveLength(0);
    });

    test('adding an existing member returns 409', async () => {
      const res = await api(owner)
        .post(`/api/boards/${board._id}/members`)
        .send({ email: member.email, role: 'viewer' });
      expect(res.status).toBe(409);
    });
  });

  test('deleting a board cascades to lists and cards', async () => {
    const owner = await registerUser();
    const { board, lists } = await createBoard(owner);
    await api(owner).post(`/api/boards/${board._id}/cards`).send({ listId: lists[0]._id, title: 'A' });

    await api(owner).delete(`/api/boards/${board._id}`).expect(204);
    expect(await List.countDocuments({ board: board._id })).toBe(0);
    expect(await Card.countDocuments({ board: board._id })).toBe(0);
  });

  test('stats aggregation counts cards per list and overdue cards', async () => {
    const owner = await registerUser();
    const { board, lists } = await createBoard(owner);
    const base = `/api/boards/${board._id}/cards`;

    const a = (await api(owner).post(base).send({ listId: lists[0]._id, title: 'A' })).body.card;
    await api(owner).post(base).send({ listId: lists[0]._id, title: 'B' });
    await api(owner).post(base).send({ listId: lists[2]._id, title: 'C' });
    await api(owner)
      .patch(`${base}/${a._id}`)
      .send({ version: a.version, dueDate: '2020-01-01', assignees: [owner.id] });

    const res = await api(owner).get(`/api/boards/${board._id}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ total: 3, completed: 0, overdue: 1 });
    expect(res.body.byList.map((l) => [l.title, l.count])).toEqual([
      ['To Do', 2],
      ['Done', 1],
    ]);
    expect(res.body.byAssignee[0]).toMatchObject({ name: owner.name, open: 1, done: 0 });
  });
});
