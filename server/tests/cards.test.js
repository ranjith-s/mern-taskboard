const { api, registerUser, createBoard } = require('./helpers');

describe('Cards', () => {
  let owner, board, lists, base;

  beforeEach(async () => {
    owner = await registerUser();
    ({ board, lists } = await createBoard(owner));
    base = `/api/boards/${board._id}/cards`;
  });

  const create = (title, listIdx = 0) =>
    api(owner).post(base).send({ listId: lists[listIdx]._id, title }).then((r) => r.body.card);

  const titlesIn = async (listIdx) => {
    const res = await api(owner).get(`/api/boards/${board._id}`);
    return res.body.cards
      .filter((c) => c.list === lists[listIdx]._id)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.title);
  };

  test('new cards are appended to the bottom of the list', async () => {
    await create('A');
    await create('B');
    await create('C');
    expect(await titlesIn(0)).toEqual(['A', 'B', 'C']);
  });

  test('moving within a list and across lists', async () => {
    await create('A');
    await create('B');
    const c = await create('C');

    // C to the top of the same list
    await api(owner).post(`${base}/${c._id}/move`).send({ toListId: lists[0]._id, index: 0 }).expect(200);
    expect(await titlesIn(0)).toEqual(['C', 'A', 'B']);

    // C into the middle... of an empty list -> just goes in
    await api(owner).post(`${base}/${c._id}/move`).send({ toListId: lists[1]._id, index: 5 }).expect(200);
    expect(await titlesIn(0)).toEqual(['A', 'B']);
    expect(await titlesIn(1)).toEqual(['C']);
  });

  test('many moves into the same gap trigger a rebalance and keep order correct', async () => {
    await create('A');
    await create('B');
    // Repeatedly insert right after A: the gap halves every time
    for (let i = 0; i < 60; i += 1) {
      const card = await create(`X${i}`);
      await api(owner).post(`${base}/${card._id}/move`).send({ toListId: lists[0]._id, index: 1 });
    }
    const titles = await titlesIn(0);
    expect(titles[0]).toBe('A');
    expect(titles[1]).toBe('X59');
    expect(titles[titles.length - 1]).toBe('B');
  });

  test('optimistic locking: a stale update gets 409 with the latest card', async () => {
    const card = await create('Original');

    // Two users loaded version 0. First save wins...
    const first = await api(owner).patch(`${base}/${card._id}`).send({ version: card.version, title: 'Asha edit' });
    expect(first.status).toBe(200);
    expect(first.body.card.version).toBe(card.version + 1);

    // ...second save with the old version is rejected instead of overwriting.
    const second = await api(owner).patch(`${base}/${card._id}`).send({ version: card.version, title: 'Ravi edit' });
    expect(second.status).toBe(409);
    expect(second.body.details.current.title).toBe('Asha edit');
  });

  test('cannot assign a non-member', async () => {
    const card = await create('Task');
    const stranger = await registerUser();
    const res = await api(owner).patch(`${base}/${card._id}`).send({ version: card.version, assignees: [stranger.id] });
    expect(res.status).toBe(400);
  });

  test('IDOR: a card from another board cannot be touched through my board', async () => {
    const other = await registerUser();
    const otherBoard = await createBoard(other);
    const foreign = (
      await api(other)
        .post(`/api/boards/${otherBoard.board._id}/cards`)
        .send({ listId: otherBoard.lists[0]._id, title: 'Secret' })
    ).body.card;

    // I'm a member of MY board, and try to edit THEIR card via my board's URL
    const res = await api(owner).patch(`${base}/${foreign._id}`).send({ version: 0, title: 'Hacked' });
    expect(res.status).toBe(404);

    // ...or move my card into THEIR list
    const mine = await create('Mine');
    const move = await api(owner).post(`${base}/${mine._id}/move`).send({ toListId: otherBoard.lists[0]._id, index: 0 });
    expect(move.status).toBe(404);
  });

  test('search with filters and offset pagination', async () => {
    for (let i = 1; i <= 25; i += 1) await create(`Fix login bug ${i}`);
    await create('Write docs');

    const page1 = await api(owner).get(`${base}?q=login&limit=10&page=1`);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(10);
    expect(page1.body.total).toBe(25);
    expect(page1.body.totalPages).toBe(3);

    const page3 = await api(owner).get(`${base}?q=login&limit=10&page=3`);
    expect(page3.body.items).toHaveLength(5);

    // Regex special characters are escaped, not executed
    const weird = await api(owner).get(`${base}?q=${encodeURIComponent('.*')}`);
    expect(weird.body.total).toBe(0);
  });

  test('activity feed uses cursor pagination', async () => {
    for (let i = 1; i <= 5; i += 1) await create(`Card ${i}`);
    const url = `/api/boards/${board._id}/activity`;

    const p1 = await api(owner).get(`${url}?limit=3`);
    expect(p1.body.items).toHaveLength(3);
    expect(p1.body.items[0].message).toMatch(/Card 5/); // newest first
    expect(p1.body.nextCursor).toBeTruthy();

    const p2 = await api(owner).get(`${url}?limit=3&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
  });

  test('deleting a list deletes its cards', async () => {
    await create('A');
    await api(owner).delete(`/api/boards/${board._id}/lists/${lists[0]._id}`).expect(204);
    const res = await api(owner).get(`/api/boards/${board._id}`);
    expect(res.body.lists).toHaveLength(2);
    expect(res.body.cards).toHaveLength(0);
  });
});
