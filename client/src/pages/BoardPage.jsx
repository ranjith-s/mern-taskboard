import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import ListColumn from '../components/ListColumn';
import CardModal from '../components/CardModal';
import SidePanel from '../components/SidePanel';
import SearchBox from '../components/SearchBox';

const RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };

export default function BoardPage() {
  const { boardId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null); // { board, lists, cards, myRole }
  const [error, setError] = useState('');
  const [openCardId, setOpenCardId] = useState(null);
  const [newList, setNewList] = useState('');
  const [activityTick, setActivityTick] = useState(0); // bump to make side panels reload

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/boards/${boardId}`);
      setData(res.data);
      setError('');
    } catch (err) {
      if (err.response?.status === 404) navigate('/', { replace: true });
      else setError(errorMessage(err));
    }
  }, [boardId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Realtime: join this board's room and refetch when others change it.
  const reloadTimer = useRef(null);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const join = () => socket.emit('board:join', boardId);
    join();
    socket.on('connect', join); // re-join after a reconnect

    const onEvent = (evt) => {
      if (evt.type === 'board.deleted') return navigate('/', { replace: true });
      if (evt.type === 'member.removed' && evt.data.userId === user._id) return navigate('/', { replace: true });
      // Many events can arrive in a burst (e.g. someone dragging quickly):
      // debounce into a single refetch. Simple and always consistent.
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 150);
    };
    const onActivity = () => setActivityTick((t) => t + 1);

    socket.on('board:event', onEvent);
    socket.on('activity:new', onActivity);
    return () => {
      socket.emit('board:leave', boardId);
      socket.off('connect', join);
      socket.off('board:event', onEvent);
      socket.off('activity:new', onActivity);
      clearTimeout(reloadTimer.current);
    };
  }, [boardId, load, navigate, user._id]);

  const cardsByList = useMemo(() => {
    const map = {};
    for (const list of data?.lists || []) map[list._id] = [];
    for (const card of data?.cards || []) map[card.list]?.push(card);
    for (const id of Object.keys(map)) map[id].sort((a, b) => a.position - b.position);
    return map;
  }, [data]);

  if (error) return <p className="error page">{error}</p>;
  if (!data) return <p className="center muted">Loading board…</p>;

  const { board, lists, myRole } = data;
  const canEdit = RANK[myRole] >= RANK.member;
  const base = `/boards/${boardId}`;
  const afterChange = () => {
    load();
    setActivityTick((t) => t + 1);
  };

  // Optimistic UI for drag & drop: move the card locally first, then call
  // the API. If the API fails, reload to get back to the server's truth.
  async function moveCard(cardId, toListId, index) {
    setData((d) => {
      const target = d.cards.filter((c) => c.list === toListId && c._id !== cardId).sort((a, b) => a.position - b.position);
      const before = target[index - 1]?.position;
      const after = target[index]?.position;
      const position = before == null ? (after == null ? 1024 : after / 2) : after == null ? before + 1024 : (before + after) / 2;
      return { ...d, cards: d.cards.map((c) => (c._id === cardId ? { ...c, list: toListId, position } : c)) };
    });
    try {
      await api.post(`${base}/cards/${cardId}/move`, { toListId, index });
      setActivityTick((t) => t + 1);
    } catch (err) {
      alert(errorMessage(err));
      load();
    }
  }

  async function addList(e) {
    e.preventDefault();
    await api.post(`${base}/lists`, { title: newList });
    setNewList('');
    afterChange();
  }

  const openCard = data.cards.find((c) => c._id === openCardId);

  return (
    <div className="board-page">
      <div className="board-header">
        <div>
          <h1>{board.title}</h1>
          {board.description && <p className="muted">{board.description}</p>}
        </div>
        <SearchBox boardId={boardId} members={board.members} onOpen={setOpenCardId} />
        <span className="badge">{myRole}</span>
      </div>

      <div className="board-body">
        <div className="lists">
          {lists.map((list) => (
            <ListColumn
              key={list._id}
              list={list}
              cards={cardsByList[list._id]}
              canEdit={canEdit}
              baseUrl={base}
              onChanged={afterChange}
              onMoveCard={moveCard}
              onOpenCard={setOpenCardId}
            />
          ))}
          {canEdit && (
            <form className="list add-list" onSubmit={addList}>
              <input placeholder="+ Add a list" value={newList} onChange={(e) => setNewList(e.target.value)} required />
            </form>
          )}
        </div>
        <SidePanel
          board={board}
          myRole={myRole}
          me={user}
          baseUrl={base}
          tick={activityTick}
          onChanged={afterChange}
          onDeleted={() => navigate('/', { replace: true })}
        />
      </div>

      {openCard && (
        <CardModal
          card={openCard}
          members={board.members}
          canEdit={canEdit}
          baseUrl={base}
          onClose={() => setOpenCardId(null)}
          onChanged={afterChange}
        />
      )}
    </div>
  );
}
