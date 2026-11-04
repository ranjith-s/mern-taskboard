import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';

const RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
const ASSIGNABLE = ['admin', 'member', 'viewer'];

export default function SidePanel(props) {
  const [tab, setTab] = useState('activity');
  return (
    <aside className="side card">
      <div className="tabs">
        {['activity', 'members', 'stats'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'activity' && <Activity {...props} />}
      {tab === 'members' && <Members {...props} />}
      {tab === 'stats' && <Stats {...props} />}
    </aside>
  );
}

/* Cursor pagination: "Load more" passes the last item's id as the cursor. */
function Activity({ baseUrl, tick }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);

  const loadFirst = useCallback(async () => {
    const { data } = await api.get(`${baseUrl}/activity`, { params: { limit: 15 } });
    setItems(data.items);
    setCursor(data.nextCursor);
  }, [baseUrl]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst, tick]);

  async function loadMore() {
    const { data } = await api.get(`${baseUrl}/activity`, { params: { limit: 15, cursor } });
    setItems((prev) => [...prev, ...data.items]);
    setCursor(data.nextCursor);
  }

  return (
    <div>
      {items.length === 0 && <p className="muted">No activity yet.</p>}
      <ul className="activity">
        {items.map((a) => (
          <li key={a._id}>
            <div>{a.message}</div>
            <div className="muted small">{new Date(a.createdAt).toLocaleString('en-IN')}</div>
          </li>
        ))}
      </ul>
      {cursor && <button className="btn ghost" onClick={loadMore}>Load more</button>}
    </div>
  );
}

function Members({ board, myRole, me, baseUrl, onChanged, onDeleted }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const isAdmin = RANK[myRole] >= RANK.admin;
  // Same rule as the server: you can only grant/manage roles below your own.
  const grantable = ASSIGNABLE.filter((r) => myRole === 'owner' || RANK[r] < RANK[myRole]);

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`${baseUrl}/members`, { email, role });
      setEmail('');
    });
  };

  async function leave() {
    if (!confirm('Leave this board?')) return;
    await api.delete(`${baseUrl}/members/${me._id}`);
    onDeleted();
  }

  async function deleteBoard() {
    if (!confirm(`Delete "${board.title}" permanently? This removes all lists and cards.`)) return;
    await api.delete(baseUrl);
    onDeleted();
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <ul className="members">
        {board.members.map(({ user, role: r }) => {
          const canManage = isAdmin && r !== 'owner' && (myRole === 'owner' || RANK[r] < RANK[myRole]);
          return (
            <li key={user._id} className="row spread">
              <span>
                {user.name} {user._id === me._id && <span className="muted">(you)</span>}
                <div className="muted small">{user.email}</div>
              </span>
              {canManage ? (
                <span className="row">
                  <select value={r} onChange={(e) => run(() => api.patch(`${baseUrl}/members/${user._id}`, { role: e.target.value }))}>
                    {grantable.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <button className="icon" title="Remove" onClick={() => run(() => api.delete(`${baseUrl}/members/${user._id}`))}>×</button>
                </span>
              ) : (
                <span className="badge">{r}</span>
              )}
            </li>
          );
        })}
      </ul>

      {isAdmin && (
        <form onSubmit={add} className="stack">
          <input type="email" placeholder="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="row">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {grantable.map((x) => <option key={x}>{x}</option>)}
            </select>
            <button className="btn">Add</button>
          </div>
        </form>
      )}

      <div className="stack danger-zone">
        {myRole === 'owner' ? (
          <button className="btn danger" onClick={deleteBoard}>Delete board</button>
        ) : (
          <button className="btn ghost" onClick={leave}>Leave board</button>
        )}
      </div>
    </div>
  );
}

function Stats({ baseUrl, tick }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get(`${baseUrl}/stats`).then((r) => setStats(r.data));
  }, [baseUrl, tick]);

  if (!stats) return <p className="muted">Loading…</p>;
  const { totals, byList, byAssignee } = stats;
  const max = Math.max(1, ...byList.map((l) => l.count));

  return (
    <div className="stack">
      <div className="kpis">
        <div><b>{totals.total}</b><span className="muted small">cards</span></div>
        <div><b>{totals.completed}</b><span className="muted small">done</span></div>
        <div><b className={totals.overdue ? 'overdue' : ''}>{totals.overdue}</b><span className="muted small">overdue</span></div>
      </div>
      <div>
        <div className="label-title">Cards per list</div>
        {byList.map((l) => (
          <div key={l.listId} className="bar-row">
            <span>{l.title}</span>
            <span className="bar"><span style={{ width: `${(l.count / max) * 100}%` }} /></span>
            <span>{l.count}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="label-title">Workload</div>
        {byAssignee.length === 0 && <p className="muted small">No assigned cards.</p>}
        {byAssignee.map((a) => (
          <div key={a.userId} className="row spread small">
            <span>{a.name}</span>
            <span className="muted">{a.open} open · {a.done} done</span>
          </div>
        ))}
      </div>
    </div>
  );
}
